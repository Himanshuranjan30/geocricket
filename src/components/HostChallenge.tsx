"use client";

import { ArrowRight, Copy, Crown, ShareNetwork, WhatsappLogo } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { siteUrl } from "@/lib/client";
import { publishMe, useMe } from "@/lib/useMe";
import { track } from "./Analytics";
import { PlayerPicker, type Cand } from "./CreatorChallenges";
import { ProfileSetup } from "./ProfileSetup";

type Mine = { slug: string; title: string; active: boolean; players: string[]; plays: number };

/** /mystery/host: anyone hosts a Mystery Cricketer challenge for their friends or followers, as themselves. */
export function HostChallenge() {
  const [me, setMe] = useMe();
  const [data, setData] = useState<{ candidates: Cand[]; mine: Mine[] } | null>(null);
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ slug: string; title: string } | null>(null);
  const [setup, setSetup] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => fetch("/api/challenges", { cache: "no-store" }).then((r) => r.json()).then(setData, () => {}), []);
  useEffect(() => { void load(); track("host_page_opened"); }, [load]);

  async function create(afterSetup = false) {
    if (!me?.profile && !afterSetup) { setSetup(true); return; } // a host needs a name on the challenge; carry on after
    setBusy(true); setError(null);
    const r = await fetch("/api/challenges", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, players: picked }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.status === 403 && d.needProfile) { setSetup(true); return; }
    if (!r.ok) { setError(d.error ?? "Couldn't create it."); return; }
    setMade({ slug: d.slug, title }); setTitle(""); setPicked([]);
    window.scrollTo({ top: 0, behavior: "smooth" }); // the "ready" card with the links is at the top
    track("challenge_hosted", { players: picked.length });
    void load();
  }

  const url = (slug: string) => `${siteUrl()}/mystery/c/${slug}`;
  const shareText = (m: { slug: string; title: string }) => `🏏 I made a Mystery Cricketer challenge: "${m.title}". Name the cricketers from clues on the globe. Bet you can't beat my score 👀 ${url(m.slug)}`;
  const ready = title.trim().length >= 3 && picked.length >= 3 && picked.length <= 5;

  return (
    <div className="flex flex-col gap-5">
      {made && (
        <section aria-label="Challenge ready" className="flex flex-col gap-3 rounded-3xl bg-[#1E6B45]/40 p-4 text-center ring-1 ring-ok/40">
          <p className="display flex items-center justify-center gap-2 text-2xl"><Crown weight="fill" className="text-[#F5C000]" />&ldquo;{made.title}&rdquo; is ready</p>
          <p className="text-sm">Play it first: your score is the one everyone has to beat. Then share the link.</p>
          <Link href={`/mystery/c/${made.slug}`} onClick={() => track("host_play_first")} className="btn-primary flex items-center justify-center gap-2 py-3.5 text-xl !no-underline">Play it first <ArrowRight weight="bold" /></Link>
          <div className="flex flex-wrap justify-center gap-2">
            <a href={`https://wa.me/?text=${encodeURIComponent(shareText(made))}`} target="_blank" rel="noopener" onClick={() => track("host_shared", { via: "whatsapp" })} className="btn-ghost flex items-center gap-2 px-4 py-2.5 font-semibold !text-cream !no-underline"><WhatsappLogo weight="fill" size={18} />WhatsApp</a>
            <a href={`https://x.com/intent/post?text=${encodeURIComponent(shareText(made))}`} target="_blank" rel="noopener" onClick={() => track("host_shared", { via: "x" })} className="btn-ghost flex items-center gap-2 px-4 py-2.5 font-semibold !text-cream !no-underline"><ShareNetwork weight="bold" size={18} />Post on X</a>
            <button onClick={() => { navigator.clipboard?.writeText(url(made.slug)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }, () => {}); track("host_shared", { via: "copy" }); }} className="btn-ghost flex items-center gap-2 px-4 py-2.5 font-semibold"><Copy weight="bold" />{copied ? "Copied" : "Copy link"}</button>
          </div>
          <code className="select-all break-all rounded-lg bg-deep/70 px-2 py-1.5 text-xs">{url(made.slug)}</code>
        </section>
      )}

      <section aria-label="Host a challenge" className="glass flex flex-col gap-4 rounded-3xl p-4">
        <div>
          <h2 className="display text-2xl">Host a challenge</h2>
          <p className="text-sm text-muted">Pick 3–5 cricketers. Your friends get the clues one by one on the globe, and you set the score to beat. Free.</p>
        </div>
        <label className="flex flex-col gap-1 text-sm">Name your challenge
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="e.g. RCB Legends, 2011 World Cup heroes" className="rounded-xl border border-line bg-deep px-3 py-2.5 text-base outline-none focus:border-ok" /></label>
        {data ? <PlayerPicker candidates={data.candidates} picked={picked} onChange={setPicked} /> : <p className="text-muted">Loading players…</p>}
        {me?.profile && <p className="text-xs text-muted">Hosted by <b className="text-cream">@{me.profile.handle}</b></p>}
        {error && <p role="alert" className="text-sm text-[#FF8F9C]">{error}</p>}
        <button disabled={!ready || busy} onClick={() => create()} className="btn-primary py-3.5 text-xl disabled:opacity-50">{busy ? "Creating…" : "Create challenge"}</button>
      </section>

      {!!data?.mine.length && (
        <section aria-label="Your challenges" className="flex flex-col gap-2">
          <h2 className="display text-xl">Your challenges</h2>
          {data.mine.map((c) => (
            <Link key={c.slug} href={`/mystery/c/${c.slug}`} className={`glass flex items-center justify-between gap-3 rounded-2xl p-3 !text-cream !no-underline ${c.active ? "" : "opacity-50"}`}>
              <span className="min-w-0"><b className="block truncate">{c.title}</b><span className="block truncate text-xs text-muted">{c.players.join(", ")}</span></span>
              <span className="shrink-0 text-sm text-muted">{c.active ? `${c.plays} played` : "Switched off"}</span>
            </Link>
          ))}
        </section>
      )}

      {setup && me && (
        <ProfileSetup initial={null} suggestedCountry={me.suggestedCountry} user={me.user} googleEnabled={me.googleEnabled} intro="Your name goes on the challenge as its host"
          onCancel={() => setSetup(false)} onDone={(profile) => { setSetup(false); setMe({ ...me, profile }); publishMe({ ...me, profile }); void create(true); }} />
      )}
    </div>
  );
}
