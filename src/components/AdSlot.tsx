"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
// Test ads everywhere but the real site (staging, previews, localhost), so our own traffic never counts as real.
const isLive = () => typeof window !== "undefined" && window.location.hostname === "geocricket.app";

/**
 * One display ad unit. Rules: never during a question, never next to game controls; reserved min-height so nothing
 * jumps (CLS); rendered on the client only; re-requested after each client navigation (keyed by path) and guarded
 * against React's double effects. Blocked categories (gambling, betting, fantasy) are set in the AdSense console.
 */
export function AdSlot({ slot, height = 250, className = "" }: { slot?: string; height?: number; className?: string }) {
  const path = usePathname();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false); // true only in the browser
  if (!CLIENT || !slot) {
    if (process.env.NODE_ENV === "production") return null;
    return <div style={{ minHeight: height }} className={`grid w-full place-items-center rounded-xl border border-dashed border-[#5A50B0] text-xs uppercase tracking-[.12em] text-[#8B84C9] ${className}`}>Ad slot (dev preview)</div>;
  }
  return (
    <div className={`w-full ${className}`}>
      <p className="mb-1 text-center text-[10px] uppercase tracking-[.16em] text-[#8B84C9]">Advertisement</p>
      <div style={{ minHeight: height }} className="w-full overflow-hidden rounded-xl">{mounted && <Unit key={`${path}:${slot}`} slot={slot} height={height} />}</div>
    </div>
  );
}

function Unit({ slot, height }: { slot: string; height: number }) {
  const ref = useRef<HTMLModElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || el.dataset.adsbygoogleStatus) return; // already filled (strict-mode double effect)
    try { ((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle ||= []).push({}); } catch {}
  }, []);
  return <ins ref={ref} className="adsbygoogle" style={{ display: "block", minHeight: height }} data-ad-client={CLIENT} data-ad-slot={slot}
    data-ad-format="auto" data-full-width-responsive="true" {...(isLive() ? {} : { "data-adtest": "on" })} />;
}
