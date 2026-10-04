"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "./Avatar";
import { Flag } from "./Flag";
import { Rank } from "./Rank";
import { ChallengeChips } from "./ChallengeChips";
import type { ChallengeId } from "@/lib/game";

type Row = { rank: number; handle: string; avatar: string; country: string | null; total: number; me: boolean; games?: Partial<Record<ChallengeId, number>> };
type Board = { count: number; people?: number; top: Row[]; me: (Row & { guest?: boolean }) | null };

/** The one leaderboard (lib/server leaderboard): today's points from every public challenge. Shown to everyone, no sign-in needed. */
const EMPTY = { count: 0, people: 0, top: [], me: null } as Board;

export function LeaderboardPanel({ date, refreshKey = 0, className = "", title }: { date?: string; refreshKey?: number; className?: string; title?: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [prize, setPrize] = useState<{ amount: number; last: { handle: string | null } | null; mine: { status: string }[] } | null>(null);
  useEffect(() => { if (!date) fetch("/api/prize", { cache: "no-store" }).then((r) => r.json()).then(setPrize, () => {}); }, [date]);

  useEffect(() => {
    // Any failure shows an empty board rather than breaking the page it sits on (the results screen, the home page).
    fetch(`/api/leaderboard${date ? `?date=${date}` : ""}`, { cache: "no-store" }).then((r) => r.json())
      .then((b) => setBoard(Array.isArray(b?.top) ? b : { ...EMPTY }), () => setBoard({ ...EMPTY }));
  }, [date, refreshKey]);

  const me = board?.me;
  return (
    <section className={`glass flex flex-col gap-3 rounded-3xl p-4 ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="display text-lg">{title ?? (date ? "Leaderboard" : "Today's leaderboard")}</h3>
        {board && (board.people ?? 0) > 0 && <span className="text-xs text-muted">{board.people} played{date ? "" : " today"}</span>}
      </div>
      <p className="-mt-2 text-[11px] text-muted">Points from all five of the day&apos;s challenges</p>
      {prize && (prize.mine.some((m) => m.status === "unclaimed")
        ? <Link href="/prize" className="display rounded-xl bg-[#F5C000] px-3 py-2 text-center text-sm !text-deep !no-underline">🏆 You won ₹{prize.amount}! Claim it →</Link>
        : <Link href="/prize" className="rounded-xl border border-[#F5C000]/40 bg-[#F5C000]/10 px-3 py-2 text-center text-xs !text-[#F5C000] !no-underline">
            🏆 <b>#1 at midnight wins ₹{prize.amount}</b>{prize.last?.handle ? <> · last winner @{prize.last.handle}</> : null}
          </Link>)}
      {!board ? (
        <p className="py-6 text-center text-sm text-muted">Loading…</p>
      ) : board.top.length === 0 ? <p className="py-4 text-center text-sm text-muted">No scores yet today. Be the first on the board.</p> : (
        <ol className="flex flex-col gap-1">
          {board.top.slice(0, 5).map((r) => <PlayerLine key={r.rank} r={r} />)}
          {me && !me.guest && me.rank > 5 && <><li className="text-center text-xs text-muted">···</li><PlayerLine r={me} /></>}
          {me?.guest && <li className="rounded-xl border border-dashed border-[#F5C000]/50 px-3 py-2 text-center text-xs text-[#E4E1FA]">You&apos;d be <b className="text-[#F5C000]">#{me.rank}</b>. Guests aren&apos;t ranked. <a href="/settings" className="text-ok">Sign in to join</a></li>}
        </ol>
      )}
      <Link href={date ? `/leaderboard?date=${date}` : "/leaderboard"} className="display text-center text-sm text-ok hover:underline">Full leaderboard →</Link>
    </section>
  );
}

function PlayerLine({ r }: { r: Row }) {
  return (
    <li className={`grid grid-cols-[26px_auto_1fr_auto] items-center gap-2 rounded-xl px-2 py-1.5 text-sm ${r.me ? "bg-white/15" : ""}`}>
      <Rank n={r.rank} />
      <Avatar code={r.avatar} size={28} />
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-1.5"><span className="truncate font-medium">@{r.handle}</span><Flag code={r.country} size={12} /></span>
        <ChallengeChips games={r.games} size="xs" />
      </span>
      <b className="display">{r.total}</b>
    </li>
  );
}
