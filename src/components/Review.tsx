"use client";

import { useCallback, useEffect, useState } from "react";

type Draft = { id: string; text: string; answer: string; when: string; story: string; source: string; lat: number; lng: number; pool: string };

/** Approve, edit or reject AI drafts. Nothing reaches players until approved here. */
export function Review() {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => fetch("/api/admin/review", { cache: "no-store" }).then(async (r) => {
    const d = await r.json(); if (!r.ok) throw new Error(d.error); setDrafts(d.drafts);
  }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  if (error) return <p className="text-muted">{error} Sign in with an admin Google account.</p>;
  if (!drafts) return <p className="text-muted">Loading…</p>;
  if (!drafts.length) return <p className="text-muted">Queue empty. New drafts arrive daily.</p>;
  return <ul className="flex flex-col gap-4">{drafts.map((d) => <Card key={d.id} d={d} onDone={() => setDrafts((x) => x!.filter((y) => y.id !== d.id))} />)}</ul>;
}

function Card({ d, onDone }: { d: Draft; onDone: () => void }) {
  const [e, setE] = useState({ text: d.text, answer: d.answer, when: d.when, story: d.story, pool: d.pool, lat: String(d.lat), lng: String(d.lng) });
  const [busy, setBusy] = useState(false);
  async function act(action: "approve" | "reject") {
    setBusy(true);
    const r = await fetch("/api/admin/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: d.id, action, edits: e }) });
    setBusy(false);
    if (r.ok) onDone();
  }
  const field = (k: keyof typeof e, label: string, area = false) => (
    <label className="flex flex-col gap-1 text-xs text-muted">{label}
      {area ? <textarea rows={5} value={e[k]} onChange={(x) => setE({ ...e, [k]: x.target.value })} className="rounded-lg border border-white/15 bg-deep/70 p-2 text-sm text-cream" />
        : <input value={e[k]} onChange={(x) => setE({ ...e, [k]: x.target.value })} className="rounded-lg border border-white/15 bg-deep/70 p-2 text-sm text-cream" />}
    </label>
  );
  return (
    <li className="glass flex flex-col gap-2 rounded-2xl p-4">
      {field("text", "Question")}
      <div className="grid grid-cols-2 gap-2">{field("answer", "Answer")}{field("when", "When")}</div>
      <div className="grid grid-cols-3 gap-2">{field("lat", "Lat")}{field("lng", "Lng")}
        <label className="flex flex-col gap-1 text-xs text-muted">Pool
          <select value={e.pool} onChange={(x) => setE({ ...e, pool: x.target.value })} className="rounded-lg border border-white/15 bg-deep/70 p-2 text-sm text-cream"><option value="edition">Test Match</option><option value="nets">Nets</option><option value="versus">Versus</option></select>
        </label>
      </div>
      {field("story", "Story (the Source line is removed on approve)", true)}
      <div className="flex items-center gap-3 text-sm">
        <a href={d.source} target="_blank" rel="noopener">Article</a>
        <a href={`https://www.google.com/maps?q=${e.lat},${e.lng}`} target="_blank" rel="noopener">Check pin</a>
        <span className="flex-1" />
        <button disabled={busy} onClick={() => act("reject")} className="btn-ghost px-4 py-2">Reject</button>
        <button disabled={busy} onClick={() => act("approve")} className="btn-primary px-5 py-2">Approve</button>
      </div>
    </li>
  );
}
