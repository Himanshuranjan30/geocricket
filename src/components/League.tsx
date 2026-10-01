"use client";

import { ArrowDown, ArrowUp, Trophy } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LEAGUES, leagueName } from "@/lib/leagueRules";
import { untilLabel } from "@/lib/resetTime";
import { Avatar } from "./Avatar";
import { Flag } from "./Flag";
import { SignInNudge } from "./SignInNudge";

export type LeagueData = {
  guest?: true; week: string; endsMs: number; tier: number; name: string; joined: boolean;
  members: { rank: number; handle: string; avatar: string; country: string | null; xp: number; me: boolean }[];
  zones: { promote: number; demote: number }; last: { rank: number | null; outcome: string | null; tier: number } | null;
};

export function useLeague() {
  const [d, setD] = useState<LeagueData | null>(null);
  useEffect(() => { fetch("/api/league", { cache: "no-store" }).then((r) => r.json()).then(setD, () => {}); }, []);
  return d;
}

/** /league: this week's cohort, the promotion and relegation zones, and time left. */
export function LeagueHome() {
  const d = useLeague();
  if (!d) return <p className="animate-pulse text-muted">Loading your league…</p>;
  if (d.guest) return (<><p>Leagues are weekly groups of up to 30 players. Earn XP in any mode, finish near the top and move up a tier, from the {LEAGUES[0]} League to the {LEAGUES[LEAGUES.length - 1]}.</p><SignInNudge variant="card" /></>);
  const n = d.members.length;
  return (
    <>
      <section className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
        <Trophy weight="duotone" size={36} className="shrink-0 text-[#F5C000]" />
        <div className="min-w-0 flex-1">
          <b className="display block text-xl">{d.name}</b>
          <span className="text-sm text-muted">Tier {d.tier + 1} of {LEAGUES.length} · ends in {untilLabel(d.endsMs)} (Sunday midnight IST)</span>
        </div>
      </section>
      {d.last?.outcome && (
        <p className="rounded-xl bg-white/5 px-3 py-2 text-sm">
          Last week: #{d.last.rank} in the {leagueName(d.last.tier)}{d.last.outcome === "up" ? ", promoted ⬆️" : d.last.outcome === "down" ? ", relegated ⬇️" : "."}
        </p>
      )}
      {!d.joined ? (
        <p>You&apos;re not in this week&apos;s league yet. Play any game (the Daily, a Test Match, a Ghost Race, the Nets) and your first XP puts you in a group of up to 30 {d.name} players. <Link href="/play">Play today&apos;s Daily →</Link></p>
      ) : (
        <>
          <p className="text-sm text-muted">Top {d.zones.promote} move up{d.zones.demote ? `, bottom ${d.zones.demote} move down` : ""}. Every ball earns XP; Nets and archive balls count half.</p>
          <ol className="flex flex-col gap-1.5">
            {d.members.map((m) => {
              const up = m.rank <= d.zones.promote, down = m.rank > n - d.zones.demote;
              return (
                <li key={m.rank} className={`flex items-center gap-2.5 rounded-xl px-3 py-2 ${m.me ? "bg-white/15 ring-1 ring-ok/60" : "bg-white/5"}`}>
                  <span className={`display w-7 text-right ${up ? "text-ok" : down ? "text-ball" : "text-muted"}`}>{m.rank}</span>
                  <Avatar code={m.avatar} size={30} />
                  <span className="min-w-0 flex-1 truncate">@{m.handle}{m.me ? " (you)" : ""}</span>
                  <Flag code={m.country} size={12} />
                  <b className="display tabular-nums">{m.xp.toLocaleString("en-IN")} XP</b>
                  {up ? <ArrowUp weight="bold" size={14} className="text-ok" /> : down ? <ArrowDown weight="bold" size={14} className="text-ball" /> : <span className="w-3.5" />}
                </li>
              );
            })}
          </ol>
          {n < 5 && <p className="text-sm text-muted">Your group fills up as more players join this week.</p>}
        </>
      )}
    </>
  );
}
