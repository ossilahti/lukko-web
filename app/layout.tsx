import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lukko — yksi asia kerrallaan",
  description: "Lukko tekee keskittymisestä helpompaa opiskelussa, työssä ja arjessa.",
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
    <html lang="fi">
      <body>{children}</body>
    </html>
  );
}
