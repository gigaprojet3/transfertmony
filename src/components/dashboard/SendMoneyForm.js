"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, formatMoney, formatPhone, OPERATOR_LABELS } from "@/lib/client";
import PinDialog from "./PinDialog";

const digits = (v) => v.replace(/\D/g, "");
const stripDial = (number, dial) => (number?.startsWith(dial) ? number.slice(dial.length) : "");

/**
 * Le « ticket » de transfert : en haut ce que l'on envoie, en bas ce que le destinataire reçoit.
 * Le devis affiché vient du serveur ; il est recalculé de nouveau au moment de l'envoi.
 */
export default function SendMoneyForm({ user, countries, recipientHandle, onClearHandle, onCreated }) {
  const byCode = Object.fromEntries(countries.map((c) => [c.countryCode, c]));
  const sendable = countries.filter((c) => c.canSend);
  const receivable = countries.filter((c) => c.canReceive);

  const [fromCountry, setFromCountry] = useState(byCode[user.countryCode]?.canSend ? user.countryCode : sendable[0]?.countryCode);
  const [toCountry, setToCountry] = useState(receivable.find((c) => c.countryCode !== user.countryCode)?.countryCode);
  const [amount, setAmount] = useState("");
  const [senderOperator, setSenderOperator] = useState(user.momoOperator);
  const [senderLocal, setSenderLocal] = useState(stripDial(user.momoNumber, byCode[user.countryCode]?.dialCode ?? ""));
  const [recipientLocal, setRecipientLocal] = useState("");
  const [recipientOperator, setRecipientOperator] = useState("");
  const [recipientName, setRecipientName] = useState("");

  const [linked, setLinked] = useState(null); // destinataire résolu via lien de réception
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const attempt = useRef(null); // { key, fingerprint } : clé d'idempotence de la tentative en cours

  const from = byCode[fromCountry];
  const destCode = linked?.countryCode ?? toCountry;
  const to = byCode[destCode];
  const recipientOps = to?.operators ?? [];
  const effectiveRecipientOp = recipientOps.includes(recipientOperator) ? recipientOperator : recipientOps[0] ?? "";

  // Destinataire passé par lien (?to=handle)
  useEffect(() => {
    if (!recipientHandle) return;
    let cancelled = false;
    api(`/api/users/lookup?handle=${encodeURIComponent(recipientHandle)}`)
      .then(({ recipient }) => !cancelled && setLinked(recipient))
      .catch((err) => {
        if (cancelled) return;
        setFormError(err.message);
        onClearHandle();
      });
    return () => {
      cancelled = true;
    };
  }, [recipientHandle, onClearHandle]);

  // Simulateur : devis serveur, avec anti-rebond
  useEffect(() => {
    if (!fromCountry || !destCode || !amount || Number(amount) <= 0) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { quote } = await api(`/api/transfer/quote?from=${fromCountry}&to=${destCode}&amount=${encodeURIComponent(amount)}`);
        if (!cancelled) {
          setQuote(quote);
          setQuoteError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setQuote(null);
          setQuoteError(err.message);
        }
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [fromCountry, destCode, amount]);

  const hasAmount = amount && Number(amount) > 0;
  const shownQuote = hasAmount ? quote : null;

  const changeFrom = (code) => {
    setFromCountry(code);
    const c = byCode[code];
    if (!c.operators.includes(senderOperator)) setSenderOperator(c.operators[0]);
    setSenderLocal(code === user.countryCode ? stripDial(user.momoNumber, c.dialCode) : "");
  };

  const fingerprint = JSON.stringify([fromCountry, destCode, amount, senderOperator, senderLocal, recipientLocal, effectiveRecipientOp, linked?.handle]);

  const openPin = (e) => {
    e.preventDefault();
    setFormError(null);
    setSuccess(null);
    if (!shownQuote) return setFormError(quoteError ?? "Indiquez un montant valide.");
    if (digits(senderLocal).length < 6) return setFormError("Indiquez le numéro Mobile Money à débiter.");
    if (!linked && digits(recipientLocal).length < 6) return setFormError("Indiquez le numéro du destinataire.");
    // Nouvelle clé seulement si le transfert a changé : une relance réutilise la même clé (pas de double débit).
    if (!attempt.current || attempt.current.fingerprint !== fingerprint) {
      attempt.current = { key: crypto.randomUUID(), fingerprint };
    }
    setPinError(null);
    setPinOpen(true);
  };

  const closePin = useCallback(() => setPinOpen(false), []);

  const confirm = async (pin) => {
    setSubmitting(true);
    setPinError(null);
    try {
      const body = {
        fromCountry,
        amount,
        senderOperator,
        senderPhone: from.dialCode + digits(senderLocal),
        pin,
        ...(linked
          ? { recipientHandle: linked.handle }
          : {
              toCountry: destCode,
              recipientPhone: to.dialCode + digits(recipientLocal),
              recipientOperator: effectiveRecipientOp,
              recipientName: recipientName.trim() || undefined,
            }),
      };
      const { transaction } = await api("/api/transfer/initiate", {
        method: "POST",
        body,
        headers: { "Idempotency-Key": attempt.current.key },
      });
      attempt.current = null;
      setPinOpen(false);
      setSuccess(transaction);
      setAmount("");
      setQuote(null);
      onCreated?.(transaction);
    } catch (err) {
      if (err.code === "INVALID_PIN") {
        const left = err.details?.remainingAttempts;
        setPinError(`Code PIN incorrect.${left != null ? ` ${left} essai(s) restant(s).` : ""}`);
      } else if (err.code === "PIN_LOCKED") {
        setPinError(err.message);
      } else if (err.code === "NETWORK" || err.status >= 500) {
        // La même clé d'idempotence sera renvoyée : réessayer ne débitera pas deux fois.
        setPinError(`${err.message} Vous pouvez réessayer sans risque de double débit.`);
      } else {
        setPinOpen(false);
        setFormError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fieldLight =
    "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base outline-none focus:border-malachite";
  const fieldDark =
    "w-full rounded-xl border border-white/15 bg-white/[0.07] px-3 py-2.5 text-base text-white outline-none placeholder:text-white/40 focus:border-saffron [&>option]:text-ink";

  return (
    <section aria-labelledby="send-title">
      <h2 id="send-title" className="sr-only">
        Envoyer de l&apos;argent
      </h2>

      <form onSubmit={openPin} className="ticket-in overflow-hidden rounded-[var(--radius-ticket)] bg-surface shadow-sm">
        {/* --- Ce que j'envoie --- */}
        <div className="space-y-4 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="amount" className="text-sm text-ink-soft">
              Vous envoyez
            </label>
            <select
              aria-label="Pays d'envoi"
              value={fromCountry}
              onChange={(e) => changeFrom(e.target.value)}
              className="rounded-full border border-line bg-mist px-3 py-1.5 text-sm font-medium outline-none"
            >
              {sendable.map((c) => (
                <option key={c.countryCode} value={c.countryCode}>
                  {c.name} ({c.currency})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-baseline gap-2 border-b-2 border-ink pb-2 focus-within:border-malachite">
            <input
              id="amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="tabular min-w-0 flex-1 bg-transparent font-display text-5xl font-semibold tracking-tight outline-none placeholder:text-line"
            />
            <span className="font-display text-xl font-medium text-ink-soft">{from?.currency === "XAF" || from?.currency === "XOF" ? "FCFA" : from?.currency}</span>
          </div>

          <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-2">
            <select
              aria-label="Opérateur à débiter"
              value={senderOperator}
              onChange={(e) => setSenderOperator(e.target.value)}
              className={fieldLight}
            >
              {from?.operators.map((op) => (
                <option key={op} value={op}>
                  {OPERATOR_LABELS[op] ?? op}
                </option>
              ))}
            </select>
            <div className={`${fieldLight} flex items-center gap-1 focus-within:border-malachite`}>
              <span className="text-ink-soft">+{from?.dialCode}</span>
              <input
                aria-label="Numéro Mobile Money à débiter"
                inputMode="tel"
                autoComplete="tel-national"
                value={senderLocal}
                onChange={(e) => setSenderLocal(e.target.value)}
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </div>
          </div>
        </div>

        {/* --- La route entre les deux pays --- */}
        <div className="relative bg-ink px-5 pt-5 sm:px-6" aria-live="polite">
          <span aria-hidden="true" className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-mist" />
          <span aria-hidden="true" className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-mist" />
          <div className="flex items-center gap-3 text-sm text-white/70">
            <span className="font-display font-semibold text-white">{fromCountry}</span>
            <span aria-hidden="true" className="h-0.5 flex-1 rounded bg-saffron" />
            <span className="tabular">
              {shownQuote
                ? `1 ${shownQuote.sendCurrency} = ${Number(shownQuote.exchangeRate).toLocaleString("fr-FR", { maximumFractionDigits: 6 })} ${shownQuote.receiveCurrency}`
                : "Taux du jour"}
            </span>
            <span aria-hidden="true" className="h-0.5 flex-1 rounded bg-saffron" />
            <span className="font-display font-semibold text-white">{destCode}</span>
          </div>
        </div>

        {/* --- Ce que reçoit le destinataire --- */}
        <div className="space-y-4 bg-ink p-5 pt-4 text-white sm:p-6 sm:pt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-white/70">{linked ? `${linked.name} reçoit` : "Votre destinataire reçoit"}</span>
            {!linked && (
              <select
                aria-label="Pays de réception"
                value={toCountry}
                onChange={(e) => setToCountry(e.target.value)}
                className="rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-sm font-medium text-white outline-none [&>option]:text-ink"
              >
                {receivable.map((c) => (
                  <option key={c.countryCode} value={c.countryCode}>
                    {c.name} ({c.currency})
                  </option>
                ))}
              </select>
            )}
          </div>

          <p className="tabular font-display text-5xl font-semibold tracking-tight">
            {shownQuote ? formatMoney(shownQuote.receiveAmount, shownQuote.receiveCurrency) : <span className="text-white/30">—</span>}
          </p>
          {quoteError && hasAmount && <p className="text-sm text-saffron">{quoteError}</p>}

          {linked ? (
            <div className="flex items-center justify-between rounded-xl bg-white/[0.07] px-4 py-3">
              <div>
                <p className="font-medium">{linked.name}</p>
                <p className="text-sm text-white/60">
                  {OPERATOR_LABELS[linked.operator] ?? linked.operator}, {linked.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLinked(null);
                  onClearHandle();
                }}
                className="text-sm text-saffron underline-offset-4 hover:underline"
              >
                Changer
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-2">
                <select
                  aria-label="Opérateur du destinataire"
                  value={effectiveRecipientOp}
                  onChange={(e) => setRecipientOperator(e.target.value)}
                  className={fieldDark}
                >
                  {recipientOps.map((op) => (
                    <option key={op} value={op}>
                      {OPERATOR_LABELS[op] ?? op}
                    </option>
                  ))}
                </select>
                <div className={`${fieldDark} flex items-center gap-1 focus-within:border-saffron`}>
                  <span className="text-white/50">+{to?.dialCode}</span>
                  <input
                    aria-label="Numéro Mobile Money du destinataire"
                    inputMode="tel"
                    placeholder="Numéro"
                    value={recipientLocal}
                    onChange={(e) => setRecipientLocal(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-white/40"
                  />
                </div>
              </div>
              <input
                aria-label="Nom du destinataire"
                placeholder="Nom du destinataire (facultatif)"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className={fieldDark}
              />
            </div>
          )}

          <dl className="tabular space-y-1.5 border-t border-white/10 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-white/60">Frais de transfert</dt>
              <dd>{shownQuote ? formatMoney(shownQuote.fee, shownQuote.sendCurrency) : "—"}</dd>
            </div>
            <div className="flex justify-between text-base">
              <dt className="text-white/80">Total débité</dt>
              <dd className="font-semibold">{shownQuote ? formatMoney(shownQuote.totalDebit, shownQuote.sendCurrency) : "—"}</dd>
            </div>
          </dl>

          {formError && (
            <p role="alert" className="rounded-lg bg-clay-wash px-3 py-2 text-sm text-clay">
              {formError}
            </p>
          )}
          {success && (
            <p role="status" className="rounded-lg bg-malachite-wash px-3 py-2 text-sm text-malachite-deep">
              Transfert {success.reference} créé. Validez le paiement de {formatMoney(success.totalDebit, success.sendCurrency)} sur
              votre téléphone : nous envoyons les fonds dès sa confirmation.
            </p>
          )}

          <button
            type="submit"
            disabled={!shownQuote}
            className="w-full rounded-full bg-malachite px-5 py-4 text-lg font-semibold text-white transition-colors hover:bg-malachite-deep disabled:bg-white/10 disabled:text-white/40"
          >
            {shownQuote ? `Envoyer ${formatMoney(shownQuote.totalDebit, shownQuote.sendCurrency)}` : "Envoyer"}
          </button>
        </div>
      </form>

      <PinDialog
        key={pinOpen ? "open" : "closed"}
        open={pinOpen}
        submitting={submitting}
        error={pinError}
        onClose={closePin}
        onConfirm={confirm}
        summary={
          shownQuote &&
          `Vous autorisez le débit de ${formatMoney(shownQuote.totalDebit, shownQuote.sendCurrency)} sur le ${formatPhone(
            (from?.dialCode ?? "") + digits(senderLocal)
          )}. ${linked ? linked.name : "Le destinataire"} recevra ${formatMoney(shownQuote.receiveAmount, shownQuote.receiveCurrency)}.`
        }
      />
    </section>
  );
}
