"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ACTIVE_STATUSES } from "@/lib/client";
import SendMoneyForm from "./SendMoneyForm";
import ReceiveCard from "./ReceiveCard";
import TransactionHistory from "./TransactionHistory";

const FAST_POLL_MS = 4000; // un transfert est en cours : statut quasi temps réel
const SLOW_POLL_MS = 30000;

export default function DashboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const recipientHandle = searchParams.get("to");

  const [user, setUser] = useState(null);
  const [countries, setCountries] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [historyError, setHistoryError] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [fatal, setFatal] = useState(null);

  const loadTransactions = useCallback(async () => {
    try {
      const { transactions } = await api("/api/transactions?limit=50");
      setTransactions(transactions);
      setHistoryError(null);
    } catch (err) {
      if (err.status === 401) return router.replace("/login");
      setHistoryError(err.message);
    } finally {
      setLoadingHistory(false);
    }
  }, [router]);

  useEffect(() => {
    Promise.all([api("/api/auth/me"), api("/api/rates")])
      .then(([me, rates]) => {
        setUser(me.user);
        setCountries(rates.countries);
      })
      .catch((err) => (err.status === 401 ? router.replace("/login") : setFatal(err.message)));
  }, [router]);

  // Suivi des statuts : rapide tant qu'un transfert est actif, lent sinon, en pause si l'onglet est caché.
  const hasActive = transactions.some((t) => ACTIVE_STATUSES.includes(t.status));
  useEffect(() => {
    let timer;
    const tick = async () => {
      if (document.visibilityState === "visible") await loadTransactions();
      timer = setTimeout(tick, hasActive ? FAST_POLL_MS : SLOW_POLL_MS);
    };
    tick();
    return () => clearTimeout(timer);
  }, [loadTransactions, hasActive]);

  const clearHandle = useCallback(() => router.replace("/dashboard"), [router]);

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
  };

  if (fatal) {
    return <p className="mx-auto max-w-md p-8 text-center text-clay">{fatal}</p>;
  }
  if (!user) {
    return <p className="mx-auto max-w-md p-8 text-center text-ink-soft">Chargement de votre espace…</p>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <span className="font-display text-xl font-bold tracking-tight">
          Transfert<span className="text-malachite">Mony</span>
        </span>
        <button type="button" onClick={logout} className="rounded-full px-3 py-1.5 text-sm text-ink-soft hover:bg-surface hover:text-ink">
          Se déconnecter
        </button>
      </header>

      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Bonjour {user.firstName}</h1>
      <p className="mt-1 text-ink-soft">Vous voyez le montant exact reçu avant de valider.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] lg:items-start lg:gap-8">
        <SendMoneyForm
          user={user}
          countries={countries}
          recipientHandle={recipientHandle}
          onClearHandle={clearHandle}
          onCreated={loadTransactions}
        />
        <div className="space-y-6">
          <ReceiveCard user={user} />
          <TransactionHistory transactions={transactions} loading={loadingHistory} error={historyError} />
        </div>
      </div>
    </div>
  );
}
