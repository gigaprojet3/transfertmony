"use client";

import { useEffect, useRef, useState } from "react";

/** Saisie du code PIN à 4 chiffres avant chaque envoi. */
export default function PinDialog({ open, summary, submitting, error, onConfirm, onClose }) {
  const [pin, setPin] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && !submitting && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    if (pin.length === 4 && !submitting) onConfirm(pin);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="pin-title"
        onSubmit={submit}
        className="ticket-in w-full max-w-sm rounded-t-[var(--radius-ticket)] bg-surface p-6 pb-8 sm:rounded-[var(--radius-ticket)]"
      >
        <h2 id="pin-title" className="font-display text-2xl font-semibold">
          Confirmez avec votre code PIN
        </h2>
        <p className="mt-2 text-sm text-ink-soft">{summary}</p>

        <label className="relative mt-6 block cursor-text" onClick={() => inputRef.current?.focus()}>
          <span className="sr-only">Code PIN à 4 chiffres</span>
          <input
            ref={inputRef}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            autoComplete="off"
            type="password"
            maxLength={4}
            className="absolute inset-0 opacity-0"
            disabled={submitting}
          />
          <span className="flex justify-center gap-3" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`flex h-14 w-12 items-center justify-center rounded-xl border-2 text-2xl transition-colors ${
                  i < pin.length ? "border-malachite bg-malachite-wash" : i === pin.length ? "border-ink" : "border-line"
                }`}
              >
                {i < pin.length ? "•" : ""}
              </span>
            ))}
          </span>
        </label>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-clay-wash px-3 py-2 text-sm text-clay">
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-full border border-line px-4 py-3 font-medium hover:bg-mist disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={pin.length !== 4 || submitting}
            className="flex-[2] rounded-full bg-malachite px-4 py-3 font-semibold text-white hover:bg-malachite-deep disabled:opacity-40"
          >
            {submitting ? "Envoi en cours…" : "Confirmer l'envoi"}
          </button>
        </div>
      </form>
    </div>
  );
}
