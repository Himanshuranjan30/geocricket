"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Mystery, PlayerFace } from "./PlayerFace";

type Item = { idx: number; done: boolean; solvedAt: number | null; answer: { id: string; name: string; team: string; photo: boolean } | null };
type View = { number: number; items: Item[]; total: number; finished: boolean };

/** Home-screen card for Mystery Cricketer, same shape as the other mode cards: today's three faces (mystery until
 * named) as the art, progress as the subtitle. */
export function WhoCard() {
  const [v, setV] = useState<View | null>(null);
  useEffect(() => { fetch("/api/who", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then(setV, () => {}); }, []);
  const done = v?.items.filter((i) => i.done).length ?? 0;
  const sub = !v ? "3 new players a day" : v.finished ? `Done · ${v.total}/300` : done ? `${done} of 3 done · continue` : "3 new players today";
  const items = v?.items ?? [0, 1, 2].map((idx) => ({ idx, done: false, solvedAt: null, answer: null }));
  return (
    <Link href="/mystery" aria-label={`Mystery Cricketer: guess the player from clues. ${sub}`} className="who-card block pt-2.5 !no-underline">
      <span className="relative block">
        {!v?.finished && <span className="mode-tag display live">New daily</span>}
        <span className="mode-card hot items-center">
          <span className="mode-text relative z-10 flex flex-col gap-1.5 !pr-2">
            <span className="display text-[17px] italic leading-none xl:text-[19px]">Mystery Cricketer</span>
            <span className="display text-[11px] uppercase italic tracking-wide text-[#F5C000]">Guess the player from clues</span>
            <span className="text-xs italic text-[#CFC8F5]">{sub}</span>
          </span>
          <span className="relative z-10 ml-auto flex shrink-0 -space-x-2.5" aria-hidden>
            {items.map((i) => i.done && i.answer
              ? <PlayerFace key={i.idx} {...i.answer} size={30} className={i.solvedAt === null ? "opacity-60 grayscale" : ""} />
              : <Mystery key={i.idx} size={30} className="[animation:none]" />)}
          </span>
        </span>
      </span>
    </Link>
  );
}
