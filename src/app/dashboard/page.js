import { Suspense } from "react";
import DashboardClient from "@/components/dashboard/DashboardClient";

export const metadata = { title: "Tableau de bord | TransfertMony" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-ink-soft">Chargement…</p>}>
      <DashboardClient />
    </Suspense>
  );
}
