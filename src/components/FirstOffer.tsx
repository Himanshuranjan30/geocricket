"use client";

import { Crown, X } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { store } from "@/lib/client";
import { LEGENDS } from "@/lib/legends";
import { track } from "./Analytics";
import { Toon } from "./Toon";

type Offer = { eligible: boolean; active?: boolean; endsMs?: number | null; percent?: number };
const left = (ms: number) => { const h = Math.max(0, Math.floor((ms - Date.now()) / 3600e3)); return h >= 1 ? `${h}h left` : "ends soon"; };
const PRICES = { IN: { was: "₹49", now: "₹24.50" }, other: { was: "$0.99", now: "$0.50" } };

/**
 * One-time first-purchase offer (half price on your first legend, 72h). modal: shown once on home when it unlocks (3+ days played).
 * banner: countdown strip in the Locker while it's running.
 */
export function FirstOffer({ variant, country }: { variant: "modal" | "banner"; country?: string | null }) {
  const [o, setO] = useState<Offer | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void fetch("/api/offer", { cache: "no-store" }).then((r) => r.json()).then(async (d: Offer) => {
      if (variant === "modal" && d.eligible && !store<boolean>("pm_offer_seen")) {
        store("pm_offer_seen", true);
        d = await fetch("/api/offer", { method: "POST" }).then((r) => r.json()); // starts the 72h clock
        setOpen(true); track("offer_shown");
      }
      setO(d);
    }, () => {});
  }, [variant]);
  if (!o?.eligible || !o.active || !o.endsMs) return null;
  const p = country === "IN" ? PRICES.IN : PRICES.other;

  if (variant === "banner") {
    return (
      <div className="mx-auto flex items-center gap-2 rounded-2xl border border-[#F5C000]/60 bg-[#F5C000]/15 px-4 py-2 text-sm">
        <Crown weight="fill" className="text-[#F5C000]" size={18} />
        <b>First legend half price:</b> <s className="text-muted">{p.was}</s> <b className="text-[#F5C000]">{p.now}</b> · {left(o.endsMs)}
      </div>
    );
  }
  if (!open) return null;
  const l = LEGENDS.find((x) => x.id === "sachin")!;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setOpen(false)}>
      <div className="glass rise relative flex w-full max-w-[380px] flex-col items-center gap-3 rounded-3xl p-6 pt-8 text-center" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="First legend offer">
        <button aria-label="Close" onClick={() => setOpen(false)} className="absolute right-3 top-3 text-muted"><X size={18} /></button>
        <Toon legend={l} size={140} mood="celebrate" />
        <p className="display text-sm tracking-[.16em] text-[#F5C000]">3 days played · a gift for you</p>
        <h2 className="display text-3xl leading-tight">Your first legend, half price</h2>
        <p className="text-sm text-muted">Any of the 30 legends for <s>{p.was}</s> <b className="text-cream">{p.now}</b>. One time only, {left(o.endsMs)}.</p>
        <Link href="/locker" onClick={() => track("offer_clicked")} className="btn-primary w-full py-3 text-xl !no-underline">Pick my legend</Link>
        <button className="text-sm text-muted hover:underline" onClick={() => setOpen(false)}>Maybe later</button>
      </div>
    </div>
  );
}
