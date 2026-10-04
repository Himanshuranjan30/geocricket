"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type State = { amount: number; last: { day: string; handle: string | null; points: number } | null; mine: { day: string; points: number; status: "unclaimed" | "claimed" | "paid" }[] };
const dayLabel = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

/** The winner's side of /prize: claim with a UPI ID, then see claimed → paid. Everyone else sees the latest winner. */
export function PrizeClaim() {
  const [s, setS] = useState<State | null>(null);
  const [rev, setRev] = useState(0);
  const [upi, setUpi] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { fetch("/api/prize", { cache: "no-store" }).then((r) => r.json()).then(setS, () => {}); }, [rev]);

  async function claim(day: string) {
    setMsg(null);
    const r = await fetch("/api/prize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ day, upi }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(d.error ?? "Couldn't save. Try again.");
    setMsg("Got it! We'll send the money within 48 hours."); setUpi(""); setRev((n) => n + 1);
  }

  if (!s) return null;
  const open = s.mine.filter((m) => m.status === "unclaimed");
  return (
    <div className="flex flex-col gap-3">
      {open.map((m) => (
        <section key={m.day} className="rounded-2xl border border-[#F5C000]/50 bg-[#F5C000]/10 p-4">
          <p className="display text-lg">🏆 You won ₹{s.amount} on {dayLabel(m.day)}!</p>
          <p className="text-sm text-muted">You topped the leaderboard with {m.points.toLocaleString("en-IN")} points. Enter your UPI ID to get paid.</p>
          <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); claim(m.day); }}>
            <input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="yourname@okaxis" required aria-label="UPI ID"
              className="min-w-0 flex-1 rounded-full border border-white/20 bg-deep/60 px-4 py-2 text-cream" />
            <button className="display rounded-full bg-[#F5C000] px-5 py-2 text-deep">Claim ₹{s.amount}</button>
          </form>
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
