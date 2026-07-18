import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "INN-SIGHT",
  description:
    "The AI consultant that tells you what to build, before you build it.",
};

// Next.js App Router requires a default export for layout files.
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-CA" className={`${fraunces.variable} ${sourceSans.variable}`}>
      <body
        className="h-screen overflow-hidden"
        style={
          {
            "--font-display": "var(--font-fraunces), ui-serif, Georgia, serif",
            "--font-sans":
              "var(--font-source-sans), ui-sans-serif, system-ui, sans-serif",
          } as CSSProperties
        }
      >
        {children}
      </body>
    </html>
  );
}
