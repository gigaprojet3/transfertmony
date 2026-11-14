export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-10">
      <span className="font-display text-2xl font-bold tracking-tight">
        Transfert<span className="text-malachite">Mony</span>
      </span>
      <div className="ticket-in mt-8 w-full max-w-md rounded-[var(--radius-ticket)] bg-surface p-6 shadow-sm sm:p-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-ink-soft">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-6 text-sm text-ink-soft">{footer}</div>}
    </main>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base outline-none focus:border-malachite";

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}
