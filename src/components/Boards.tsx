"use client";

import { CaretDown, Info, Medal } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { countryName } from "@/lib/profile";
import { Avatar } from "./Avatar";
import { Flag } from "./Flag";
import { Rank } from "./Rank";

type Id = "ranking" | "points" | "accuracy" | "streak" | "effort" | "h2h" | "countries";
type Row = { rank: number; handle: string; avatar: string; country: string | null; value: number; sub: string; provisional: boolean; me: boolean };
type Board = { board: Id; count: number; top: Row[]; me: (Row & { ranked: boolean; guest: boolean }) | null };
type Mine = { value: number; rank: number; of: number; ranked: boolean; provisional: boolean; sub: string } | null;

const TABS: { id: Id; label: string; unit: string; what: string }[] = [
  { id: "ranking", label: "Ranking", unit: "pts", what: "How much of the maximum you score across every game (Tests count double, recent games count most), scaled by how regularly you play. Out of 1,000, like the ICC rankings." },
  { id: "points", label: "Points", unit: "pts", what: "Every point from the Daily, Evening Daily and both Test Matches, added up." },
  { id: "accuracy", label: "Accuracy", unit: "avg", what: "Average points per ball over the last 30 days. 25 balls to qualify." },
  { id: "streak", label: "Streak", unit: "days", what: "Days in a row with a finished game. Freezes and saves keep it alive." },
  { id: "effort", label: "Effort", unit: "XP", what: "League XP earned this week in any mode. Resets Monday." },
  { id: "h2h", label: "1v1", unit: "Elo", what: "Skill rating from live 1v1s and Cups. 3 rated matches to qualify." },
  { id: "countries", label: "Countries", unit: "avg", what: "Average Ranking of each country's ranked players." },
];
const num = (id: Id, v: number) => (id === "accuracy" ? v.toFixed(1) : v.toLocaleString("en-IN"));

/**
 * Every leaderboard in one panel (lib/boards.ts): your standing, one board at a time, one fact per row. A row's
 * breakdown opens on tap; the ⓘ explains the board. `full` = the /leaderboard page (top 50, breakdowns shown).
 */
export function Boards({ full = false, className = "" }: { full?: boolean; className?: string }) {
  const [tab, setTab] = useState<Id>("ranking");
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  const [loaded, setLoaded] = useState<{ key: string; b: Board } | null>(null);
  const [mine, setMine] = useState<Record<string, Mine> | null | undefined>(undefined);
  const [info, setInfo] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const limit = full ? 50 : 5;

  useEffect(() => { fetch("/api/boards?summary=1", { cache: "no-store" }).then((r) => r.json()).then(setMine, () => setMine(null)); }, []);
  const key = `${tab}:${period}:${limit}`;
  useEffect(() => {
    const empty: Board = { board: tab, count: 0, top: [], me: null };
    fetch(`/api/boards?board=${tab}&period=${period}&limit=${limit}`, { cache: "no-store" }).then((r) => r.json())
      .then((b) => setLoaded({ key, b: Array.isArray(b?.top) ? b : empty }), () => setLoaded({ key, b: empty }));
  }, [key, tab, period, limit]);
  const data = loaded?.key === key ? loaded.b : null; // a stale board never shows under a new tab
  const pick = (id: Id) => { setTab(id); setOpen(null); setInfo(false); };

  const t = TABS.find((x) => x.id === tab)!;
  const me = data?.me;
  // Your row goes where you'd actually stand, not at the bottom: an unranked "you" (guest, or sitting out) sits just
  // above the first ranked player it would beat, so 10 points never shows below 0.
  const rows: (Row & { you?: boolean })[] = !data ? [] : !me || data.top.some((r) => r.me) ? data.top
    : me.rank <= (data.top.at(-1)?.rank ?? 0) ? [...data.top.filter((r) => r.rank < me.rank), { ...me, you: !me.ranked }, ...data.top.filter((r) => r.rank >= me.rank)]
    : [...data.top, { ...me, you: !me.ranked }];
  const anyP = rows.some((r) => r.provisional);
  return (
    <section className={`glass flex min-w-0 flex-col gap-3.5 rounded-3xl p-4 ${className}`} aria-label="Leaderboards">
      <div className="flex items-center justify-between">
        <h3 className="display flex items-center gap-1.5 text-lg"><Medal weight="fill" size={18} className="text-[#F5C000]" />Leaderboards</h3>
        {!full && <Link href="/leaderboard" className="display text-xs text-ok hover:underline">All boards →</Link>}
      </div>

      <YouCard mine={mine} onPick={pick} />

      <div className="relative min-w-0">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]" role="tablist" aria-label="Board">
          {TABS.map((x) => (
            <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => pick(x.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-[12.5px] font-semibold transition ${tab === x.id ? "bg-white text-deep" : "text-muted hover:bg-white/10 hover:text-cream"}`}>
              {x.label}
            </button>
          ))}
        </div>
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[#1d1760] to-transparent" />
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        {tab === "points" ? (
          <div className="flex gap-1" role="tablist" aria-label="Period">
            {(["day", "week", "month"] as const).map((p) => (
              <button key={p} role="tab" aria-selected={period === p} onClick={() => setPeriod(p)}
                className={`rounded-full px-2 py-0.5 ${period === p ? "bg-white/15 text-cream" : "hover:text-cream"}`}>{p === "day" ? "Today" : p === "week" ? "Week" : "Month"}</button>
            ))}
          </div>
        ) : <span>{data ? `${data.count.toLocaleString("en-IN")} ${tab === "countries" ? "countries" : "players"}` : " "}</span>}
        <button onClick={() => setInfo((v) => !v)} aria-expanded={info} className="flex items-center gap-1 hover:text-cream"><Info size={14} />How it works</button>
      </div>
      {info && <p className="-mt-1.5 rounded-xl bg-white/5 px-3 py-2 text-xs leading-relaxed text-[#E4E1FA]">{t.what}{anyP ? " P = provisional (under 5 games), listed after established players." : ""}</p>}

      {!data ? <p className="py-6 text-center text-sm text-muted">Loading…</p>
        : rows.length === 0 ? <p className="py-5 text-center text-sm text-muted">{tab === "h2h" ? "Play 3 live 1v1s to get a rating." : "Nobody here yet. Play a game to be first."}</p>
        : (
          <ol className="flex flex-col">
            {rows.map((r, i) => (
              <li key={`${r.rank}-${r.handle}`}>
                {i > 0 && !r.you && !rows[i - 1].you && r.rank - rows[i - 1].rank > 1 && <div className="py-0.5 text-center text-xs text-muted" aria-hidden>···</div>}
                {i > 0 && r.you && r.rank - rows[i - 1].rank > 1 && <div className="py-0.5 text-center text-xs text-muted" aria-hidden>···</div>}
                <Line r={r} id={tab} unit={t.unit} open={full || open === i} onToggle={() => setOpen(open === i ? null : i)} />
              </li>
            ))}
          </ol>
        )}
      {me && !me.ranked && (
        <p className="text-center text-xs text-muted">
          {me.guest ? <>Guests aren&apos;t ranked. <Link href="/settings" className="text-ok">Sign in</Link> to take your place.</> : <>Only you can see your row right now.</>}
        </p>
      )}
    </section>
  );
}

/** Your position on the headline Ranking, big; your other boards as small chips that open them. */
function YouCard({ mine, onPick }: { mine: Record<string, Mine> | null | undefined; onPick: (id: Id) => void }) {
  if (mine === undefined) return <div className="h-[74px] animate-pulse rounded-2xl bg-white/5" />;
  const r = mine?.ranking;
  if (!mine || !Object.values(mine).some(Boolean)) return <p className="rounded-2xl bg-white/5 px-3 py-3 text-sm text-[#E4E1FA]">Finish any game to get your ranking.</p>;
  const chip = (id: Id, text: string | null) => text && (
    <button key={id} onClick={() => onPick(id)} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs hover:bg-white/15">{text}</button>
  );
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/[.07] px-3.5 py-3 ring-1 ring-white/10">
      <button onClick={() => onPick("ranking")} className="text-left">
        <span className="block text-[10px] uppercase tracking-wide text-muted">Your rank</span>
        <b className="display text-3xl leading-none">{r?.ranked ? `#${r.rank}` : "–"}</b>
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-sm">{r ? <><b>{r.value}</b> <span className="text-muted">pts{r.provisional ? " · provisional" : ""}{r.ranked ? ` · of ${r.of}` : " · not ranked yet"}</span></> : <span className="text-muted">No ranking yet</span>}</div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {chip("streak", mine.streak ? `🔥 ${mine.streak.value} day${mine.streak.value === 1 ? "" : "s"}` : null)}
          {chip("effort", mine.effort ? `${mine.effort.value.toLocaleString("en-IN")} XP` : null)}
          {chip("accuracy", mine.accuracy ? `${mine.accuracy.value} avg` : null)}
        </div>
      </div>
    </div>
  );
}

function Line({ r, id, unit, open, onToggle }: { r: Row & { you?: boolean }; id: Id; unit: string; open: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} aria-expanded={open}
      className={`grid w-full grid-cols-[24px_28px_1fr_auto] items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm hover:bg-white/5 ${r.me ? "bg-white/10" : ""}`}>
      <span className="grid place-items-center">{r.you ? <span className="display text-[10px] uppercase text-[#F5C000]" title={`You'd be #${r.rank}`}>you</span> : <Rank n={r.rank} />}</span>
      {id === "countries" ? <Flag code={r.country} size={18} /> : <Avatar code={r.avatar} size={28} />}
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium">{id === "countries" ? countryName(r.country ?? "") : r.handle}{r.me ? " (you)" : ""}</span>
          {id !== "countries" && <Flag code={r.country} size={11} />}
          {r.provisional && <span className="text-[10px] text-muted" title="Provisional: under 5 games">P</span>}
        </span>
        {open && <span className="mt-0.5 block text-[11px] leading-snug text-muted">{r.sub}</span>}
      </span>
      <span className="flex items-center gap-1 text-right">
        <b className="display tabular-nums">{id === "streak" ? `🔥${r.value}` : num(id, r.value)}</b>
        {id !== "streak" && <span className="text-[10px] text-muted">{unit}</span>}
        {!open && r.sub && <CaretDown size={10} className="text-muted/60" aria-hidden />}
      </span>
    </button>
  );
}
