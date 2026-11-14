import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "Brand Studio", description: "Calendar to on-brand Meta posts, stories and ads" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=Source+Sans+3:wght@400;600&family=JetBrains+Mono:wght@500&display=swap" />
      </head>
      <body>
        <nav className="top">
          <Link href="/" className="brand">Brand Studio</Link>
          <Link href="/">Calendar</Link>
          <Link href="/items/new">New item</Link>
          <Link href="/brands">Brands</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
