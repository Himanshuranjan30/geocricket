"use client";

import { Check, Copy, MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { signInWithGoogle } from "@/lib/auth-client";
import { siteUrl } from "@/lib/client";
import { PlayerFace } from "./PlayerFace";

export type Cand = { id: string; name: string; team: string; photo: boolean; fame: number; usable: boolean };
type Row = { slug: string; title: string; host: string; hostKey: string; active: boolean; createdMs: number; players: string[]; plays: number; hostClaimed: boolean; hostPlayed: boolean };
type Made = { slug: string; hostKey: string; title: string; host: string };

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, "");
const slugOf = (s: string) => s.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
const links = (slug: string, key: string) => ({ pub: `${siteUrl()}/mystery/c/${slug}`, host: `${siteUrl()}/mystery/c/${slug}?host=${key}` });
const dm = (m: Made) => { const l = links(m.slug, m.hostKey); return `Your challenge is live: "${m.title}" 🏏\n\n1) Play it first from your own link to set the score your followers have to beat (keep this one private): ${l.host}\n\n2) Then post this link for your followers: ${l.pub}\n\nEveryone who plays lands on your challenge's leaderboard.`; };

/** /admin/challenges: create a creator challenge (host, title, 3–5 players) and get the links to send them. */
export function CreatorChallenges() {
  const [data, setData] = useState<{ challenges: Row[]; candidates: Cand[] } | null>(null);
  const [denied, setDenied] = useState(false);
  const [host, setHost] = useState(""), [title, setTitle] = useState(""), [slug, setSlug] = useState(""), [slugEdited, setSlugEdited] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [made, setMade] = useState<Made | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(() => fetch("/api/admin/challenges", { cache: "no-store" }).then(async (r) => { if (r.status === 403) { setDenied(true); return; } setData(await r.json()); }), []);
  useEffect(() => { void load(); }, [load]);

  const effSlug = slugEdited ? slug : slugOf(host);

  function copy(text: string, what: string) { navigator.clipboard?.writeText(text).then(() => { setCopied(what); setTimeout(() => setCopied(null), 2000); }, () => {}); }
  async function create() {
    setBusy(true); setError(null);
    const r = await fetch("/api/admin/challenges", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: effSlug, title, host, players: picked }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(d.error ?? "Couldn't create it."); return; }
    setMade({ slug: d.slug, hostKey: d.hostKey, title, host: host.replace(/^@/, "") });
    setHost(""); setTitle(""); setSlug(""); setSlugEdited(false); setPicked([]);
    void load();
  }
  async function toggle(r: Row) {
    await fetch("/api/admin/challenges", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: r.slug, active: !r.active }) });
    void load();
  }

  if (denied) return (
    <div className="glass rounded-3xl p-5 text-center">
      <p className="mb-3">This page is for GeoCricket admins. Sign in with your admin Google account.</p>
      <button onClick={() => signInWithGoogle()} className="btn-primary px-5 py-3">Sign in with Google</button>
    </div>
  );
  if (!data) return <p className="text-muted">Loading…</p>;
  const ready = picked.length >= 3 && picked.length <= 5 && host.trim() && title.trim() && effSlug.length >= 2;

  return (
    <div className="flex flex-col gap-6">
      {made && (
        <section aria-label="Challenge created" className="flex flex-col gap-3 rounded-3xl bg-[#1E6B45]/40 p-4 ring-1 ring-ok/40">
          <p className="display flex items-center gap-2 text-xl"><Check weight="bold" className="text-ok" />&ldquo;{made.title}&rdquo; is live</p>
          {[["Public link (they post this)", links(made.slug, made.hostKey).pub, "pub"], ["Host link (send only to @" + made.host + ")", links(made.slug, made.hostKey).host, "host"]].map(([label, url, k]) => (
            <div key={k} className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-[.12em] text-muted">{label}</span>
              <div className="flex gap-2"><code className="min-w-0 flex-1 select-all truncate rounded-lg bg-deep/70 px-2 py-2 text-xs">{url}</code>
                <button onClick={() => copy(url, k)} className="btn-ghost shrink-0 px-3 text-sm">{copied === k ? "Copied" : <Copy weight="bold" />}</button></div>
            </div>
          ))}
          <button onClick={() => copy(dm(made), "dm")} className="btn-primary flex items-center justify-center gap-2 py-3"><Copy weight="bold" />{copied === "dm" ? "Copied: paste it in the DM" : "Copy the DM reply (both links)"}</button>
        </section>
      )}

      <section aria-label="New challenge" className="glass flex flex-col gap-4 rounded-3xl p-4">
        <h2 className="display text-xl">New creator challenge</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">Creator&apos;s X handle
            <span className="flex items-center rounded-xl border border-line bg-deep focus-within:border-ok"><span className="pl-3 text-muted">@</span>
              <input value={host} onChange={(e) => setHost(e.target.value.replace(/\s/g, ""))} placeholder="xzx_slipknot" className="min-w-0 flex-1 bg-transparent px-1.5 py-2.5 outline-none" /></span></label>
          <label className="flex flex-col gap-1 text-sm">Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="Sourabh's RCB Picks" className="rounded-xl border border-line bg-deep px-3 py-2.5 outline-none focus:border-ok" /></label>
        </div>
        <label className="flex flex-col gap-1 text-sm">Link
          <span className="flex items-center rounded-xl border border-line bg-deep text-sm focus-within:border-ok"><span className="pl-3 text-muted">geocricket.app/mystery/c/</span>
            <input value={effSlug} onChange={(e) => { setSlugEdited(true); setSlug(slugOf(e.target.value)); }} placeholder="sourabh" className="min-w-0 flex-1 bg-transparent px-1 py-2.5 outline-none" /></span></label>

        <PlayerPicker candidates={data.candidates} picked={picked} onChange={setPicked} />
        {error && <p role="alert" className="text-sm text-[#FF8F9C]">{error}</p>}
        <button disabled={!ready || busy} onClick={create} className="btn-primary py-3.5 text-lg disabled:opacity-50">{busy ? "Creating…" : "Create challenge"}</button>
      </section>

      <section aria-label="Challenges" className="flex flex-col gap-2">
        <h2 className="display text-xl">Challenges ({data.challenges.length})</h2>
        {data.challenges.map((r) => (
          <div key={r.slug} className={`glass flex flex-col gap-2 rounded-2xl p-3 ${r.active ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <b>{r.title}</b>
              <span className="text-xs text-muted">@{r.host} · {r.plays} played · {r.hostPlayed ? "host has played" : r.hostClaimed ? "host opened it" : "host hasn't opened it yet"}</span>
            </div>
            <p className="text-xs text-muted">{r.players.join(", ")}</p>
            <div className="flex flex-wrap gap-2 text-sm">
              <button onClick={() => copy(links(r.slug, r.hostKey).pub, `p-${r.slug}`)} className="btn-ghost px-3 py-1.5">{copied === `p-${r.slug}` ? "Copied" : "Copy public link"}</button>
              <button onClick={() => copy(links(r.slug, r.hostKey).host, `h-${r.slug}`)} className="btn-ghost px-3 py-1.5">{copied === `h-${r.slug}` ? "Copied" : "Copy host link"}</button>
              <button onClick={() => copy(dm({ slug: r.slug, hostKey: r.hostKey, title: r.title, host: r.host }), `d-${r.slug}`)} className="btn-ghost px-3 py-1.5">{copied === `d-${r.slug}` ? "Copied" : "Copy DM"}</button>
              <a href={`/mystery/c/${r.slug}`} target="_blank" rel="noopener" className="btn-ghost px-3 py-1.5 !text-cream !no-underline">Open</a>
              <button onClick={() => toggle(r)} className="btn-ghost px-3 py-1.5">{r.active ? "Switch off" : "Switch on"}</button>
            </div>
          </div>
        ))}
        {!data.challenges.length && <p className="text-sm text-muted">None yet.</p>}
      </section>
    </div>
  );
}

/** Search and pick 3–5 players (with faces); players whose moments are due in the daily are greyed out. */
export function PlayerPicker({ candidates, picked, onChange }: { candidates: Cand[]; picked: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const shown = useMemo(() => {
    const n = norm(q).trim();
    return candidates.filter((c) => !picked.includes(c.id) && (!n || norm(`${c.name} ${c.team}`).includes(n))).slice(0, n ? 40 : 24);
  }, [candidates, q, picked]);
  return (
        <div className="flex flex-col gap-2">
          <p className="text-sm">Players <span className="text-muted">({picked.length}/5, pick 3–5)</span></p>
          <div className="flex min-h-[44px] flex-wrap gap-2">
            {picked.map((id) => { const c = byId.get(id)!; return (
              <button key={id} onClick={() => onChange(picked.filter((x) => x !== id))} className="flex items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3 text-sm hover:bg-ball/40" aria-label={`Remove ${c.name}`}>
                <PlayerFace {...c} size={28} /><b>{c.name}</b><X size={12} />
              </button>
            ); })}
            {!picked.length && <span className="self-center text-sm text-muted">Tap players below to add them.</span>}
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-line bg-deep px-3 focus-within:border-ok">
            <MagnifyingGlass size={16} className="text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a player or a team (India, Australia…)" className="min-w-0 flex-1 bg-transparent py-2.5 outline-none" />
          </label>
          <ul className="grid max-h-[340px] grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
            {shown.map((c) => (
              <li key={c.id}>
                <button disabled={!c.usable || picked.length >= 5} onClick={() => onChange([...picked, c.id])}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left ${c.usable ? "hover:bg-white/10" : "opacity-45"} disabled:cursor-not-allowed`}>
                  <PlayerFace {...c} size={32} />
                  <span className="min-w-0 flex-1"><b className="block truncate text-sm">{c.name}</b>
                    <span className="block truncate text-xs text-muted">{c.usable ? c.team : "Not now: their moments are coming up in the daily"}</span></span>
                  {c.usable && <Plus size={14} className="text-muted" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
  );
}
