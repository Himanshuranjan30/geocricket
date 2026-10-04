"use client";

import { useEffect, useState } from "react";

type Item = { day: string; handle: string | null; points: number; method: string | null; payTo: string | null; claimedMs: number | null; paidMs: number | null; email: string | null; country: string | null };
const HOW: Record<string, string> = { upi: "UPI", paypal: "PayPal", amazon: "Amazon gift card" };

/** Admin payouts for /prize: send ₹100 (or the local equivalent) by the winner's chosen method, then mark it paid. */
export function PrizeAdmin() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  useEffect(() => {
    fetch("/api/admin/prize", { cache: "no-store" }).then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => (ok ? (setErr(null), setItems(d.items)) : setErr(d.error ?? "Couldn't load.")));
  }, [rev]);
  async function paid(day: string, value: boolean) {
    await fetch("/api/admin/prize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ day, paid: value }) });
    setRev((n) => n + 1);
  }
  if (err) return <p className="glass rounded-2xl p-4">{err} Sign in with an admin Google account.</p>;
  if (!items) return <p className="text-muted">Loading…</p>;
  const owed = items.filter((i) => i.payTo && !i.paidMs).length;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{owed ? <b className="text-[#F5C000]">{owed} to pay</b> : "Nothing to pay right now."} Prizes settle after midnight IST.</p>
      {!items.length ? <p className="text-muted">No prize days settled yet.</p> : items.map((i) => (
        <article key={i.day} className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
          <div className="flex flex-col text-sm">
            <b className="display">{i.day}</b>
            {i.handle ? <span>@{i.handle}{i.country ? ` (${i.country})` : ""} · {i.points.toLocaleString("en-IN")} pts{i.email ? ` · ${i.email}` : ""}</span> : <span className="text-muted">No ranked players: no winner</span>}
            {i.handle && <span className="text-muted">{i.payTo ? <>{HOW[i.method ?? ""] ?? i.method}: <code className="text-cream">{i.payTo}</code></> : "Not claimed yet"}</span>}
          </div>
          {i.handle && (i.paidMs
            ? <button onClick={() => paid(i.day, false)} className="rounded-full bg-ok/20 px-4 py-1.5 text-sm text-ok">Paid ✓ (undo)</button>
            : <button disabled={!i.payTo} onClick={() => paid(i.day, true)} className="rounded-full bg-[#F5C000] px-4 py-1.5 text-sm text-deep disabled:opacity-40">Mark paid</button>)}
        </article>
      ))}
    </div>
  );
}
