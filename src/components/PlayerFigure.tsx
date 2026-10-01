"use client";

import { useRigImage } from "./RigImage";
import { legendOf } from "@/lib/legends";
import type { Mood } from "./Toon";

/**
 * Full-body character on the home-screen globe. Legends use their own render; a custom look uses its rig variant
 * (src/lib/rig.ts) with kit and hair colours painted in the browser, so any look shows instantly.
 */
export function PlayerFigure({ code, className = "", mood = "idle" }: { code: string | null | undefined; className?: string; mood?: Mood }) {
  const legend = legendOf(code);
  const painted = useRigImage(legend ? null : code);
  const src = legend ? `/legends/${legend.id}/full.webp` : painted;
  return (
    <div className={`fig fig-render ${className} mood-${mood}`}>
      <div className="fig-shadow" />
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-rendered transparent webp */}
      {src && <img key={src} src={src} alt="" aria-hidden className="fig-body rise block h-full w-full object-contain" />}
    </div>
  );
}
