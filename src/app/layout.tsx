import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
