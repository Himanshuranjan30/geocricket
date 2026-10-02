"use client";

import { useRigImage } from "./RigImage";
import { legendOf } from "@/lib/legends";
import type { Mood } from "./Toon";

const MOODS = ["happy", "celebrate", "sad", "shocked", "nervous"] as const;

/**
 * Full-body character on the home-screen globe. Legends use their own render; a custom look uses its rig variant
 * (src/lib/rig.ts) with kit and hair colours painted in the browser, so any look shows instantly.
 */
export function PlayerFigure({ code, className = "", mood = "idle", poses = false }: { code: string | null | undefined; className?: string; mood?: Mood; poses?: boolean }) {
  const legend = legendOf(code);
  const painted = useRigImage(legend ? null : code);
  // Home screen (poses): a legend with a pose set (scripts/legend-moods-align.mts → pose-<mood>.webp, all registered to
  // stand in one spot) shows all six stacked and crossfades to the current mood; nothing moves, only the pose changes.
  if (poses && legend?.fullMoods) {
    return (
      <div className={`fig fig-render fig-poses ${className}`}>
        <div className="fig-shadow" />
        {(["idle", ...MOODS] as Mood[]).map((m) => (
          // eslint-disable-next-line @next/next/no-img-element -- pre-rendered transparent webp
          <img key={m} src={`/legends/${legend.id}/pose-${m}.webp`} alt="" aria-hidden decoding="async"
            className={`fig-pose absolute inset-0 h-full w-full object-contain object-bottom ${m === mood ? "on" : ""}`} />
        ))}
      </div>
    );
  }
  // A legend without its full-body render yet (scripts/legend-full.mts) shows its portrait instead of a broken image.
  const src = legend ? `/legends/${legend.id}/${legend.full ? "full" : "idle"}.webp` : painted;
  return (
    <div className={`fig fig-render ${className} mood-${mood}`}>
      <div className="fig-shadow" />
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-rendered transparent webp */}
      {src && <img key={src} src={src} alt="" aria-hidden className={`fig-body rise block h-full w-full object-contain ${legend && !legend.full ? "object-bottom p-[18%] pb-[8%]" : ""}`} />}
    </div>
  );
}
