import Link from "next/link";

// La racine « / » est redirigée vers /dashboard par next.config.mjs.
// Cette page n'est qu'un repli si la redirection est désactivée.
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Link href="/dashboard" className="rounded-full bg-malachite px-6 py-3 font-semibold text-white hover:bg-malachite-deep">
        Ouvrir TransfertMony
      </Link>
    </main>
  );
}
