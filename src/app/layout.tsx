import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PropIntel — Property Intelligence Platform",
  description: "AI-powered property due-diligence and risk intelligence",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="bg-zinc-950 text-zinc-50 antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
