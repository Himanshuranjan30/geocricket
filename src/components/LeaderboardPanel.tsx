"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { countryName } from "@/lib/profile";
import { Avatar } from "./Avatar";
import { Flag } from "./Flag";
import { Rank } from "./Rank";

type Row = { rank: number; handle: string; avatar: string; country: string | null; total: number; me: boolean };
type CountryRow = { rank: number; country: string; avg: number; players: number };
type Board = { count: number; top: Row[]; countries: CountryRow[]; me: (Row & { countryRank: number | null; guest?: boolean }) | null };

/** Today's top players and countries, shown in-game to everyone (no sign-in needed). */
const EMPTY = { top: [], countries: [], me: null } as unknown as Board;

export function LeaderboardPanel({ date, refreshKey = 0, className = "", fixed = false, title }: {
  date?: string; refreshKey?: number; className?: string; fixed?: boolean; title?: string; // fixed: one board (editions), no day/week/month
}) {
  const [tab, setTab] = useState<"players" | "countries">("players");
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  const [board, setBoard] = useState<Board | null>(null);

  useEffect(() => {
    // Any failure shows an empty board rather than breaking the page it sits on (the results screen).
    fetch(`/api/leaderboard?period=${period}${date ? `&date=${date}` : ""}`, { cache: "no-store" }).then((r) => r.json())
      .then((b) => setBoard(Array.isArray(b?.top) && Array.isArray(b?.countries) ? b : { ...EMPTY }), () => setBoard({ ...EMPTY }));
  }, [date, refreshKey, period]);

  const me = board?.me;
  return (
    <section className={`glass flex flex-col gap-3 rounded-3xl p-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="display text-lg">{title ?? (fixed ? "Leaderboard" : period === "day" ? "Today's board" : period === "week" ? "This week" : "This month")}</h3>
        <div className="flex rounded-full bg-deep/70 p-0.5 text-xs" role="tablist">
          {(["players", "countries"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`display rounded-full px-3 py-1 ${tab === t ? "bg-white text-deep" : "text-muted"}`}>{t}</button>
          ))}
        </div>
      </div>

      {!fixed && <div className="flex gap-1.5 text-[11px]" role="tablist" aria-label="Period">
        {(["day", "week", "month"] as const).map((p) => (
          <button key={p} role="tab" aria-selected={period === p} onClick={() => setPeriod(p)}
            className={`display flex-1 rounded-full border px-2 py-1 ${period === p ? "border-ok bg-ok text-deep" : "border-white/15 text-muted"}`}>{p}</button>
        ))}
      </div>}

      {!board ? (
        <p className="py-6 text-center text-sm text-muted">Loading…</p>
      ) : tab === "players" ? (
        board.top.length === 0 ? <p className="py-4 text-center text-sm text-muted">No scores yet today. Be the first on the board.</p> : (
          <ol className="flex flex-col gap-1">
            {board.top.slice(0, 5).map((r) => <PlayerLine key={r.rank} r={r} />)}
            {me && !me.guest && me.rank > 5 && <><li className="text-center text-xs text-muted">···</li><PlayerLine r={me} /></>}
            {me?.guest && <li className="rounded-xl border border-dashed border-[#F5C000]/50 px-3 py-2 text-center text-xs text-[#E4E1FA]">You&apos;d be <b className="text-[#F5C000]">#{me.rank}</b>. Guests aren&apos;t ranked. <a href="/settings" className="text-ok">Sign in to join</a></li>}
          </ol>
        )
      ) : board.countries.length === 0 ? <p className="py-4 text-center text-sm text-muted">No countries on the board yet.</p> : (
        <ol className="flex flex-col gap-1">
          {board.countries.slice(0, 5).map((c) => (
            <li key={c.country} className={`grid grid-cols-[26px_1fr_auto] items-center gap-2 rounded-xl px-2 py-1.5 text-sm ${me?.country === c.country ? "bg-white/15" : ""}`}>
              <Rank n={c.rank} />
              <span className="flex min-w-0 items-center gap-2"><Flag code={c.country} size={14} /><span className="truncate">{countryName(c.country)}</span></span>
              <span className="text-right"><b className="display">{c.avg}</b> <span className="text-[11px] text-muted">avg · {c.players}</span></span>
            </li>
          ))}
        </ol>
      )}

      <Link href={`/leaderboard?view=${tab}&period=${period}`} className="display text-center text-sm text-ok hover:underline">
        Full leaderboard →
      </Link>
    </section>
  );
}

function PlayerLine({ r }: { r: Row }) {
  return (
    <li className={`grid grid-cols-[26px_auto_1fr_auto] items-center gap-2 rounded-xl px-2 py-1.5 text-sm ${r.me ? "bg-white/15" : ""}`}>
      <Rank n={r.rank} />
      <Avatar code={r.avatar} size={28} />
      <span className="flex min-w-0 items-center gap-1.5"><span className="truncate font-medium">@{r.handle}</span><Flag code={r.country} size={12} /></span>
      <b className="display">{r.total}</b>
    </li>
  );
}
