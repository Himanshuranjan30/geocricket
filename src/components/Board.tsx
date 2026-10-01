"use client";

import { useEffect, useRef, useState } from "react";

/** Stadium scoreboard digits that flip when they change. */
export function Board({ value, digits = 3, size = "sm" }: { value: number; digits?: number; size?: "sm" | "lg" }) {
  const chars = String(value).padStart(digits, "0").split("");
  const prev = useRef<string[]>(chars);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    chars.forEach((c, i) => {
      const el = refs.current[i];
      if (el && prev.current[i] !== c) { el.classList.remove("flip"); void el.offsetWidth; el.classList.add("flip"); }
    });
    prev.current = chars;
  });

  const cls = size === "lg" ? "h-[66px] min-w-12 text-[52px] rounded-lg" : "h-[30px] min-w-[22px] text-[22px]";
  return (
    <div className="flex gap-[3px]" aria-label={`Score ${value}`}>
      {chars.map((c, i) => (
        <div key={i} ref={(el) => { refs.current[i] = el; }} className={`tile ${cls}`}>{c}</div>
      ))}
    </div>
  );
}

/** Animates a displayed number from its last value to `to`. */
export function useCountUp(to: number, ms = 700) {
  const [shown, setShown] = useState(to);
  const from = useRef(to);
  useEffect(() => {
    const start = from.current, t0 = performance.now();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || start === to) { from.current = to; setShown(to); return; }
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      setShown(Math.round(start + (to - start) * t));
      if (t < 1) raf = requestAnimationFrame(step); else from.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return shown;
}
