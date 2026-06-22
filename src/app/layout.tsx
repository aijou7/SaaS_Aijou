import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Aijou AI — Percakapan yang bergerak jadi penjualan",
    template: "%s | Aijou AI",
  },
  description: "AI sales agent untuk balas chat, bantu closing, dan arahkan pelanggan ke pembayaran.",
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
