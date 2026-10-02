"use client";

import { useRigImage } from "./RigImage";
import { legendOf } from "@/lib/legends";
import { useEffect } from "react";
import type { Mood } from "./Toon";

const MOODS = ["happy", "celebrate", "sad", "shocked", "nervous"] as const;

/**
 * Full-body character on the home-screen globe. Legends use their own render; a custom look uses its rig variant
 * (src/lib/rig.ts) with kit and hair colours painted in the browser, so any look shows instantly.
 */
export function PlayerFigure({ code, className = "", mood = "idle" }: { code: string | null | undefined; className?: string; mood?: Mood }) {
  const legend = legendOf(code);
  const painted = useRigImage(legend ? null : code);
  // A legend without its full-body render yet (scripts/legend-full.mts) shows its portrait instead of a broken image.
  // With per-mood full-body art (scripts/legend-full-moods.mts) the face changes with the mood too; the motion (hop,
  // jump, shake…) comes from the mood-* CSS either way.
  const src = legend ? `/legends/${legend.id}/${!legend.full ? "idle" : legend.fullMoods && mood !== "idle" ? `full-${mood}` : "full"}.webp` : painted;
  useEffect(() => { // every mood image ready before it's needed, so a mood change never flashes
    if (legend?.fullMoods) for (const m of MOODS) new Image().src = `/legends/${legend.id}/full-${m}.webp`;
  }, [legend?.id, legend?.fullMoods]);
  return (
    <div className={`fig fig-render ${className} mood-${mood}`}>
      <div className="fig-shadow" />
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-rendered transparent webp */}
      {src && <img key={legend?.id ?? src} src={src} alt="" aria-hidden className={`fig-body rise block h-full w-full object-contain ${legend && !legend.full ? "object-bottom p-[18%] pb-[8%]" : ""}`} />}
    </div>
  );
}
