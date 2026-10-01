"use client";

import { Check, LockSimple, ShoppingCart, Star } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { priceFor, type Legend } from "@/lib/legends";
import type { Profile } from "@/lib/profile";
import { signInWithGoogle } from "@/lib/auth-client";
import { track } from "./Analytics";
import { AccountMenu } from "./AccountMenu";
import { FirstOffer } from "./FirstOffer";
import { Flag } from "./Flag";
import { Logo } from "./Logo";
import { ProfileSetup, type Account } from "./ProfileSetup";
import { Toon, type Mood } from "./Toon";

type Row = Legend & { owned: boolean };
type Data = { level: number; legends: Row[]; payments: boolean };
type Me = { profile: Profile | null; user: Account; googleEnabled: boolean; suggestedCountry: string | null; level?: { level: number } };

const FLAG: Record<string, string> = { IN: "IN", AU: "AU", PK: "PK", ZA: "ZA", LK: "LK", GB: "GB", AF: "AF", BD: "BD" };
const MOODS: Mood[] = ["celebrate", "happy", "shocked", "nervous", "sad"];

/** /locker: all legends, which you own, what unlocks next; equip or buy. */
export function Locker() {
  const [data, setData] = useState<Data | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [pick, setPick] = useState<Row | null>(null);
  const [mood, setMood] = useState<Mood>("celebrate");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 7000); return () => clearTimeout(t); }, [msg]);
  const [setup, setSetup] = useState(false);
  const load = useCallback(() => fetch("/api/locker", { cache: "no-store" }).then((r) => r.json()).then(setData, () => {}), []);
  useEffect(() => { load(); fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then(setMe, () => {}); }, [load]);
  useEffect(() => { const t = setInterval(() => setMood((m) => MOODS[(MOODS.indexOf(m) + 1) % MOODS.length]), 2200); return () => clearInterval(t); }, []);
  const [won, setWon] = useState<Row | null>(null);
  // Back from Dodo checkout (?bought=<id>&status=succeeded): confirm with Dodo, equip, celebrate.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get("bought");
    const pickId = q.get("pick");
    if (pickId) {
      window.history.replaceState(null, "", "/locker");
      void fetch("/api/locker", { cache: "no-store" }).then((r) => r.json()).then((d: Data) => { const l = d.legends.find((x) => x.id === pickId); if (l) setPick(l); });
    }
    if (!id) return;
    window.history.replaceState(null, "", "/locker");
    void (async () => {
      if (q.get("status") && q.get("status") !== "succeeded") { setMsg("Payment didn't go through. You haven't been charged for this legend."); return; }
      for (let i = 0; i < 10; i++) {
        await fetch("/api/pay/confirm", { method: "POST" }).catch(() => {});
        const [d, m]: [Data, Me] = await Promise.all([fetch("/api/locker", { cache: "no-store" }).then((r) => r.json()), fetch("/api/me", { cache: "no-store" }).then((r) => r.json())]);
        const l = d.legends.find((x) => x.id === id);
        if (l?.owned) {
          setData(d);
          if (m.profile) {
            const res = await fetch("/api/me", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...m.profile, avatar: `legend:${id}` }) });
            if (res.ok) setMe({ ...m, profile: (await res.json()).profile });
          }
          setWon(l); track("legend_purchased", { id });
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      setMsg("Payment received. Your legend is on its way. Refresh in a minute if it isn't unlocked yet.");
    })();
  }, []);

  const wearing = me?.profile?.avatar;
  async function equip(l: Row) {
    if (!me?.profile) { setSetup(true); return; }
    const res = await fetch("/api/me", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...me.profile, avatar: `legend:${l.id}` }) });
    const d = await res.json();
    if (!res.ok) { setMsg(d.error); return; }
    setMe({ ...me, profile: d.profile }); setMsg(`You're now playing as ${l.name}.`); track("legend_equipped", { id: l.id });
  }
  async function buy(l: Row) {
    if (!me?.profile) { setSetup(true); return; }
    setMsg(null);
    const res = await fetch("/api/pay/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: l.id }) });
    const o = await res.json();
    if (res.status === 401 && o.signIn) { signInWithGoogle(`/locker?pick=${l.id}`); return; }
    if (res.status === 403 && o.needAge) {
      // Accounts made before the 18+ check: ask once, record it, then carry on to checkout.
      if (!window.confirm("Legends are for players aged 18 and over. Are you 18 or older?")) { setMsg(o.error); return; }
      await fetch("/api/me/age", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ adult: true }) });
      return buy(l);
    }
    if (!res.ok) { setMsg(o.error); return; }
    track("legend_checkout", { id: l.id });
    const { DodoPayments } = await import("dodopayments-checkout");
    DodoPayments.Initialize({ mode: o.mode, displayType: "overlay", onEvent: () => {} });
    DodoPayments.Checkout.open({ checkoutUrl: o.checkoutUrl });
    waitFor(l);
  }
  // The webhook grants the legend; poll until it shows up as owned, then equip it.
  async function waitFor(l: Row) {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      await fetch("/api/pay/confirm", { method: "POST" }).catch(() => {});
      const d: Data = await fetch("/api/locker", { cache: "no-store" }).then((r) => r.json());
      if (d.legends.find((x) => x.id === l.id)?.owned) { setData(d); track("legend_purchased", { id: l.id }); await equip({ ...l, owned: true }); return; }
    }
  }
  const price = priceFor(me?.profile?.country ?? me?.suggestedCountry);

  const sorted = data ? [...data.legends].sort((a, b) => a.level - b.level) : [];
  const owned = sorted.filter((l) => l.owned).length;
  return (
    <main className="night-sky min-h-screen px-4 pb-16 pt-[calc(env(safe-area-inset-top)+16px)]">
      <div className="stars" aria-hidden />
      <div className="tv-ui relative mx-auto flex max-w-[1100px] flex-col gap-6">
        <header className="flex items-center justify-between gap-3"><Logo /><div className="flex items-center gap-2"><Link href="/" className="btn-ghost hidden px-4 py-2 text-sm sm:block">← Home</Link><AccountMenu /></div></header>
        <div className="text-center">
          <p className="display text-sm tracking-[.16em] text-muted">Legends Locker</p>
          <h1 className="display mt-1 text-[clamp(40px,9vw,64px)] leading-[.9]">Play as a legend</h1>
          <p className="mx-auto mt-3 max-w-[48ch] text-[#E4E1FA]">Each legend reacts to every ball you bowl. Level up to unlock them free, or get one instantly.</p>
          {data && <p className="mt-3 text-sm text-muted">Level <b className="text-cream">{data.level}</b> · {owned}/{sorted.length} unlocked</p>}
        </div>
        <FirstOffer variant="banner" country={me?.profile?.country ?? me?.suggestedCountry} />
        {/* Pinned so it's seen even when the sheet that triggered it has closed or the grid is scrolled. */}
        {msg && <p role="status" className="rise fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+20px)] z-50 mx-auto max-w-[460px] rounded-2xl bg-[#2A1F7A] px-4 py-3 text-center text-sm shadow-2xl ring-1 ring-white/20" onClick={() => setMsg(null)}>{msg}</p>}
        {!data ? <p className="text-center text-muted">Loading…</p> : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {sorted.map((l) => {
              const on = wearing === `legend:${l.id}`;
              return (
                <li key={l.id}>
                  <button onClick={() => setPick(l)} className={`mode-card !flex w-full flex-col items-center gap-2 !p-3 text-center ${on ? "hot" : ""}`}>
                    <span className={`relative ${l.owned ? "" : "grayscale-[.6]"}`}>
                      <Toon legend={l} size={112} mood={pick?.id === l.id ? mood : "idle"} />
                      {!l.owned && <LockSimple weight="fill" size={22} className="absolute -right-1 -top-1 rounded-full bg-deep p-1 text-[#F5C000]" />}
                      {on && <Check weight="bold" size={22} className="absolute -right-1 -top-1 rounded-full bg-ok p-1 text-deep" />}
                    </span>
                    <span className="display flex items-center gap-1.5 text-[15px] leading-tight">{l.name}<Flag code={FLAG[l.country]} size={11} /></span>
                    <span className="text-[11px] italic text-[#CFC8F5]">{l.signature}</span>
                    <span className="display text-[11px] uppercase text-[#F5C000]">{l.owned ? (on ? "Wearing" : "Unlocked") : `Level ${l.level} · ${price}`}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pick && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4" onClick={() => setPick(null)}>
          <div className="glass flex w-full max-w-[380px] flex-col items-center gap-3 overflow-visible rounded-3xl p-6 pt-10 text-center" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={pick.name}>
            <Toon legend={pick} size={180} mood={mood} />
            <h2 className="display text-2xl leading-tight">{pick.name}</h2>
            <p className="text-sm text-muted">{pick.role} · <Star weight="fill" size={12} className="-mt-0.5 inline text-[#F5C000]" /> {pick.signature}</p>
            {pick.owned ? (
              <button className="btn-primary w-full py-3 text-xl" onClick={() => { equip(pick); setPick(null); }} disabled={wearing === `legend:${pick.id}`}>
                {wearing === `legend:${pick.id}` ? "Wearing" : "Play as this legend"}
              </button>
            ) : (
              <>
                <p className="text-sm">Unlocks free at <b>level {pick.level}</b>{data && <> (you&apos;re level {data.level})</>}</p>
                <button className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-xl disabled:opacity-60" disabled={!data?.payments} onClick={() => { buy(pick); setPick(null); }}>
                  <ShoppingCart weight="fill" size={20} />{!data?.payments ? "Purchases open soon" : me && !me.user ? `Sign in & get · ${price}` : `Get now · ${price}`}
                </button>
              </>
            )}
            <button className="text-sm text-muted hover:underline" onClick={() => setPick(null)}>Close</button>
          </div>
        </div>
      )}
      {won && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setWon(null)}>
          <div className="glass rise flex w-full max-w-[380px] flex-col items-center gap-3 rounded-3xl p-6 pt-10 text-center" role="dialog" aria-label="Legend unlocked">
            <Toon legend={won} size={180} mood="celebrate" />
            <p className="display text-sm tracking-[.16em] text-[#F5C000]">Legend unlocked</p>
            <h2 className="display text-3xl leading-tight">{won.name}</h2>
            <p className="text-sm text-muted">You&apos;re now playing as {won.name.split(" ")[0]}. They&apos;ll react to every ball you bowl.</p>
            <a href={`/?legend=${won.id}`} className="btn-primary w-full py-3 text-xl !no-underline">See {won.name.split(" ")[0]} on your globe →</a>
            <button className="text-sm text-muted hover:underline" onClick={() => setWon(null)}>Back to the Locker</button>
          </div>
        </div>
      )}
      {setup && me && <ProfileSetup initial={null} suggestedCountry={me.suggestedCountry} user={me.user} googleEnabled={me.googleEnabled} onCancel={() => setSetup(false)} onDone={(profile) => { setMe({ ...me, profile }); setSetup(false); }} />}
    </main>
  );
}
