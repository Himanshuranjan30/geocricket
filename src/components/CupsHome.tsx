"use client";

import { Globe, Lock, Trophy, UsersThree } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ensurePlayer } from "@/lib/client";
import { timeAt, untilLabel } from "@/lib/resetTime";
import { AccountMenu } from "./AccountMenu";
import { track } from "./Analytics";
import { Logo } from "./Logo";
import { Avatar } from "./Avatar";
import { Flag } from "./Flag";

type Card = { code: string; name: string; visibility: string; capacity: number; phase: string; startsMs: number; official: boolean; won?: boolean };
type Board = {
  players: { rank: number; handle: string; avatar: string | null; country: string | null; wins: number; finals: number }[];
  hosts: { rank: number; handle: string; avatar: string | null; country: string | null; hosted: number }[];
  countries: { rank: number; country: string; wins: number; hosted: number; players: number }[];
};
const QUICK = [["In 5 min", 5], ["In 15 min", 15], ["In 30 min", 30], ["In 1 hr", 60]] as const;
const phaseLabel: Record<string, string> = { lobby: "Open to join", checkin: "Check-in now", running: "Live now", done: "Finished", cancelled: "Cancelled" };

/** /cups: the official Daily Cup, open public cups, my cups, host a cup, and the cup leaderboards. */
export function CupsHome() {
  const router = useRouter();
  const [data, setData] = useState<{ open: Card[]; mine: Card[] } | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [period, setPeriod] = useState<"week" | "month" | "all">("all");
  const [tab, setTab] = useState<"players" | "countries" | "hosts">("players");
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState(8);
  const [mins, setMins] = useState(15);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const load = () => fetch("/api/cups", { cache: "no-store" }).then((r) => r.json()).then(setData, () => {});
    load();
    const a = setInterval(() => { if (!document.hidden) load(); }, 10_000), b = setInterval(() => setNow(Date.now()), 30_000);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);
  useEffect(() => { fetch(`/api/cups/leaderboard?period=${period}`, { cache: "no-store" }).then((r) => r.json()).then(setBoard, () => {}); }, [period]);

  async function host() {
    setBusy(true); setErr(null);
    if (!(await ensurePlayer())) { setBusy(false); setErr("Couldn't set up your player. Try again."); return; }
    const r = await fetch("/api/cups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name || "Friday Night Cup", capacity, startsMs: Date.now() + mins * 60_000, visibility }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(d.error ?? "Couldn't create the cup."); return; }
    track("cup_created", { capacity, visibility, starts_in_min: mins });
    router.push(`/cup/${d.code}`);
  }

  const official = data?.open.filter((c) => c.official) ?? [];
  const pub = data?.open.filter((c) => !c.official) ?? [];
  return (
    <main className="night-sky min-h-dvh overflow-x-hidden">
      <div className="stars" aria-hidden />
      <div className="tv-ui relative z-10 mx-auto flex max-w-[980px] flex-col gap-6 px-4 py-8">
        <header className="flex items-center justify-between gap-3"><Logo /><div className="flex items-center gap-2"><Link href="/" className="btn-ghost hidden px-4 py-2 text-sm sm:block">← Home</Link><AccountMenu /></div></header>
        <header className="text-center">
          <Trophy weight="duotone" size={48} className="mx-auto text-[#F5C000]" />
          <h1 className="display text-5xl leading-none">Cups</h1>
          <p className="mt-2 text-muted">Knockout tournaments. Every match is a live 1v1: last one standing lifts the trophy.</p>
        </header>

        {official.map((c) => <CupRow key={c.code} c={c} now={now} big />)}

        <section id="host" className="glass flex flex-col gap-4 rounded-3xl p-5">
          <h2 className="display text-2xl">Host a cup</h2>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Friday Night Cup" aria-label="Cup name"
            className="rounded-xl bg-deep/70 px-4 py-3 text-lg outline-none ring-1 ring-white/10 focus:ring-ok" />
          <div className="flex flex-col gap-1"><span className="hud-label">Players</span>
            <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Players">{[4, 8, 16, 32].map((n) => <Pill key={n} on={capacity === n} onClick={() => setCapacity(n)}>{n}</Pill>)}</div></div>
          <div className="flex flex-col gap-1"><span className="hud-label">Starts</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Start time">{QUICK.map(([l, m]) => <Pill key={m} on={mins === m} onClick={() => setMins(m)}>{l}</Pill>)}</div>
            <span className="text-xs text-muted">{timeAt(now + mins * 60_000, null)} · you can start early once 4 are in the lobby</span></div>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Who can join">
            <Pill on={visibility === "private"} onClick={() => setVisibility("private")}><Lock size={14} className="mr-1 inline" />Invite link only</Pill>
            <Pill on={visibility === "public"} onClick={() => setVisibility("public")}><Globe size={14} className="mr-1 inline" />Anyone can join</Pill>
          </div>
          {err && <p role="alert" className="rounded-xl bg-ball/20 px-3 py-2 text-sm">{err}</p>}
          <button className="btn-primary py-4 text-2xl" disabled={busy} onClick={host}>{busy ? "Creating…" : "Create cup"}</button>
        </section>

        {!!data?.mine.length && <section className="flex flex-col gap-2"><h2 className="display text-xl">My cups</h2>{data.mine.map((c) => <CupRow key={c.code} c={c} now={now} />)}</section>}
        <section className="flex flex-col gap-2">
          <h2 className="display text-xl">Open cups</h2>
          {pub.length ? pub.map((c) => <CupRow key={c.code} c={c} now={now} />) : <p className="text-sm text-muted">No public cups right now. Host one and share it!</p>}
        </section>

        <section id="leaderboard" className="glass flex flex-col gap-3 rounded-3xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="display text-2xl">Cup leaderboard</h2>
            <div className="flex gap-1">{(["week", "month", "all"] as const).map((p) => <Pill key={p} on={period === p} onClick={() => setPeriod(p)} small>{p === "all" ? "All time" : p}</Pill>)}</div>
          </div>
          <div className="flex gap-1">{(["players", "countries", "hosts"] as const).map((t) => <Pill key={t} on={tab === t} onClick={() => setTab(t)} small>{t}</Pill>)}</div>
          {!board ? <p className="text-sm text-muted">Loading…</p> : (
            <ol className="flex flex-col gap-1">
              {tab === "players" && (board.players.length ? board.players.map((r) => <Row key={r.rank} rank={r.rank} avatar={r.avatar} name={`@${r.handle}`} country={r.country} stat={`${r.wins} 🏆 · ${r.finals} finals`} />) : <Empty />)}
              {tab === "hosts" && (board.hosts.length ? board.hosts.map((r) => <Row key={r.rank} rank={r.rank} avatar={r.avatar} name={`@${r.handle}`} country={r.country} stat={`${r.hosted} cups hosted`} />) : <Empty />)}
              {tab === "countries" && (board.countries.length ? board.countries.map((r) => <Row key={r.rank} rank={r.rank} name={new Intl.DisplayNames(["en"], { type: "region" }).of(r.country) ?? r.country} country={r.country} stat={`${r.wins} 🏆 · ${r.hosted} hosted`} />) : <Empty />)}
            </ol>
          )}
          <p className="text-[11px] text-muted">Counts signed-in players in cups with 4+ signed-in players. Hosting counts for cups of 8+ (max 3 a day).</p>
        </section>
        <Link href="/" className="text-center text-sm text-muted">Home</Link>
      </div>
    </main>
  );
}

function Pill({ on, onClick, children, small }: { on: boolean; onClick: () => void; children: React.ReactNode; small?: boolean }) {
  return <button type="button" role="radio" aria-checked={on} onClick={onClick} className={`display rounded-full capitalize transition ${small ? "px-3 py-1 text-[11px]" : "px-3 py-2.5 text-sm"} ${on ? "bg-ok text-deep" : "bg-white/10 text-cream hover:bg-white/15"}`}>{children}</button>;
}

function CupRow({ c, now, big }: { c: Card; now: number; big?: boolean }) {
  const soon = c.phase === "lobby" || c.phase === "checkin";
  return (
    <Link href={`/cup/${c.code}`} className={`mode-card group !flex items-center gap-3 !no-underline ${c.phase === "running" || c.phase === "checkin" ? "hot" : ""} ${big ? "!py-5" : ""}`}>
      <Trophy weight="duotone" size={big ? 44 : 32} className="shrink-0 text-[#F5C000]" />
      <span className="mode-text min-w-0 flex-1">
        <b className={`display block truncate ${big ? "text-2xl" : "text-lg"} !text-cream`}>{c.name}{c.won ? " 🏆" : ""}</b>
        <span className="text-xs text-[#CFC8F5]">{c.capacity} players · {c.official ? "official" : c.visibility} · {phaseLabel[c.phase] ?? c.phase}{soon ? ` · ${timeAt(c.startsMs, null)} (in ${untilLabel(c.startsMs, now)})` : ""}</span>
      </span>
      <UsersThree size={20} className="shrink-0 text-muted" />
    </Link>
  );
}

function Row({ rank, avatar, name, country, stat }: { rank: number; avatar?: string | null; name: string; country: string | null; stat: string }) {
  return (
    <li className="hud-box flex items-center gap-2 px-3 py-2 text-sm">
      <span className="display w-6 text-center">{rank}</span>
      {avatar !== undefined && <Avatar code={avatar} size={26} />}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <Flag code={country} size={11} />
      <span className="text-xs text-muted">{stat}</span>
    </li>
  );
}
const Empty = () => <li className="text-sm text-muted">No finished cups yet. Be the first champion.</li>;
