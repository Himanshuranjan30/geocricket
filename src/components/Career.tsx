"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TITLES } from "@/lib/level";
import type { Profile } from "@/lib/profile";
import { AccountMenu } from "./AccountMenu";
import { Avatar } from "./Avatar";
import { Flag } from "./Flag";
import { Logo } from "./Logo";
import { Medal } from "./Medal";
import { TIERS } from "@/lib/badges";

type Badge = { id: string; icon: string; name: string; desc: string; tiers: number[]; value: number; tier: number; next: number | null; prev: number };
type Career = {
  level: number; xp: number; intoLevel: number; forNext: number; progress: number; title: string; next: { level: number; name: string } | null;
  stats: Record<string, number>; badges: Badge[]; profile: Profile | null; signedIn: boolean;
};

/** /profile: level, XP, title ladder, badges and career stats. */
export function Career() {
  const [c, setC] = useState<Career | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { fetch("/api/career", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())).then(setC, () => setErr(true)); }, []);
  const earned = c?.badges.reduce((n, b) => n + b.tier + 1, 0) ?? 0;
  return (
    <main className="night-sky min-h-screen px-4 pb-16 pt-[calc(env(safe-area-inset-top)+16px)]">
      <div className="stars" aria-hidden />
      <div className="tv-ui relative mx-auto flex max-w-[920px] flex-col gap-6">
        <header className="flex items-center justify-between"><Logo /><AccountMenu /></header>
        {err ? <p className="text-muted">Play your first round to start your career. <Link href="/play">Play today →</Link></p> : !c ? <p className="text-muted">Loading…</p> : (
          <>
            <section className="mode-card !flex flex-col gap-5 !p-6 sm:flex-row sm:items-center">
              <div className="relative shrink-0">
                <Ring progress={c.progress} size={132} />
                <div className="absolute inset-[14px] overflow-hidden rounded-full"><Avatar code={c.profile?.avatar} size={104} className="h-full w-full" /></div>
                <span className="display absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[#F5C000] px-3 py-0.5 text-sm text-deep shadow-lg">LVL {c.level}</span>
              </div>
              <div className="relative z-10 flex min-w-0 flex-1 flex-col gap-2">
                <p className="display flex items-center gap-2 text-2xl">@{c.profile?.handle ?? "guest"} <Flag code={c.profile?.country} size={18} /></p>
                <p className="display text-lg text-[#F5C000]">{c.title}</p>
                <div className="h-3 overflow-hidden rounded-full bg-black/30"><i className="points-bar block h-full rounded-full" style={{ width: `${Math.round(c.progress * 100)}%` }} /></div>
                <p className="text-sm text-[#CFC8F5]"><b className="text-cream">{c.intoLevel.toLocaleString("en-IN")}</b> / {c.forNext.toLocaleString("en-IN")} XP to level {c.level + 1} · {c.xp.toLocaleString("en-IN")} XP total</p>
                {c.next && <p className="text-xs text-muted">Next title: <b className="text-cream">{c.next.name}</b> at level {c.next.level}</p>}
              </div>
            </section>

            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[["Dailies", c.stats.dailies], ["Best streak", c.stats.streak], ["Perfect balls", c.stats.perfects], ["Best day", c.stats.best], ["Test Matches", c.stats.tests], ["Nets balls", c.stats.nets], ["Duels won", c.stats.duels], ["Legends", c.stats.legends]].map(([k, v]) => (
                <div key={k} className="hud-box px-3 py-2.5 text-center"><div className="display text-2xl">{Number(v).toLocaleString("en-IN")}</div><div className="text-[11px] uppercase tracking-wide text-muted">{k}</div></div>
              ))}
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="display text-2xl">Badges <span className="text-base text-muted">{earned}/{(c.badges.length * 4)} tiers</span></h2>
              {!c.signedIn && <p className="rounded-xl border border-dashed border-[#F5C000]/50 bg-[#F5C000]/10 px-3 py-2 text-sm">Guests can see their progress, but badges are only awarded to signed-in players. Sign in from the top right to start earning.</p>}
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {c.badges.map((b) => {
                  const pct = b.next ? Math.min(100, ((b.value - b.prev) / (b.next - b.prev)) * 100) : 100;
                  return (
                    <li key={b.id} className={`glass flex flex-col items-center gap-2 rounded-2xl p-4 text-center ${b.tier >= 0 ? "" : "opacity-80"}`}>
                      <Medal icon={b.icon as never} tier={b.tier} size={84} />
                      <b className="display text-base leading-tight">{b.name}</b>
                      <span className="display text-[11px] uppercase tracking-wide" style={{ color: ["#E3A36B", "#D9DEE6", "#F5C000", "#9FE8FF"][b.tier] ?? "#8B84C9" }}>{b.tier >= 0 ? `${TIERS[b.tier]}${b.tier === 3 ? " · maxed" : ""}` : "Locked"}</span>
                      <span className="text-[11px] leading-tight text-muted">{b.desc}</span>
                      {b.next && <>
                        <span className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10"><i className="block h-full rounded-full bg-gradient-to-r from-ok to-[#F5C000]" style={{ width: `${pct}%` }} /></span>
                        <span className="text-[10px] text-muted">{b.value.toLocaleString("en-IN")} / {b.next.toLocaleString("en-IN")} for {TIERS[b.tier + 1]}</span>
                      </>}
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="display text-2xl">Career ladder</h2>
              <ol className="flex flex-wrap gap-2">
                {TITLES.map((t) => {
                  const done = c.level >= t.level, current = c.title === t.name;
                  return <li key={t.name} className={`rounded-full px-3 py-1.5 text-sm ${current ? "bg-[#F5C000] font-bold text-deep" : done ? "bg-white/15" : "bg-white/5 text-muted"}`}>{t.name} <span className="opacity-70">· L{t.level}</span></li>;
                })}
              </ol>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Ring({ progress, size }: { progress: number; size: number }) {
  const r = size / 2 - 6, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="8" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F5C000" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />
    </svg>
  );
}
