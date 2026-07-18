import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en-CA">
      <body className="h-screen overflow-hidden">{children}</body>
    </html>
  );
}
