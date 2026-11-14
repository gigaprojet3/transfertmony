"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, OPERATOR_LABELS } from "@/lib/client";
import { Field, inputClass } from "./AuthShell";

const digits = (v) => v.replace(/\D/g, "");

export default function RegisterForm() {
  const router = useRouter();
  const [countries, setCountries] = useState([]);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    countryCode: "",
    phone: "",
    momoOperator: "",
    momoSame: true,
    momoNumber: "",
    password: "",
    pin: "",
  });
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api("/api/rates")
      .then(({ countries }) => setCountries(countries))
      .catch((err) => setError(err.message));
  }, []);

  const country = countries.find((c) => c.countryCode === form.countryCode) ?? countries[0];
  const operator = country?.operators.includes(form.momoOperator) ? form.momoOperator : country?.operators[0] ?? "";
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const phone = country.dialCode + digits(form.phone);
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          countryCode: country.countryCode,
          phone,
          momoNumber: form.momoSame ? phone : country.dialCode + digits(form.momoNumber),
          momoOperator: operator,
          password: form.password,
          pin: form.pin,
        },
      });
      router.replace("/dashboard");
    } catch (err) {
      setError(err.message);
      setPending(false);
    }
  };

  const prefixed = (key, label) => (
    <div className={`${inputClass} flex items-center gap-1 focus-within:border-malachite`}>
      <span className="text-ink-soft">+{country?.dialCode}</span>
      <input aria-label={label} inputMode="tel" value={form[key]} onChange={set(key)} className="min-w-0 flex-1 bg-transparent outline-none" required />
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prénom">
          <input className={inputClass} value={form.firstName} onChange={set("firstName")} autoComplete="given-name" required />
        </Field>
        <Field label="Nom">
          <input className={inputClass} value={form.lastName} onChange={set("lastName")} autoComplete="family-name" required />
        </Field>
      </div>
      <Field label="Email">
        <input className={inputClass} type="email" value={form.email} onChange={set("email")} autoComplete="email" required />
      </Field>
      <Field label="Pays">
        <select className={inputClass} value={country?.countryCode ?? ""} onChange={set("countryCode")}>
          {countries.map((c) => (
            <option key={c.countryCode} value={c.countryCode}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Téléphone">{prefixed("phone", "Téléphone")}</Field>

      <fieldset className="space-y-3 rounded-2xl bg-mist p-4">
        <legend className="sr-only">Compte Mobile Money de réception</legend>
        <p className="text-sm font-medium">Compte Mobile Money pour recevoir l&apos;argent</p>
        <select aria-label="Opérateur Mobile Money" className={inputClass} value={operator} onChange={set("momoOperator")}>
          {country?.operators.map((op) => (
            <option key={op} value={op}>
              {OPERATOR_LABELS[op] ?? op}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.momoSame} onChange={set("momoSame")} className="h-4 w-4 accent-malachite" />
          Même numéro que mon téléphone
        </label>
        {!form.momoSame && prefixed("momoNumber", "Numéro Mobile Money")}
      </fieldset>

      <Field label="Mot de passe" hint="8 caractères minimum">
        <input className={inputClass} type="password" value={form.password} onChange={set("password")} autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Code PIN de transfert" hint="4 chiffres, demandé à chaque envoi">
        <input
          className={`${inputClass} tracking-[0.5em]`}
          type="password"
          inputMode="numeric"
          maxLength={4}
          pattern="\d{4}"
          value={form.pin}
          onChange={(e) => setForm((f) => ({ ...f, pin: digits(e.target.value).slice(0, 4) }))}
          autoComplete="off"
          required
        />
      </Field>

      {error && (
        <p role="alert" className="rounded-lg bg-clay-wash px-3 py-2 text-sm text-clay">
          {error}
        </p>
      )}
      <button
        disabled={pending || !country}
        className="w-full rounded-full bg-malachite px-5 py-3.5 font-semibold text-white hover:bg-malachite-deep disabled:opacity-50"
      >
        {pending ? "Création du compte…" : "Créer mon compte"}
      </button>
    </form>
  );
}
