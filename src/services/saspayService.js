import crypto from "node:crypto";

/**
 * Client SasPay (agrégateur Mobile Money).
 *
 * ⚠️ À ADAPTER À LA DOCUMENTATION OFFICIELLE SASPAY :
 *   - chemins des endpoints (variables SASPAY_*_PATH),
 *   - noms des champs du corps de requête et de la réponse,
 *   - schéma de signature des requêtes et des webhooks,
 *   - codes opérateurs (OPERATOR_CODES).
 * Tout ce qui dépend du format SasPay est regroupé dans ce fichier : le reste de l'application
 * ne manipule que les objets normalisés renvoyés ici.
 *
 * Classification des erreurs (essentielle pour l'argent) :
 *   - REJECTED : SasPay a refusé la requête → aucun mouvement de fonds, on peut marquer « Échoué ».
 *   - UNKNOWN  : timeout, réseau, 5xx → le résultat est INCERTAIN. Ne jamais conclure à un échec :
 *                on attend le webhook ou la réconciliation (getTransactionStatus).
 *   - CONFIG   : clés absentes / mauvaise configuration.
 */

export class SasPayError extends Error {
  constructor(message, { kind, httpStatus, providerCode, raw } = {}) {
    super(message);
    this.name = "SasPayError";
    this.kind = kind; // "REJECTED" | "UNKNOWN" | "CONFIG"
    this.httpStatus = httpStatus;
    this.providerCode = providerCode;
    this.raw = raw;
  }
}

// Codes opérateurs internes -> codes attendus par SasPay. À ADAPTER.
const OPERATOR_CODES = {
  MTN: "MTN",
  AIRTEL: "AIRTEL",
  ORANGE: "ORANGE",
  WAVE: "WAVE",
  MPESA: "MPESA",
  MOOV: "MOOV",
  FREE: "FREE",
  TELECEL: "TELECEL",
};

function getConfig() {
  const cfg = {
    baseUrl: process.env.SASPAY_BASE_URL?.replace(/\/$/, ""),
    apiKey: process.env.SASPAY_API_KEY,
    secretKey: process.env.SASPAY_SECRET_KEY,
    webhookSecret: process.env.SASPAY_WEBHOOK_SECRET || process.env.SASPAY_SECRET_KEY,
    collectPath: process.env.SASPAY_COLLECT_PATH || "/v1/collections",
    payoutPath: process.env.SASPAY_PAYOUT_PATH || "/v1/payouts",
    statusPath: process.env.SASPAY_STATUS_PATH || "/v1/transactions",
    timeoutMs: Number(process.env.SASPAY_TIMEOUT_MS || 20_000),
    callbackUrl: `${process.env.APP_URL ?? ""}/api/webhooks/saspay`,
  };
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.secretKey) {
    throw new SasPayError("Configuration SasPay incomplète (SASPAY_BASE_URL, SASPAY_API_KEY, SASPAY_SECRET_KEY).", {
      kind: "CONFIG",
    });
  }
  return cfg;
}

const hmacHex = (secret, data) => crypto.createHmac("sha256", secret).update(data).digest("hex");

function safeEqualHex(a, b) {
  const bufA = Buffer.from(String(a), "utf8");
  const bufB = Buffer.from(String(b), "utf8");
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/** Normalise les statuts SasPay vers SUCCESS | FAILED | PENDING. À ADAPTER si besoin. */
export function normalizeStatus(raw) {
  const s = String(raw ?? "").toUpperCase();
  if (["SUCCESS", "SUCCESSFUL", "SUCCEEDED", "COMPLETED", "PAID"].includes(s)) return "SUCCESS";
  if (["FAILED", "FAILURE", "REJECTED", "CANCELLED", "CANCELED", "EXPIRED", "DECLINED"].includes(s)) return "FAILED";
  return "PENDING";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Appel HTTP signé. Les nouvelles tentatives ne concernent que les erreurs UNKNOWN et sont sûres
 * UNIQUEMENT parce que chaque appel porte une clé d'idempotence stable (SasPay ne doit pas
 * exécuter deux fois la même opération).
 */
async function saspayRequest(method, path, body, { idempotencyKey, retries = 2 } = {}) {
  const cfg = getConfig();
  const payload = body ? JSON.stringify(body) : "";
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** attempt);

    const timestamp = Math.floor(Date.now() / 1000).toString();
    // Schéma de signature générique HMAC-SHA256. À ADAPTER au schéma SasPay.
    const signature = hmacHex(cfg.secretKey, `${timestamp}.${method}.${path}.${payload}`);

    let res;
    try {
      res = await fetch(`${cfg.baseUrl}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
          "X-SasPay-Timestamp": timestamp,
          "X-SasPay-Signature": signature,
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: payload || undefined,
        signal: AbortSignal.timeout(cfg.timeoutMs),
        cache: "no-store",
      });
    } catch (err) {
      lastError = new SasPayError(`SasPay injoignable : ${err.message}`, { kind: "UNKNOWN" });
      continue;
    }

    const data = await res.json().catch(() => ({}));

    if (res.ok) return data;

    const providerCode = data?.code ?? data?.error_code;
    const message = data?.message ?? data?.error ?? `HTTP ${res.status}`;

    // 5xx, 408, 429 : résultat incertain, on peut retenter. 409 : opération déjà soumise
    // avec cette clé d'idempotence → l'état réel sera confirmé par webhook / réconciliation.
    if (res.status >= 500 || [408, 409, 425, 429].includes(res.status)) {
      lastError = new SasPayError(`SasPay : ${message}`, { kind: "UNKNOWN", httpStatus: res.status, providerCode, raw: data });
      if (res.status === 409) break;
      continue;
    }

    // Autres 4xx : refus définitif (numéro invalide, solde insuffisant, paramètres…).
    throw new SasPayError(`SasPay a refusé l'opération : ${message}`, {
      kind: "REJECTED",
      httpStatus: res.status,
      providerCode,
      raw: data,
    });
  }

  throw lastError;
}

function toOperatorCode(op) {
  const code = OPERATOR_CODES[op];
  if (!code) throw new SasPayError(`Opérateur non pris en charge : ${op}`, { kind: "REJECTED" });
  return code;
}

function normalizeResult(data) {
  return {
    providerRef: data?.transaction_id ?? data?.id ?? data?.reference ?? null,
    status: normalizeStatus(data?.status),
    raw: data,
  };
}

/**
 * Encaissement (pay-in) : débite le compte Mobile Money de l'expéditeur.
 * Le plus souvent asynchrone : l'expéditeur valide sur son téléphone (USSD push),
 * puis SasPay notifie le résultat par webhook.
 */
export async function collectMoney({ reference, amount, currency, phone, operator, country, description }) {
  const data = await saspayRequest(
    "POST",
    getConfig().collectPath,
    {
      reference,
      amount: amount.toString(), // chaîne : pas d'arrondi flottant
      currency,
      phone_number: phone,
      operator: toOperatorCode(operator),
      country,
      description: description ?? `TransfertMony ${reference}`,
      callback_url: getConfig().callbackUrl,
    },
    { idempotencyKey: `${reference}:collect` }
  );
  return normalizeResult(data);
}

/** Décaissement (pay-out) : crédite le compte Mobile Money du destinataire. */
export async function sendMoney({ reference, amount, currency, phone, operator, country, recipientName, description }) {
  const data = await saspayRequest(
    "POST",
    getConfig().payoutPath,
    {
      reference,
      amount: amount.toString(),
      currency,
      phone_number: phone,
      operator: toOperatorCode(operator),
      country,
      beneficiary_name: recipientName,
      description: description ?? `TransfertMony ${reference}`,
      callback_url: getConfig().callbackUrl,
    },
    { idempotencyKey: `${reference}:payout` }
  );
  return normalizeResult(data);
}

/** Interroge l'état d'une opération (utilisé par la réconciliation). kind : "collect" | "payout". */
export async function getTransactionStatus(kind, reference) {
  const data = await saspayRequest("GET", `${getConfig().statusPath}/${encodeURIComponent(`${reference}:${kind}`)}`, null);
  return {
    ...normalizeResult(data),
    amount: data?.amount != null ? String(data.amount) : null,
    currency: data?.currency ?? null,
    failureReason: data?.failure_reason ?? data?.message ?? null,
  };
}

/**
 * Vérifie la signature d'un webhook sur le CORPS BRUT (jamais sur un JSON re-sérialisé).
 * Schéma attendu (À ADAPTER) : signature = HMAC_SHA256(secret, `${timestamp}.${rawBody}`) en hex.
 * Rejette les webhooks de plus de 5 minutes (anti-rejeu).
 */
export function verifyWebhookSignature(rawBody, headers) {
  const { webhookSecret } = getConfig();
  const signature = headers.get(process.env.SASPAY_WEBHOOK_SIGNATURE_HEADER || "x-saspay-signature");
  const timestamp = headers.get(process.env.SASPAY_WEBHOOK_TIMESTAMP_HEADER || "x-saspay-timestamp");
  if (!signature) return false;

  if (timestamp) {
    const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;
    return safeEqualHex(signature, hmacHex(webhookSecret, `${timestamp}.${rawBody}`));
  }
  return safeEqualHex(signature, hmacHex(webhookSecret, rawBody));
}

/** Convertit le webhook SasPay en événement normalisé. À ADAPTER aux noms de champs réels. */
export function parseWebhookEvent(payload, rawBody) {
  const data = payload?.data ?? payload;
  const rawRef = String(data?.reference ?? data?.merchant_reference ?? "");
  // Nos références sont envoyées sous la forme TM-XXXX ; certaines API renvoient la clé TM-XXXX:collect.
  const [reference, suffix] = rawRef.split(":");
  const typeHint = String(payload?.event ?? data?.type ?? suffix ?? "").toLowerCase();

  return {
    eventId: String(payload?.event_id ?? payload?.id ?? crypto.createHash("sha256").update(rawBody).digest("hex")),
    type: typeHint.includes("payout") || typeHint.includes("disburse") ? "PAYOUT" : "COLLECTION",
    reference,
    providerRef: data?.transaction_id ?? data?.id ?? null,
    status: normalizeStatus(data?.status),
    amount: data?.amount != null ? String(data.amount) : null,
    currency: data?.currency ?? null,
    failureReason: data?.failure_reason ?? data?.message ?? null,
  };
}
