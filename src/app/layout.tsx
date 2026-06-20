import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aijou AI - AI Sales Agent",
  description: "AI agent untuk balas chat, bantu closing, dan catat pembayaran otomatis.",
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
