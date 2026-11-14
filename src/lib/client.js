// Utilitaires côté navigateur (aucune dépendance serveur).

export class ApiError extends Error {
  constructor(status, { code, message, details } = {}) {
    super(message ?? "Erreur réseau");
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api(path, { method = "GET", body, headers } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, { code: "NETWORK", message: "Connexion impossible. Vérifiez votre réseau puis réessayez." });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error);
  return data;
}

/** Affichage uniquement : les calculs d'argent sont faits côté serveur en Decimal. */
export function formatMoney(amount, currency) {
  if (amount == null || amount === "") return "";
  const n = Number(amount);
  const decimals = ["XAF", "XOF", "UGX", "RWF"].includes(currency) ? 0 : 2;
  const formatted = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(n);
  const symbol = currency === "XAF" || currency === "XOF" ? "FCFA" : currency;
  return `${formatted} ${symbol}`;
}

export function formatPhone(digits) {
  if (!digits) return "";
  return `+${digits.replace(/(\d{3})(\d{2})(\d{3})(\d+)/, "$1 $2 $3 $4")}`;
}

export function formatDate(iso) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

export const ACTIVE_STATUSES = ["PENDING", "COLLECTING", "COLLECTED", "PAYOUT_PROCESSING"];

export const OPERATOR_LABELS = {
  MTN: "MTN MoMo",
  AIRTEL: "Airtel Money",
  ORANGE: "Orange Money",
  WAVE: "Wave",
  MPESA: "M-Pesa",
  MOOV: "Moov Money",
  FREE: "Free Money",
  TELECEL: "Telecel Cash",
};
