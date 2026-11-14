import { Bricolage_Grotesque, Public_Sans } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });
const publicSans = Public_Sans({ variable: "--font-public-sans", subsets: ["latin"] });

export const metadata = {
  title: "TransfertMony",
  description: "Envoyez et recevez de l'argent partout en Afrique, de Mobile Money à Mobile Money.",
};

export const viewport = {
  themeColor: "#0f2a2e",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr" className={`${bricolage.variable} ${publicSans.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
