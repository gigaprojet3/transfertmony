"use client";

import { useState } from "react";
import { formatPhone, OPERATOR_LABELS } from "@/lib/client";

/** Numéro et lien de réception personnels de l'utilisateur. */
export default function ReceiveCard({ user }) {
  const [copied, setCopied] = useState(false);
  const link = user.receiveLink || `${window.location.origin}/dashboard?to=${user.receiveHandle}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* presse-papiers indisponible : le lien reste sélectionnable */
    }
  };

  const share = () =>
    navigator.share?.({ title: "TransfertMony", text: `Envoie-moi de l'argent sur TransfertMony`, url: link }).catch(() => {});

  return (
    <section aria-labelledby="receive-title" className="rounded-3xl bg-surface p-5 shadow-sm">
      <h2 id="receive-title" className="font-display text-xl font-semibold">
        Recevoir de l&apos;argent
      </h2>
      <p className="mt-1 text-sm text-ink-soft">Les fonds arrivent directement sur votre Mobile Money.</p>

      <p className="tabular mt-4 font-display text-2xl font-semibold tracking-tight">{formatPhone(user.momoNumber)}</p>
      <p className="text-sm text-ink-soft">{OPERATOR_LABELS[user.momoOperator] ?? user.momoOperator}</p>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-mist px-3 py-2">
        <span className="min-w-0 flex-1 select-all truncate text-sm">{link}</span>
        <button type="button" onClick={copy} className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-ink/85">
          {copied ? "Copié" : "Copier"}
        </button>
        {typeof navigator !== "undefined" && navigator.share && (
          <button type="button" onClick={share} className="shrink-0 rounded-full border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface">
            Partager
          </button>
        )}
      </div>
    </section>
  );
}
