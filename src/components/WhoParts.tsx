"use client";

import { Handshake, Hash, IdentificationBadge, MagnifyingGlass, MapPin, Path, X } from "@phosphor-icons/react";
import { useMemo, useState, type ReactNode, type RefObject } from "react";
import type { Clue } from "@/lib/whoRules";
import { PlayerFace } from "./PlayerFace";

// Pieces shared by the daily Who's the Player? and the 1v1 Name Race.

export type WhoP = { id: string; name: string; team: string; photo: boolean };

const LABEL: Record<Clue["kind"], string> = { pin: "The ground", match: "The match", numbers: "The numbers", trail: "Career trail", initials: "Team & initials" };
const ICON: Record<Clue["kind"], ReactNode> = {
  pin: <MapPin weight="fill" size={15} />, match: <Handshake weight="fill" size={15} />, numbers: <Hash weight="bold" size={15} />,
  trail: <Path weight="bold" size={15} />, initials: <IdentificationBadge weight="fill" size={15} />,
};

export function ClueCard({ clue, n, fresh }: { clue: Clue; n: number; fresh: boolean }) {
  return (
    <li className={`flex gap-3 rounded-2xl px-3 py-2 ${fresh ? "rise bg-white/10 ring-1 ring-[#F5C000]/50" : "bg-white/[.04]"}`}>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-[#F5C000]" title={`Clue ${n + 1}`}>{ICON[clue.kind]}</span>
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-[.14em] text-muted">{LABEL[clue.kind]}</span>
        <span className="block whitespace-pre-line text-[15px] font-semibold leading-snug">{clue.text}</span>
      </span>
    </li>
  );
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, "");

/** The guess box (busy: a guess is in flight, picks wait; locked: input off, e.g. a 1v1 lockout): word-prefix search over the player pool, faces in the list, Enter picks the top match. */
export function NameSearch({ players, exclude, onPick, busy, locked, inputRef, placeholder = "Type a player's name", children }: {
  players: WhoP[]; exclude: Set<string>; onPick: (id: string) => void; busy?: boolean; locked?: boolean; inputRef?: RefObject<HTMLInputElement | null>;
  placeholder?: string; children?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const n = norm(q).trim();
    if (n.length < 2) return [];
    const words = n.split(" ");
    return players.filter((p) => !exclude.has(p.name) && words.every((w) => norm(p.name).split(" ").some((t) => t.startsWith(w)))).slice(0, 6);
  }, [q, players, exclude]);
  const pick = (id: string) => { if (busy || locked) return; setQ(""); onPick(id); };
  return (
    <>
      {matches.length > 0 && !locked && (
        <ul role="listbox" aria-label="Players" className="flex flex-col overflow-hidden rounded-2xl bg-deep/95 ring-1 ring-white/10">
          {matches.map((p) => (
            <li key={p.id}>
              <button role="option" aria-selected={false} onClick={() => pick(p.id)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-white/10 focus-visible:bg-white/10">
                <span className="flex min-w-0 items-center gap-2.5"><PlayerFace {...p} size={32} /><b className="truncate">{p.name}</b></span><span className="shrink-0 text-xs text-muted">{p.team}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <label className={`flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-white/10 px-3 ring-1 ring-white/15 focus-within:ring-[#F5C000] ${locked ? "opacity-50" : ""}`}>
          <MagnifyingGlass size={18} className="shrink-0 text-muted" aria-hidden />
          <input ref={inputRef} id="who-guess" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" autoCapitalize="words" spellCheck={false} disabled={locked}
            onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) pick(matches[0].id); }}
            placeholder={placeholder} aria-label="Your guess" className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none placeholder:text-muted" />
          {q && <button aria-label="Clear" onClick={() => setQ("")} className="text-muted"><X size={16} /></button>}
        </label>
        {children}
      </div>
    </>
  );
}
