import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Unlocked Subwaydle",
  description: "An infinitely replayable NYC Subway routing wordle.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
