"use client";

import { useState } from "react";
import { formatDate, formatMoney, OPERATOR_LABELS } from "@/lib/client";

const TABS = [
  { id: "ALL", label: "Tous" },
  { id: "SENT", label: "Envoyés" },
  { id: "RECEIVED", label: "Reçus" },
];

const TONES = {
  pending: "bg-amber-wash text-amber",
  progress: "bg-malachite-wash text-malachite-deep",
  success: "bg-malachite text-white",
  danger: "bg-clay-wash text-clay",
  neutral: "bg-mist text-ink-soft",
};

function DirectionIcon({ direction }) {
  const sent = direction === "SENT";
  return (
    <span
      aria-hidden="true"
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${sent ? "bg-ink text-white" : "bg-saffron text-ink"}`}
    >
      <svg viewBox="0 0 20 20" className={`h-4 w-4 ${sent ? "" : "rotate-180"}`} fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M6 14 14 6M7 6h7v7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Row({ tx }) {
  const [open, setOpen] = useState(false);
  const sent = tx.direction === "SENT";
  const name = tx.counterparty.name ?? tx.counterparty.phone;

  return (
    <li className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-mist/60 sm:px-5"
      >
        <DirectionIcon direction={tx.direction} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{sent ? `À ${name}` : `De ${name}`}</span>
          <span className="block text-sm text-ink-soft">
            {formatDate(tx.createdAt)}, {tx.fromCountry} vers {tx.toCountry}
          </span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <span className={`tabular font-display text-lg font-semibold ${sent ? "" : "text-malachite-deep"}`}>
            {sent ? `−${formatMoney(tx.totalDebit, tx.sendCurrency)}` : `+${formatMoney(tx.receiveAmount, tx.receiveCurrency)}`}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tx.statusTone]}`}>{tx.statusLabel}</span>
        </span>
      </button>

      {open && (
        <dl className="tabular grid grid-cols-2 gap-x-4 gap-y-2 bg-mist/60 px-4 py-4 text-sm sm:px-5">
          <dt className="text-ink-soft">Statut</dt>
          <dd className="text-right">{tx.statusHint}</dd>
          <dt className="text-ink-soft">Référence</dt>
          <dd className="text-right font-medium">{tx.reference}</dd>
          <dt className="text-ink-soft">{sent ? "Destinataire" : "Expéditeur"}</dt>
          <dd className="text-right">
            {tx.counterparty.phone}, {OPERATOR_LABELS[tx.counterparty.operator] ?? tx.counterparty.operator}
          </dd>
          {sent && (
            <>
              <dt className="text-ink-soft">Montant envoyé</dt>
              <dd className="text-right">{formatMoney(tx.sendAmount, tx.sendCurrency)}</dd>
              <dt className="text-ink-soft">Frais</dt>
              <dd className="text-right">{formatMoney(tx.fee, tx.sendCurrency)}</dd>
            </>
          )}
          <dt className="text-ink-soft">Montant reçu</dt>
          <dd className="text-right font-medium">{formatMoney(tx.receiveAmount, tx.receiveCurrency)}</dd>
          {tx.sendCurrency !== tx.receiveCurrency && (
            <>
              <dt className="text-ink-soft">Taux appliqué</dt>
              <dd className="text-right">
                1 {tx.sendCurrency} = {Number(tx.exchangeRate).toLocaleString("fr-FR", { maximumFractionDigits: 6 })} {tx.receiveCurrency}
              </dd>
            </>
          )}
          {tx.failureReason && (
            <>
              <dt className="text-ink-soft">Motif</dt>
              <dd className="text-right text-clay">{tx.failureReason}</dd>
            </>
          )}
        </dl>
      )}
    </li>
  );
}

export default function TransactionHistory({ transactions, loading, error }) {
  const [tab, setTab] = useState("ALL");
  const list = tab === "ALL" ? transactions : transactions.filter((t) => t.direction === tab);

  return (
    <section aria-labelledby="history-title" className="overflow-hidden rounded-3xl bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-5 sm:px-5">
        <h2 id="history-title" className="font-display text-xl font-semibold">
          Historique
        </h2>
        <div role="tablist" aria-label="Filtrer l'historique" className="flex rounded-full bg-mist p-1 text-sm">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-3.5 py-1.5 font-medium transition-colors ${
                tab === t.id ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="px-5 pb-4 text-sm text-clay">{error}</p>}
      {loading && !transactions.length ? (
        <p className="px-5 pb-6 text-sm text-ink-soft">Chargement…</p>
      ) : list.length === 0 ? (
        <p className="px-5 pb-8 pt-2 text-ink-soft">
          {tab === "RECEIVED" ? "Vous n'avez encore rien reçu. Partagez votre lien de réception." : "Aucun transfert pour le moment."}
        </p>
      ) : (
        <ul>
          {list.map((tx) => (
            <Row key={tx.id} tx={tx} />
          ))}
        </ul>
      )}
    </section>
  );
}
