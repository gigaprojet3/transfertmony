"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import { Field, inputClass } from "./AuthShell";

export default function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", body: { identifier, password } });
      // N'accepter qu'un chemin interne (évite les redirections ouvertes).
      router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
    } catch (err) {
      setError(err.message);
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email ou téléphone">
        <input className={inputClass} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
      </Field>
      <Field label="Mot de passe">
        <input
          className={inputClass}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </Field>
      {error && (
        <p role="alert" className="rounded-lg bg-clay-wash px-3 py-2 text-sm text-clay">
          {error}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-full bg-malachite px-5 py-3.5 font-semibold text-white hover:bg-malachite-deep disabled:opacity-50"
      >
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
