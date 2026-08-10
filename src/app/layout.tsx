import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const appFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-app",
});

export const metadata: Metadata = {
  title: {
    default: "Aijou AI — Percakapan yang bergerak jadi penjualan",
    template: "%s | Aijou AI",
  },
  description:
    "Satu workspace untuk menjawab chat, merapikan follow-up, dan menjaga tim tetap memegang kendali.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={appFont.variable} lang="id">
      <body>{children}</body>
    </html>
  );
}
