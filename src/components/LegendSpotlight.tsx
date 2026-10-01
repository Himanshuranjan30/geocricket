"use client";

import Link from "next/link";
import { LEGENDS, priceFor } from "@/lib/legends";
import { Toon } from "./Toon";

// The first legends a new player sees: the ones with finished art, crowd favourites first.
const FEATURED = ["sachin", "dhoni", "kohli", "rohit", "warne", "smriti"];

/** Step 2 of first-run setup: show off the legends (buy from ₹49, or unlock free by levelling up). Always skippable. */
export function LegendSpotlight({ country, onDone }: { country: string | null | undefined; onDone: () => void }) {
  const picks = FEATURED.map((id) => LEGENDS.find((l) => l.id === id)!).filter(Boolean);
  const price = priceFor(country);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[rgba(3,6,12,.86)] px-4 py-6 backdrop-blur-sm">
      <div className="rise flex w-full max-w-[560px] flex-col gap-4 rounded-[20px] border border-line bg-panel p-5 text-center">
        <div>
          <p className="display text-[13px] font-semibold tracking-[.16em] text-muted">Step 2 of 2 · Legends</p>
          <h2 className="display mt-1 text-[32px] font-extrabold leading-none">Play as a legend</h2>
          <p className="mt-2 text-sm text-muted">Animated cricket greats who react to every ball. Get one now for {price}, or unlock them free as you level up.</p>
        </div>
        <ul className="grid grid-cols-3 gap-2">
          {picks.map((l) => (
            <li key={l.id}>
              <Link href={`/locker?pick=${l.id}`} onClick={onDone} className="mode-card !flex flex-col items-center gap-1 !p-2 !no-underline">
                <Toon legend={l} size={84} mood="happy" />
                <span className="display text-[13px] leading-tight">{l.name.split(" ").slice(-1)[0]}</span>
                <span className="display text-[11px] text-[#F5C000]">{price}</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/locker" onClick={onDone} className="btn-ghost py-3 font-semibold !text-cream !no-underline">See all 30 legends</Link>
        <button onClick={onDone} className="btn-primary py-3.5 text-xl">Start playing →</button>
      </div>
    </div>
  );
}
