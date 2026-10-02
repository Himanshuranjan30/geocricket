"use client";

import { ArrowRight, Fire, House, ShareNetwork, SkipForward, Sword, Trophy, WhatsappLogo } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buzz } from "@/lib/client";
import { POINTS, tile, type Clue } from "@/lib/whoRules";
import { track } from "./Analytics";
import type { GlobeApi } from "./Globe";
import { Mystery, PlayerFace } from "./PlayerFace";
import { ClueCard, NameSearch, type WhoP } from "./WhoParts";

const Globe = dynamic(() => import("./Globe"), { ssr: false });

type Item = {
  idx: number; clues: Clue[]; step: number; done: boolean; solvedAt: number | null; points: number; misses: (string | null)[];
  answer: { id: string; name: string; team: string; story: string; photo: boolean } | null;
};
type Rival = { handle: string | null; avatar: string | null; total: number; steps: (number | null)[] };
type Board = { rank: number; handle: string; total: number; host: boolean; me: boolean };
type Challenge = { slug: string; title: string; hostHandle: string; isHost: boolean; hostTotal: number | null; hostSteps: (number | null)[] | null; players: number; top: Board[]; me: Board | null };
type View = { date: string; number: number; items: Item[]; total: number; finished: boolean; result: { total: number; betterThan: number | null; share: string } | null; rival?: Rival | null; challenge?: Challenge | null };
type Top = { rank: number; handle: string; value: number; me: boolean }[];

/** Mystery Cricketer: three players a day (or a creator's challenge set, `set` = "c:<slug>"); clues reveal one at a
 * time, the globe flies to each ground. */
export function WhoGame({ date, vs, set, host }: { date?: string; vs?: string; set?: string; host?: string }) {
  const [view, setView] = useState<View | null>(null);
  const [players, setPlayers] = useState<WhoP[]>([]);
  const [rival, setRival] = useState<Rival | null>(null); // from a friend's "beat my Who" link
  const [cur, setCur] = useState<number | null>(null); // the puzzle on screen; null = day summary
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [streak, setStreak] = useState<number | null>(null);
  const [top, setTop] = useState<Top | null>(null);
  const [intro, setIntro] = useState(false); // a creator challenge opens on its card, not straight into clue 1
  const api = useRef<GlobeApi | null>(null);
  const [globeReady, setGlobeReady] = useState(false);
  const shown = useRef("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const qs = new URLSearchParams({ ...(set ? { set } : date ? { date } : {}), ...(vs ? { vs } : {}), ...(host ? { host } : {}) }).toString();
    fetch(`/api/who${qs ? `?${qs}` : ""}`, { cache: "no-store" }).then(async (r) => {
      const v = await r.json();
      if (!r.ok) { setError(v.error ?? "No puzzle today."); return; }
      setView(v);
      if (v.rival) { setRival(v.rival); track("who_challenge_opened", { number: v.number }); }
      const c = (v as View).challenge;
      if (c) {
        // The host's run is the score to beat (shown clue by clue, like a friend's challenge link).
        if (!c.isHost && c.hostTotal != null && c.hostSteps) setRival({ handle: c.hostHandle, avatar: null, total: c.hostTotal, steps: c.hostSteps });
        setIntro((v as View).items.every((i) => i.step === 0 && !i.done));
        track("creator_challenge_opened", { slug: c.slug, host: c.isHost });
      }
      const first = (v as View).items.findIndex((i) => !i.done);
      setCur(first < 0 ? null : first);
      track("who_opened", { number: v.number, resumed: first !== 0 });
    }, () => setError("Couldn't load today's players. Check your connection and refresh."));
    fetch("/api/who/players").then((r) => r.json()).then(setPlayers, () => {});
  }, [date, vs, set, host]);
  const finished = !!view?.finished;
  useEffect(() => {
    if (!finished) return;
    const t = setTimeout(() => { // results are saved just after the last guess
      if (set) { // a challenge: refresh its leaderboard (it doesn't count for the streak or the daily boards)
        fetch(`/api/who?set=${encodeURIComponent(set)}`, { cache: "no-store" }).then((r) => r.json()).then((v) => v?.challenge && setView(v), () => {});
        return;
      }
      fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then((m) => setStreak(m?.streak ?? null), () => {});
      fetch("/api/boards?board=who&period=day&limit=5", { cache: "no-store" }).then((r) => r.json()).then((b) => setTop(b?.top ?? null), () => {});
    }, 900);
    return () => clearTimeout(t);
  }, [finished, set]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 2600); return () => clearTimeout(t); }, [notice]);

  const item = view && cur !== null ? view.items[cur] : null;
  const rivalName = rival?.handle ? `@${rival.handle}` : "Your friend";
  const ch = view?.challenge ?? null;
  const onReady = useCallback((g: GlobeApi) => { api.current = g; g.labels(true); setGlobeReady(true); }, []);

  // Globe choreography: fly to the ground on clue 1, draw the career trail on clue 4, back to the ground on the reveal.
  useEffect(() => {
    const g = api.current;
    if (!g || !globeReady) return;
    if (!item) {
      if (view && shown.current !== "summary") { shown.current = "summary"; g.reset(); }
      return;
    }
    const withPins = [...item.clues].reverse().find((c) => c.pins?.length);
    const showTrail = !item.done && withPins?.kind === "trail";
    const key = `${view!.date}:${item.idx}:${showTrail ? "trail" : "pin"}`;
    if (shown.current === key || !withPins) return;
    const first = !shown.current.startsWith(`${view!.date}:${item.idx}:`);
    shown.current = key;
    const pad = { top: 110, bottom: Math.round(window.innerHeight * 0.5), left: 40, right: 40 };
    if (showTrail) g.trail(withPins.pins!, pad);
    else if (first) g.reset().then(() => g.showAnswer(item.clues[0].pins![0]));
    else g.showAnswer(item.clues[0].pins![0]);
  }, [item, view, globeReady]);

  const tried = useMemo(() => new Set(item?.misses.filter(Boolean) as string[]), [item]);
  async function send(pick: string | null) {
    if (!view || !item || busy) return;
    setBusy(true); setNotice(null);
    try {
      const r = await fetch("/api/who/guess", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: view.date, idx: item.idx, pick }) });
      const d = await r.json();
      if (!r.ok) { setNotice(d.error ?? "That didn't go through. Tap again."); return; }
      setView(d.view);
      const after = (d.view as View).items[item.idx];
      if (d.correct) { buzz([12, 40, 12]); track("who_solved", { clue: (after.solvedAt ?? 0) + 1, idx: item.idx }); }
      else if (pick) {
        buzz(30);
        const name = players.find((p) => p.id === pick)?.name ?? "them";
        setNotice(after.done ? `Not ${name}. Out of clues.` : `Not ${name}. Here's another clue.`);
        track("who_miss", { clue: item.step + 1, idx: item.idx });
      } else track("who_skip", { clue: item.step + 1, idx: item.idx });
      if ((d.view as View).finished) track("who_finished", { total: d.view.total, number: d.view.number });
    } catch {
      setNotice("Connection hiccup. Tap again; nothing was lost.");
    } finally { setBusy(false); }
  }

  const next = () => {
    if (!view || cur === null) return;
    const n = view.items.findIndex((i, k) => k > cur && !i.done);
    setCur(n < 0 ? null : n); setNotice(null);
    if (n >= 0) setTimeout(() => input.current?.focus(), 400);
  };

  async function share() {
    const text = view?.result?.share;
    if (!text) return;
    track("who_shared", { via: "native" });
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch { return; }
    copy();
  }
  function copy() {
    const text = view?.result?.share;
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); }, () => {});
    track("who_shared", { via: "copy" });
  }

  return (
    <main className="night-sky fixed inset-0 overflow-hidden">
      <div className="stars" aria-hidden />
      <Globe onTap={() => {}} onReady={onReady} />

      {/* Top HUD */}
      <div className="tv-ui pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-3 pt-[calc(env(safe-area-inset-top)+10px)] sm:px-5">
        <Link href="/" aria-label="Home" className="hud-box pointer-events-auto flex items-center gap-2 px-3 py-2 !text-cream !no-underline">
          <House weight="fill" size={14} className="text-muted" /><span className="hud-label">{ch ? ch.title : `Mystery Cricketer${view ? ` #${view.number}` : ""}`}</span>
        </Link>
        {view && (
          <div className="pointer-events-auto flex items-stretch gap-1.5">
            <div className="hud-box flex items-center gap-1.5 px-2 py-1.5" aria-label={`Player ${cur === null ? view.items.length : cur + 1} of ${view.items.length}`}>
              {view.items.map((i) => i.done && i.answer
                ? <PlayerFace key={i.idx} {...i.answer} size={30} className={i.solvedAt === null ? "opacity-50 grayscale" : ""} />
                : <Mystery key={i.idx} size={30} className={i.idx === cur ? "" : "opacity-40 [animation:none]"} />)}
            </div>
            <div className="hud-box flex flex-col items-center justify-center px-3 py-1.5">
              <span className="hud-label">Score</span>
              <span className="display text-lg leading-none tabular-nums">{view.total}</span>
            </div>
          </div>
        )}
      </div>

      {rival && view && !view.finished && (
        <div className="tv-ui pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+64px)] flex justify-center px-3">
          <p className="hud-box flex items-center gap-2 px-3 py-1.5 text-sm"><Sword weight="fill" className="text-[#F5C000]" />{ch && <span className="text-muted">Host</span>}<b>{rivalName}</b> scored {rival.total} <span aria-hidden>{rival.steps.map(tile).join("")}</span> · beat it</p>
        </div>
      )}

      {/* A creator challenge opens on its card: who's hosting, how many players, the score to beat */}
      {ch && intro && view && (
        <div className="tv-ui absolute inset-x-0 bottom-0 mx-auto max-w-[520px] px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <div className="glass flex flex-col items-center gap-3 rounded-3xl p-5 text-center">
            <p className="display text-xs tracking-[.18em] text-[#F5C000]">MYSTERY CRICKETER · CREATOR CHALLENGE</p>
            <h1 className="display text-3xl leading-tight">{ch.title}</h1>
            <p className="text-sm text-muted">Hosted by <b className="text-cream">@{ch.hostHandle}</b> · {view.items.length} cricketers · {ch.players} played</p>
            <div className="flex gap-2" aria-hidden>{view.items.map((i) => <Mystery key={i.idx} size={44} />)}</div>
            {ch.isHost ? <p className="rounded-2xl bg-[#F5C000]/15 px-3 py-2 text-sm">You&apos;re the host. Play first: your score is the one your followers have to beat.</p>
              : ch.hostTotal != null ? <p className="text-sm">The host scored <b>{ch.hostTotal}</b>/{view.items.length * POINTS[0]}. Can you beat it?</p>
              : <p className="text-sm text-muted">Name each cricketer in as few clues as you can.</p>}
            <button onClick={() => { setIntro(false); setTimeout(() => input.current?.focus(), 300); track("creator_challenge_start", { slug: ch.slug }); }} className="btn-primary w-full py-3.5 text-xl">Play</button>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-x-0 top-1/3 mx-auto max-w-sm px-4 text-center">
          <div className="glass rounded-3xl p-5"><p className="mb-3">{error}</p><Link href="/" className="btn-primary inline-block px-5 py-3 !no-underline">Back home</Link></div>
        </div>
      )}

      {/* The puzzle: clues stacked, the newest on top of the guess box */}
      {item && !intro && (
        <section aria-label={`Player ${item.idx + 1}`} className="tv-ui absolute inset-x-0 bottom-0 mx-auto flex max-h-[62svh] max-w-[620px] flex-col px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <div className="glass flex min-h-0 flex-col overflow-hidden rounded-3xl">
            <div className="flex items-center gap-3 bg-gradient-to-r from-ball to-[#B0203A] px-4 py-2">
              {item.done && item.answer ? <PlayerFace key="face" {...item.answer} size={40} className="face-pop" /> : <Mystery size={40} />}
              <span className="min-w-0 flex-1 leading-tight">
                <span className="display block text-[15px]">{item.done ? item.answer?.name : "Mystery player"}</span>
                <span className="block text-[11px] tracking-[.12em] text-white/80">PLAYER {item.idx + 1} OF {view!.items.length}{!item.done ? ` · CLUE ${item.step + 1} OF 5` : ""}</span>
              </span>
              {!item.done && <span className="display rounded-full bg-white px-2.5 py-0.5 text-[11px] text-deep">Worth {POINTS[item.step]}</span>}
            </div>
            <ol className="flex min-h-0 flex-col gap-2 overflow-y-auto px-3 pb-2 pt-3" aria-live="polite">
              {item.clues.map((c, i) => <ClueCard key={i} clue={c} n={i} fresh={i === item.clues.length - 1 && !item.done} />)}
            </ol>

            {!item.done ? (
              <div className="relative flex flex-col gap-2 border-t border-white/10 p-3">
                {item.misses.length > 0 && (
                  <p className="flex flex-wrap gap-1.5 text-xs text-muted">
                    {item.misses.map((m, i) => <span key={i} className="rounded-full bg-white/5 px-2 py-0.5 line-through decoration-ball">{m ?? "skipped"}</span>)}
                  </p>
                )}
                {notice && <p role="alert" className="rounded-full bg-ball/90 px-3 py-1.5 text-center text-sm font-semibold">{notice}</p>}
                <NameSearch players={players} exclude={tried} onPick={(id) => send(id)} busy={busy} inputRef={input}>
                  {item.step < 4 && (
                    <button onClick={() => send(null)} disabled={busy} className="btn-ghost flex shrink-0 items-center gap-1.5 px-3 text-sm font-semibold" aria-label="Show the next clue">
                      <SkipForward weight="fill" size={16} />Next clue
                    </button>
                  )}
                  {item.step === 4 && (
                    <button onClick={() => send(null)} disabled={busy} className="btn-ghost shrink-0 px-3 text-sm font-semibold">Give up</button>
                  )}
                </NameSearch>
              </div>
            ) : (
              <div className="flex flex-col gap-2 border-t border-white/10 p-4">
                <div className="flex items-center gap-3">
                  {item.answer && <PlayerFace {...item.answer} size={72} className="face-pop" />}
                  <div className="min-w-0">
                    <p className="display text-2xl leading-tight">{item.answer?.name}</p>
                    <p className="text-sm text-muted">{item.answer?.team}</p>
                    <p className={`display mt-1 inline-block rounded-full px-2.5 py-0.5 text-sm ${item.solvedAt !== null ? "bg-ok text-deep" : "bg-ball text-cream"}`}>
                      {item.solvedAt !== null ? `+${item.points} · clue ${item.solvedAt + 1}` : "Missed"}
                    </p>
                  </div>
                </div>
                <p className="text-[15px] leading-snug">{item.answer?.story}</p>
                {rival && <p className="text-sm text-muted"><Sword weight="fill" className="mr-1 inline text-[#F5C000]" />{rivalName} {rival.steps[item.idx] == null ? "missed him" : `named him on clue ${rival.steps[item.idx]! + 1}`}</p>}
                <button onClick={next} className="btn-primary mt-1 flex items-center justify-center gap-2 py-3.5 text-xl">
                  {view!.items.some((i, k) => k > item.idx && !i.done) ? <>Next player <ArrowRight weight="bold" /></> : <>See your score <ArrowRight weight="bold" /></>}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Day summary */}
      {view && cur === null && (
        <section aria-label="Today's score" className="tv-ui absolute inset-x-0 bottom-0 mx-auto max-w-[520px] px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <div className="glass flex max-h-[calc(100svh-env(safe-area-inset-top)-84px)] flex-col gap-3 overflow-y-auto rounded-3xl p-5 text-center">
            <p className="display text-sm tracking-[.16em] text-muted">{ch ? ch.title : `Mystery Cricketer #${view.number}`}</p>
            <p className="display text-5xl leading-none">{view.total}<span className="text-xl text-muted"> / {view.items.length * POINTS[0]}</span></p>
            <div className="flex justify-center gap-4">
              {view.items.map((i) => (
                <div key={i.idx} className="flex flex-col items-center gap-1">
                  {i.answer ? <PlayerFace {...i.answer} size={56} className={i.solvedAt === null ? "opacity-60 grayscale" : "face-pop"} /> : <Mystery size={56} />}
                  <span className="text-xl leading-none">{tile(i.solvedAt)}</span>
                </div>
              ))}
            </div>
            {!ch && streak != null && streak > 0 && <p className="flex items-center justify-center gap-1.5 text-sm"><Fire weight="fill" className="text-[#FF9F43]" /><b>{streak}-day streak</b><span className="text-muted">· counts with every game</span></p>}
            {!ch && view.result?.betterThan != null && <p className="text-sm text-muted">Better than {view.result.betterThan}% of players today</p>}
            {!ch && top && top.length > 0 && (
              <div className="rounded-2xl bg-white/5 p-3 text-left">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs uppercase tracking-[.14em] text-muted"><Trophy weight="fill" className="text-[#F5C000]" />Today&apos;s top</p>
                <ol className="flex flex-col gap-1 text-sm">
                  {top.map((t) => (
                    <li key={t.rank} className={`flex justify-between gap-2 rounded-lg px-2 py-1 ${t.me ? "bg-[#F5C000]/15 font-semibold" : ""}`}>
                      <span className="truncate">{t.rank}. {t.handle}</span><span className="tabular-nums">{t.value}</span>
                    </li>
                  ))}
                </ol>
                <Link href="/leaderboard" className="mt-1.5 block text-xs text-muted underline">All leaderboards</Link>
              </div>
            )}
            {ch && ch.top.length > 0 && (
              <div className="rounded-2xl bg-white/5 p-3 text-left">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs uppercase tracking-[.14em] text-muted"><Trophy weight="fill" className="text-[#F5C000]" />Challenge leaderboard · {ch.players} played</p>
                <ol className="flex max-h-56 flex-col gap-1 overflow-y-auto text-sm">
                  {ch.top.map((t) => (
                    <li key={t.rank} className={`flex justify-between gap-2 rounded-lg px-2 py-1 ${t.me ? "bg-[#F5C000]/15 font-semibold" : ""}`}>
                      <span className="truncate">{t.rank}. {t.handle}{t.host && <span className="ml-1.5 rounded-full bg-ball px-1.5 text-[10px] uppercase">Host</span>}</span><span className="tabular-nums">{t.total}</span>
                    </li>
                  ))}
                  {ch.me && ch.me.rank > ch.top.length && <li className="flex justify-between gap-2 rounded-lg bg-[#F5C000]/15 px-2 py-1 font-semibold"><span>{ch.me.rank}. You</span><span className="tabular-nums">{ch.me.total}</span></li>}
                </ol>
              </div>
            )}
            {ch?.isHost && <p className="text-sm text-muted">You set the score. Share the challenge so your followers can try to beat it.</p>}
            {rival && view.result && (
              <div className="rounded-2xl bg-white/5 p-3" aria-label="Head to head">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div><p className="text-xs text-muted">You</p><p className="display text-3xl">{view.total}</p><p aria-hidden>{view.items.map((i) => tile(i.solvedAt)).join("")}</p></div>
                  <span className="display text-muted">v</span>
                  <div><p className="truncate text-xs text-muted">{rivalName}</p><p className="display text-3xl">{rival.total}</p><p aria-hidden>{rival.steps.map(tile).join("")}</p></div>
                </div>
                <p className="display mt-1 text-lg">{view.total > rival.total ? `You win by ${view.total - rival.total}` : view.total < rival.total ? `${rivalName} wins by ${rival.total - view.total}` : "Dead heat"}</p>
              </div>
            )}
            <Link href="/mystery/duel" onClick={() => track("who_duel_cta", { from: "summary" })} className="btn-ghost flex items-center justify-center gap-2 py-3 font-semibold !text-cream !no-underline">
              <Sword weight="fill" className="text-[#F5C000]" />{rival && !ch ? `Race ${rivalName} live` : "1v1 Name Race"}<span className="text-sm font-normal text-muted">· first to name him wins</span>
            </Link>
            {view.result ? (
              <div className="flex flex-wrap justify-center gap-2">
                <button onClick={share} className="btn-primary flex items-center gap-2 px-5 py-3 text-lg"><ShareNetwork weight="bold" />Share</button>
                <a href={`https://wa.me/?text=${encodeURIComponent(view.result.share)}`} target="_blank" rel="noopener" onClick={() => track("who_shared", { via: "whatsapp" })}
                  className="btn-ghost flex items-center gap-2 px-4 py-3 font-semibold !text-cream !no-underline"><WhatsappLogo weight="fill" size={20} />Challenge on WhatsApp</a>
                <button onClick={copy} className="btn-ghost px-4 py-3 font-semibold">{copied ? "Copied" : "Copy"}</button>
              </div>
            ) : <p className="text-sm text-muted">Saving your score…</p>}
            {ch ? <p className="text-xs text-muted"><Link href="/mystery" className="underline">Play today&apos;s Mystery Cricketer</Link> · <Link href="/" className="underline">Home</Link></p>
              : <p className="text-xs text-muted">Three new players at midnight IST. <Link href="/" className="underline">Back home</Link></p>}
          </div>
        </section>
      )}
    </main>
  );
}
