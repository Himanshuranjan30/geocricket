"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { dayEndMs, istDate } from "@/lib/game";

type Prize = { label: string; mine: { status: string; label: string }[] };
type Board = { top: { total: number }[]; me: { rank: number; total: number } | null };

const left = (now: number) => { const m = Math.max(0, Math.round((dayEndMs(istDate()) - now) / 60e3)); return `${Math.floor(m / 60)}h ${m % 60}m`; };

/**
 * The daily-prize hook at the top of the home page: one gold pill that reads your situation (won → claim it; #1 → hold
 * on; chasing → the gap; otherwise → the prize and the clock), in your currency, with a live countdown to midnight IST.
 */
export function PrizePill() {
  const [prize, setPrize] = useState<Prize | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    fetch("/api/prize", { cache: "no-store" }).then((r) => r.json()).then(setPrize, () => {});
    fetch("/api/leaderboard", { cache: "no-store" }).then((r) => r.json()).then(setBoard, () => {});
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!prize?.label) return null;

  const won = prize.mine.find((m) => m.status === "unclaimed"), me = board?.me, top = board?.top[0]?.total ?? 0;
  const clock = <span className="tabular-nums">{left(now)}</span>;
  const [href, body] = won ? ["/prize", <>🏆 <b>You won {won.label}!</b> Claim it →</>]
    : me?.rank === 1 ? ["/leaderboard", <>🏆 You&apos;re #1! Hold on for {prize.label} · {clock}</>]
    : me ? ["/leaderboard", <>🏆 #1 wins {prize.label} · you&apos;re #{me.rank}, {(top - me.total).toLocaleString("en-IN")} behind<span className="hidden sm:inline"> · {clock}</span></>]
    : ["/leaderboard", <>🏆 #1 today wins {prize.label} · {clock}</>];
  return (
    <Link href={href} className="prize-pill display flex max-w-full items-center gap-1.5 rounded-full border border-[#F5C000]/70 bg-[#2a1f00]/70 px-4 py-1.5 text-[13px] !text-[#FFE27A] !no-underline shadow-[0_0_24px_rgba(245,192,0,.25)] backdrop-blur hover:brightness-110 sm:text-sm">
      <span className="truncate">{body}</span>
    </Link>
  );
}
