"use client";

import { Sword } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "./Avatar";
import { Flag } from "./Flag";
import { Game } from "./Game";

type P = { me: boolean; creator: boolean; handle: string; avatar: string; country: string | null; total: number; done: boolean; played: number };

/** Landing for a challenge link: who challenged you and their score, then the same 5 balls. */
export function DuelIntro({ id }: { id: string }) {
  const [players, setPlayers] = useState<P[] | null>(null);
  const [ghost, setGhost] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [go, setGo] = useState(false);

  useEffect(() => {
    fetch(`/api/duels/${id}`, { cache: "no-store" }).then(async (r) => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Challenge not found.");
      setPlayers(d.players); setGhost(d.ghost ?? null);
      if (d.players.some((p: P) => p.me && p.played > 0)) setGo(true); // already started or finished: straight in
    }).catch((e) => setError(e.message));
  }, [id]);

  if (go) return <Game mode="duel" duelId={id} />;
  const creator = players?.find((p) => p.creator);
  return (
    <main className="night-sky fixed inset-0 grid place-items-center overflow-y-auto px-4">
      <div className="stars" aria-hidden />
      <div className="tv-ui glass rise relative flex w-full max-w-[420px] flex-col items-center gap-4 rounded-[28px] p-6 text-center">
        <Sword weight="fill" size={36} className="text-ok" />
        {error ? (
          <><p>{error}</p><Link href="/" className="btn-primary px-6 py-3">Home</Link></>
        ) : !players ? (
          <p className="display animate-pulse text-muted">Loading challenge…</p>
        ) : (
          <>
            <p className="display text-sm tracking-[.16em] text-muted">{ghost ? "👻 Ghost Race" : "You've been challenged"}</p>
            {creator && (
              <div className="flex items-center gap-3">
                <Avatar code={creator.avatar} size={64} className="ring-2 ring-white/40" />
                <div className="text-left">
                  <div className="flex items-center gap-1.5 text-lg font-semibold">@{creator.handle}<Flag code={creator.country} size={14} /></div>
                  <div className="text-sm text-muted">{creator.done ? <>scored <b className="display text-xl text-cream">{creator.total}</b></> : "is still playing"}</div>
                </div>
              </div>
            )}
            <h1 className="display text-4xl leading-none">Same 5 balls.<br />Can you beat it?</h1>
            {ghost && <p className="text-sm text-muted">Their real run from a round you haven&apos;t played. You&apos;ll see their score on every ball.</p>}
            <p className="text-sm text-muted">20 seconds a ball. Tap where each moment happened.</p>
            <button className="btn-primary w-full py-4 text-2xl" onClick={() => setGo(true)}>{ghost ? "Race the ghost" : "Accept challenge"}</button>
            {players.length > 1 && <p className="text-xs text-muted">{players.length - 1} other {players.length === 2 ? "player has" : "players have"} taken this challenge</p>}
          </>
        )}
      </div>
    </main>
  );
}
