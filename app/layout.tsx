import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VEJHO Ciclus | Gestão Integrada",
  description: "Gestão integrada para operações agrícolas, contratos, finanças, pessoas e patrimônio.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
      </body>
    </html>
  );
}
