import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lukko — rauha ruudun äärellä",
  description: "Lukon paikallinen fokusdemo auttaa varaamaan tilaa tärkeälle.",
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
