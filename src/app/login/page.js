import Link from "next/link";
import { Suspense } from "react";
import AuthShell from "@/components/auth/AuthShell";
import LoginForm from "@/components/auth/LoginForm";

export const metadata = { title: "Connexion | TransfertMony" };

export default function LoginPage() {
  return (
    <AuthShell
      title="Bon retour"
      subtitle="Connectez-vous pour envoyer ou recevoir de l'argent."
      footer={
        <>
          Pas encore de compte ?{" "}
          <Link href="/register" className="font-medium text-malachite-deep underline-offset-4 hover:underline">
            Inscrivez-vous
          </Link>
        </>
      }
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
