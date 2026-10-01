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
    <div className={`ad-wrap w-full ${className}`}>
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
    // AdSense fills the next unfilled .adsbygoogle in document order, so a hidden copy (the mobile slot on desktop) must not
    // carry the class at all, or it gets picked and throws "availableWidth=0". Only visible slots become ad units.
    if (!el.offsetWidth) return;
    el.classList.add("adsbygoogle");
    try { ((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle ||= []).push({}); } catch {}
  }, []);
  return <ins ref={ref} style={{ display: "block", minHeight: height }} data-ad-client={CLIENT} data-ad-slot={slot}
    data-ad-format="auto" data-full-width-responsive="true" {...(isLive() ? {} : { "data-adtest": "on" })} />;
}

// Content pages only: no rails on legal/feedback pages (no ads where there's nothing to read).
const NO_RAILS = ["/privacy", "/terms", "/refunds", "/about", "/feedback"];
const wide = (cb: () => void) => { const m = matchMedia("(min-width: 1100px)"); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };

/** Desktop skyscrapers in the empty gutters beside the 640px content column. Mounted only when the gutters exist, so
 * AdSense never measures a zero-width slot. 160 wide from 1100px, 300 wide from 1440px. */
export function SideRails() {
  const path = usePathname();
  const show = useSyncExternalStore(wide, () => matchMedia("(min-width: 1100px)").matches, () => false);
  const slot = process.env.NEXT_PUBLIC_AD_SLOT_RAIL || process.env.NEXT_PUBLIC_AD_SLOT_HUBS;
  if (!show || !slot || NO_RAILS.includes(path)) return null;
  const rail = "fixed top-24 z-0 w-[160px] min-[1440px]:w-[300px]";
  return (
    <>
      <aside className={`${rail} left-[calc(50%-344px)] -translate-x-full`}><AdSlot slot={slot} height={600} /></aside>
      <aside className={`${rail} left-[calc(50%+344px)]`}><AdSlot slot={slot} height={600} /></aside>
    </>
  );
}
