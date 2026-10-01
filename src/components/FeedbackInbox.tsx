"use client";

import { useEffect, useState } from "react";

type Item = { id: string; kind: string; message: string; page: string | null; device: string | null; status: string; createdMs: number; email: string | null; handle: string | null };
const TABS = ["new", "seen", "done", ""] as const;
const BADGE: Record<string, string> = { bug: "bg-ball/30 text-[#FFB3B3]", idea: "bg-[#F5C000]/25 text-[#FFE27A]", other: "bg-white/15 text-cream" };
const when = (ms: number) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Admin triage for /feedback: new → seen → done. */
export function FeedbackInbox() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("new");
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rev, setRev] = useState(0); // bump to reload after a status change
  useEffect(() => {
    let live = true;
    fetch(`/api/admin/feedback${tab ? `?status=${tab}` : ""}`, { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => { if (!live) return; if (!ok) setErr(d.error ?? "Couldn't load."); else { setErr(null); setItems(d.items); } });
    return () => { live = false; };
  }, [tab, rev]);
  async function mark(ids: string[], status: string) {
    await fetch("/api/admin/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids, status }) });
    setRev((n) => n + 1);
  }
  if (err) return <p className="glass rounded-2xl p-4">{err} Sign in with an admin Google account.</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => <button key={t || "all"} onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 text-sm ${tab === t ? "bg-[#F5C000] text-deep" : "bg-white/10"}`}>{t || "all"}</button>)}
        {tab === "new" && !!items?.length && <button onClick={() => mark(items.map((i) => i.id), "seen")} className="ml-auto text-sm underline">Mark all seen</button>}
      </div>
      {!items ? <p className="text-muted">Loading…</p> : !items.length ? <p className="text-muted">Nothing here. 🎉</p> : items.map((i) => (
        <article key={i.id} className="glass flex flex-col gap-2 rounded-2xl p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className={`rounded-full px-2 py-0.5 font-semibold uppercase ${BADGE[i.kind] ?? BADGE.other}`}>{i.kind}</span>
            <span>{when(i.createdMs)} IST</span><span>· {i.handle ? `@${i.handle}` : "guest"}{i.email ? ` · ${i.email}` : ""}</span>
            {i.page && <span>· on <code>{i.page}</code></span>}
          </div>
          <p className="whitespace-pre-wrap text-cream">{i.message}</p>
          {i.device && <p className="text-[11px] text-muted">{i.device}</p>}
          <div className="flex gap-2 text-sm">
            {i.status !== "seen" && <button onClick={() => mark([i.id], "seen")} className="rounded-full bg-white/10 px-3 py-1">Seen</button>}
            {i.status !== "done" && <button onClick={() => mark([i.id], "done")} className="rounded-full bg-ok/30 px-3 py-1">Done</button>}
            {i.status !== "new" && <button onClick={() => mark([i.id], "new")} className="rounded-full bg-white/5 px-3 py-1">Reopen</button>}
          </div>
        </article>
      ))}
    </div>
  );
}
