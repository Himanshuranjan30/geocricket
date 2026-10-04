"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type State = { amount: number; country: string | null; stores: string[]; last: { day: string; handle: string | null; points: number } | null; mine: { day: string; points: number; status: "unclaimed" | "claimed" | "paid" }[] };
type Method = "upi" | "paypal" | "amazon";
const METHODS: { id: Method; label: string; hint: string; placeholder: string }[] = [
  { id: "upi", label: "UPI (India)", hint: "Your UPI ID", placeholder: "yourname@okaxis" },
  { id: "paypal", label: "PayPal", hint: "The email on your PayPal account", placeholder: "you@example.com" },
  { id: "amazon", label: "Amazon gift card", hint: "We email you a gift card for your Amazon store", placeholder: "you@example.com" },
];
const dayLabel = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

/** The winner's side of /prize: pick a payout (UPI in India; PayPal or an Amazon gift card anywhere), then see claimed → paid. */
export function PrizeClaim() {
  const [s, setS] = useState<State | null>(null);
  const [rev, setRev] = useState(0);
  const [to, setTo] = useState("");
  const [method, setMethod] = useState<Method | null>(null);
  const [store, setStore] = useState("US");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { fetch("/api/prize", { cache: "no-store" }).then((r) => r.json()).then(setS, () => {}); }, [rev]);

  async function claim(day: string, m: Method) {
    setMsg(null);
    const r = await fetch("/api/prize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ day, method: m, to, store }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(d.error ?? "Couldn't save. Try again.");
    setMsg("Got it! We'll send your prize within 48 hours."); setTo(""); setRev((n) => n + 1);
  }

  if (!s) return null;
  const open = s.mine.filter((m) => m.status === "unclaimed");
  const picked = method ?? (s.country === "IN" ? "upi" : "paypal"), info = METHODS.find((x) => x.id === picked)!;
  return (
    <div className="flex flex-col gap-3">
      {open.map((m) => (
        <section key={m.day} className="rounded-2xl border border-[#F5C000]/50 bg-[#F5C000]/10 p-4">
          <p className="display text-lg">🏆 You won ₹{s.amount} on {dayLabel(m.day)}!</p>
          <p className="text-sm text-muted">You topped the leaderboard with {m.points.toLocaleString("en-IN")} points. How should we pay you?</p>
          <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Payout method">
            {METHODS.map((x) => (
              <button key={x.id} type="button" role="radio" aria-checked={info.id === x.id} onClick={() => setMethod(x.id)}
                className={`rounded-full px-3 py-1.5 text-sm ${info.id === x.id ? "bg-[#F5C000] text-deep" : "bg-white/10"}`}>{x.label}</button>
            ))}
          </div>
          <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); claim(m.day, info.id); }}>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder={info.placeholder} required aria-label={info.hint}
              type={info.id === "upi" ? "text" : "email"} className="min-w-0 flex-1 rounded-full border border-white/20 bg-deep/60 px-4 py-2 text-cream" />
            {info.id === "amazon" && (
              <select value={store} onChange={(e) => setStore(e.target.value)} aria-label="Amazon store" className="rounded-full border border-white/20 bg-deep/60 px-3 py-2 text-cream">
                {s.stores.map((x) => <option key={x} value={x}>Amazon {x}</option>)}
              </select>
            )}
            <button className="display rounded-full bg-[#F5C000] px-5 py-2 text-deep">Claim ₹{s.amount}</button>
          </form>
          <p className="mt-1 text-xs text-muted">{info.hint}. {info.id === "upi" ? "" : `Outside India we send the equivalent of ₹${s.amount} in your currency.`}</p>
        </section>
      ))}
      {msg && <p className="text-sm text-ok">{msg}</p>}
      {s.mine.filter((m) => m.status !== "unclaimed").map((m) => (
        <p key={m.day} className="text-sm text-muted">{dayLabel(m.day)}: ₹{s.amount} {m.status === "paid" ? <b className="text-ok">paid ✓</b> : "claimed · paying within 48 hours"}</p>
      ))}
      {!open.length && s.last && <p className="text-sm">Latest winner: <b className="text-[#F5C000]">@{s.last.handle}</b> with {s.last.points.toLocaleString("en-IN")} points on {dayLabel(s.last.day)}.</p>}
      {!open.length && <Link href="/leaderboard" className="display text-ok">See today&apos;s leaderboard →</Link>}
    </div>
  );
}
