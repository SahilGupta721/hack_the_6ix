"use client";

import dynamic from "next/dynamic";
import { TopBar } from "@/components/top-bar";

const SiteMap = dynamic(
  () => import("@/components/site-map").then((m) => m.SiteMap),
  { ssr: false },
);

// Next.js App Router requires a default export for page files.
export default function HomePage() {
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <SiteMap />
        </main>
        <aside className="flex w-72 shrink-0 flex-col border-l border-panel-border bg-panel">
          <div className="border-b border-panel-border px-4 py-3">
            <h2 className="text-[15px] font-semibold">
              Awaiting Building Design Input
            </h2>
          </div>
          <div className="flex flex-1 items-center justify-center px-4 text-center text-[13px] text-text-soft">
            Place a building on the site to begin.
          </div>
        </aside>
      </div>
    </div>
  );
}
