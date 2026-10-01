"use client";

import { useEffect, useState } from "react";
import { paintFirst } from "@/lib/kitPaint";
import { HEAD_BOX, rigFor } from "@/lib/rig";
import type { Mood } from "./Toon";

/** The painted full-body image (object URL) for a custom look, or null while painting / for no code. */
export function useRigImage(code: string | null | undefined) {
  const rig = code ? rigFor(code) : null;
  const key = rig ? `${rig.srcs[0]}|${rig.kit}|${rig.hair}` : "";
  const [painted, setPainted] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    if (!rig) return;
    let live = true;
    paintFirst(rig.srcs, rig.kit, rig.hair).then((url) => live && setPainted({ key, url }), () => {});
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- key covers rig
  return painted?.key === key ? painted.url : null;
}

/** Round head-and-shoulders avatar cropped from the same full-body image, on the kit's background colour. */
export function RigHead({ code, size, className = "", mood }: { code: string | null | undefined; size: number; className?: string; mood?: Mood }) {
  const url = useRigImage(code);
  const bg = code ? rigFor(code).bg : "0b2a5c";
  const scale = 1 / HEAD_BOX.size; // the head box fills the circle
  return (
    <span aria-hidden className={`relative inline-block shrink-0 overflow-hidden rounded-full ${mood ? `mood-wrap mood-${mood}` : ""} ${className}`}
      style={{ width: size, height: size, background: `radial-gradient(circle at 50% 35%, #${bg}cc, #${bg})` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- painted object URL */}
      {url && <img src={url} alt="" draggable={false} className="absolute max-w-none"
        style={{ width: size * scale, height: size * scale * (5 / 3), left: -HEAD_BOX.x * size * scale, top: -HEAD_BOX.y * size * scale * (5 / 3) }} />}
    </span>
  );
}
