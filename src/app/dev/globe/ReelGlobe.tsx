"use client";

import dynamic from "next/dynamic";

const Globe = dynamic(() => import("@/components/Globe"), { ssr: false });

export function ReelGlobe() {
  return (
    <main className="night-sky fixed inset-0 overflow-hidden">
      <div className="stars" aria-hidden />
      <Globe onTap={() => {}} onReady={(g) => g.labels(false)} />
    </main>
  );
}
