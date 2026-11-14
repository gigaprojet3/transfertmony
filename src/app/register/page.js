import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import RegisterForm from "@/components/auth/RegisterForm";

export const metadata = { title: "Inscription | TransfertMony" };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Créer un compte"
      subtitle="Quelques informations, et vous pouvez envoyer de l'argent dans toute l'Afrique."
      footer={
        <>
          Déjà inscrit ?{" "}
          <Link href="/login" className="font-medium text-malachite-deep underline-offset-4 hover:underline">
            Connectez-vous
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
