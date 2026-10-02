"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AUTO_NEXT_SECONDS, QUESTION_SECONDS, tierOf } from "@/lib/game";
import { naturalBreak } from "@/lib/ads";
import { buzz, crack, soundOn, store, totalOf, type Result } from "@/lib/client";
import { type Profile } from "@/lib/profile";
import { avatarCode } from "@/lib/avatar";
import { encodeLook, randomLook } from "@/lib/rig";
import { track } from "./Analytics";
import { Avatar } from "./Avatar";
import { Board, useCountUp } from "./Board";
import type { GlobeApi, LngLat } from "./Globe";
import { ProfileSetup, type Account } from "./ProfileSetup";
import { Floodlights } from "./Stadium";
import { Results } from "./Results";
import { Crosshair, Crown, Fire, HandTap, House, Microphone, Minus, Plus, SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react";
import { Flag } from "./Flag";

const Globe = dynamic(() => import("./Globe"), { ssr: false });

export type Mode = "daily" | "edition" | "archive" | "practice" | "duel";
type Question = { id: string; text: string | null; mult: number }; // daily text arrives with its shot clock
type Round = { date?: string; key?: string; number?: number | null; title?: string | null; kind?: string; questions: Question[]; progress?: (Omit<Result, "mult" | "guess"> & { idx: number; lat: number; lng: number })[] };
type Phase = "loading" | "splash" | "aim" | "reveal" | "summary" | "error";
type Me = { profile: Profile | null; user: Account; googleEnabled: boolean; suggestedCountry: string | null };

/**
 * The game screen for every mode: daily (/play), editions (/match/…, /test/…), archive, Nets and friend duels.
 * Flow per round: ROUND n splash → aim (tap + GUESS) → result bar → next. After the last round: summary map + scorecard.
 */
export function Game({ mode, date, editionKey, duelId }: { mode: Mode; date?: string; editionKey?: string; duelId?: string }) {
  // Scored modes run the server shot clock and count for leaderboards; duels are head-to-head only.
  const scored = mode === "daily" || mode === "edition";
  const needsProfile = scored || mode === "duel";
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [round, setRound] = useState<Round | null>(null);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [pin, setPin] = useState<LngLat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [coach, setCoach] = useState(false);
  const [sound, setSound] = useState(() => typeof window !== "undefined" && soundOn());
  const [me, setMe] = useState<Me | null>(null);
  const [setup, setSetup] = useState(false);
  // First round ever, or arriving from a friend's score link: an arrival card (your player, what this is, the score to
  // beat) and nothing starts, the shot clock included, until they tap Play.
  const [arrival, setArrival] = useState(false);
  // Opened from a friend's shared result (/c/<score> → /play?c=<score>): show the score to beat.
  const [beat] = useState<number | null>(() => { if (typeof window === "undefined") return null; const c = Number(new URLSearchParams(window.location.search).get("c")); return Number.isFinite(c) && c > 0 ? Math.min(1000, c) : null; });
  const api = useRef<GlobeApi | null>(null);
  const [globeReady, setGlobeReady] = useState(false);
  // The shot clock must not start before the globe is on screen (slow phones / first load): startAt waits for the first
  // paint, capped so a stuck tile server can't block the game.
  const painted = useRef<{ done: boolean; wake: (() => void)[] }>({ done: false, wake: [] });
  const onPainted = useCallback(() => { painted.current.done = true; painted.current.wake.splice(0).forEach((f) => f()); }, []);
  const globePainted = () => painted.current.done ? Promise.resolve() : new Promise<void>((ok) => { painted.current.wake.push(ok); setTimeout(ok, 15_000); });
  const [deadline, setDeadline] = useState(0); // Date.now() when the shot clock hits zero
  const [now, setNow] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [autoNext, setAutoNext] = useState(AUTO_NEXT_SECONDS);
  const shownTotal = useCountUp(totalOf(results));
  const keyRef = useRef<string | undefined>(editionKey); // the round being played; the Daily's is its date
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const load = useCallback(async () => {
    const url = mode === "practice" ? "/api/practice"
      : mode === "duel" ? `/api/duels/${duelId}`
      : mode === "edition" ? `/api/round?key=${editionKey}`
      : `/api/round${date ? `?date=${date}` : ""}`;
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Couldn't load the round.");
    if (!data.questions?.length) throw new Error(mode === "practice" ? "You've faced every ball in the Nets. New ones arrive every day." : "This round has no questions yet.");
    return data as Round;
  }, [mode, date, editionKey, duelId]);

  // Load the round (and, for the daily, the profile), then start at the first unanswered question.
  useEffect(() => {
    const meP: Promise<Me | null> = needsProfile ? fetch("/api/me", { cache: "no-store" }).then((r) => r.json()) : Promise.resolve(null);
    Promise.all([load(), meP]).then(([r, m]) => {
      setRound(r); setMe(m); keyRef.current = editionKey ?? r.key ?? r.date;
      const done = (r.progress ?? []).map((p) => ({ points: p.points, km: p.km, mult: r.questions[p.idx].mult, guess: [p.lng, p.lat] as LngLat, answer: p.answer, rival: p.rival }));
      setResults(done);
      if (needsProfile && !m?.profile) {
        // Guests go straight in: a random character and guest handle, changeable any time. Signed-in players set up properly.
        if (m?.user) { setSetup(true); return; }
        const guest = { handle: "", avatar: avatarCode(encodeLook(randomLook()), "india"), country: m?.suggestedCountry ?? "IN" };
        fetch("/api/me", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(guest) })
          .then((x) => x.json()).then((d) => { setMe({ ...m!, profile: d.profile }); if (done.length) begin(r, done.length); else { setArrival(true); track("arrival_shown", { via: beat != null ? "score_link" : "first_round" }); } }, () => setSetup(true));
        return;
      }
      if (beat != null && !done.length) { setArrival(true); track("arrival_shown", { via: "score_link" }); return; }
      begin(r, done.length);
    }, (e) => { setError(e.message); setPhase("error"); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  function begin(r: Round, from: number) {
    if (from >= r.questions.length) { setPhase("summary"); return; }
    track("round_started", { mode, number: r.number, from });
    if (!store("pm_coached")) setCoach(true);
    startAt(from);
  }

  async function startAt(i: number) {
    setIdx(i); setPin(null); setTimedOut(false); setPhase("splash");
    await Promise.all([globePainted(), new Promise((r) => setTimeout(r, 950))]);
    await api.current?.reset();
    let remaining = QUESTION_SECONDS * 1000;
    if (scored) {
      // The server starts the clock and only now hands over the question text.
      const res = await fetch("/api/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idx: i, key: keyRef.current }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Couldn't start the question."); setPhase("error"); return; }
      setRound((r) => r && { ...r, questions: r.questions.map((q, j) => (j === i ? { ...q, id: data.id ?? q.id, text: data.text } : q)) });
      remaining = data.remainingMs;
    }
    setDeadline(Date.now() + remaining); setNow(Date.now());
    setPhase("aim");
  }

  const onReady = useCallback((g: GlobeApi) => { api.current = g; g.labels(true); setGlobeReady(true); if (phaseRef.current === "aim") g.reset(); }, []);
  const onTap = useCallback((p: LngLat) => {
    if (phaseRef.current !== "aim") return;
    setPin(p); api.current?.setPin(p); buzz(8); setCoach(false); store("pm_coached", true);
  }, []);

  // At time-up a placed ball is submitted as the guess; with no ball the question scores 0.
  async function guess(clockRanOut = false) {
    if (!round || phaseRef.current !== "aim" || (!pin && !clockRanOut)) return;
    phaseRef.current = "reveal"; setPhase("reveal"); buzz(12);
    const q = round.questions[idx];
    const miss = !pin;
    const payload = miss ? { timedOut: true } : { lat: pin[1], lng: pin[0] };
    // Never leave the player stuck on "reveal": a failed or slow request goes back to aiming (pin kept) so they can retry.
    let res: Response, data: { error?: string; xp?: number; test?: boolean; points: number; km: number; late?: boolean; answer: Result["answer"]; rival?: Result["rival"] };
    try {
      res = await fetch(scored ? "/api/guess" : mode === "duel" ? `/api/duels/${duelId}/guess` : "/api/check", {
        method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(10_000),
        body: JSON.stringify(scored ? { idx, key: keyRef.current, ...payload } : mode === "duel" ? { idx, ...payload } : { id: q.id, ...payload }),
      });
      data = await res.json();
    } catch {
      if (clockRanOut) { setError("Couldn't reach the server. Reload to carry on — your progress is saved."); setPhase("error"); return; } // no auto-retry loop
      phaseRef.current = "aim"; setPhase("aim"); setNotice("Connection hiccup. Tap Guess again."); return;
    }
    if (!res.ok || !data.answer) {
      if (!clockRanOut && (res.status >= 500 || !data.error)) { phaseRef.current = "aim"; setPhase("aim"); setNotice("Couldn't score that ball. Tap Guess again."); return; }
      setError(data.error ?? "Couldn't score that guess."); setPhase("error"); return;
    }
    setNotice(null);
    const answer: LngLat = [data.answer.lng, data.answer.lat];
    const r: Result = { xp: data.xp, test: data.test, rival: data.rival, points: data.points, km: data.km, mult: q.mult, guess: pin ?? answer, answer: data.answer };
    setTimedOut(miss || !!data.late);
    // The result shows even if the globe animation stalls (tab in background, map still loading).
    // The wicket drops and the flight starts at once; the result bar follows within 0.7 s while the camera finishes, so
    // feedback is instant and nothing from this ball can spill into the next one (Globe cancels stale reveals).
    const anim = pin ? api.current?.reveal(pin, answer, { perfect: r.points === 100 }) : api.current?.showAnswer(answer);
    await Promise.race([anim, new Promise((ok) => setTimeout(ok, 700))]);
    crack(); if (r.points === 100) buzz([30, 40, 70]);
    setAutoNext(AUTO_NEXT_SECONDS);
    setResults((rs) => [...rs, r]);
    track("question_answered", { mode, idx, points: r.points, km: Math.round(r.km), xp: r.xp ?? 0 });
  }

  // Shot clock: tick while aiming, auto-submit at zero.
  useEffect(() => {
    if (phase !== "aim") return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [phase]);
  const guessRef = useRef(guess);
  useEffect(() => { guessRef.current = guess; });
  useEffect(() => {
    if (phase === "aim" && deadline && now >= deadline) guessRef.current(true);
  }, [phase, now, deadline]);

  // Result screen moves on by itself after AUTO_NEXT_SECONDS.
  const nextRef = useRef<() => void>(() => {});
  useEffect(() => { nextRef.current = next; });
  const showingResult = phase === "reveal" && results.length === idx + 1;
  useEffect(() => {
    if (!showingResult) return;
    const t = setInterval(() => setAutoNext((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [showingResult]);
  useEffect(() => { if (showingResult && autoNext === 0) nextRef.current(); }, [showingResult, autoNext]);

  // Keyboard: Enter or Space guesses while aiming, and moves on from the result screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
      if (phaseRef.current === "aim") { e.preventDefault(); guessRef.current(); }
      else if (phaseRef.current === "reveal") { e.preventDefault(); nextRef.current(); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  function next() {
    if (!round) return;
    if (phaseRef.current !== "reveal") return; // a click and the auto-advance can race
    phaseRef.current = "splash";
    if (idx + 1 < round.questions.length) startAt(idx + 1);
    // The scorecard is a natural break: maybe an interstitial first (capped, never the first game of the day; see lib/ads).
    else { track("round_completed", { mode, total: totalOf(results) }); void naturalBreak(mode === "practice" ? "nets_done" : "round_done").then(() => setPhase("summary")); }
  }

  // Summary: draw every flight path; leave room for the scorecard panel (right on desktop, bottom on phones).
  useEffect(() => {
    if (phase !== "summary" || !globeReady || !api.current) return;
    const wide = window.innerWidth >= 1024; // matches the lg: breakpoint where Results becomes a 480px side panel
    api.current.summary(
      results.map((r) => ({ guess: r.guess, answer: [r.answer.lng, r.answer.lat] as LngLat })),
      wide ? { top: 90, bottom: 60, left: 50, right: 520 } : { top: 70, bottom: Math.round(window.innerHeight * 0.6) + 20, left: 30, right: 30 },
    );
  }, [phase, results, globeReady]);

  async function newPractice() {
    await naturalBreak("nets_next");
    const r = await load().catch(() => null);
    if (!r) return;
    setRound(r); setResults([]); begin(r, 0);
  }

  function toggleSound() { const v = !sound; setSound(v); store("pm_sound", v); if (v) crack(); }

  const q = round?.questions[idx];
  const n = round?.questions.length ?? 5;
  const last = phase === "reveal" && results.length === idx + 1 ? results[idx] : null;
  const tier = last ? (timedOut && last.points === 0 ? { ...tierOf(0), toast: "Time up!" } : tierOf(last.points)) : null;
  const inRound = phase === "splash" || phase === "aim" || phase === "reveal";
  const streakGreens = (() => { let c = 0; for (let i = results.length - 1; i >= 0 && results[i].points >= 90; i--) c++; return c; })();
  const combo = streakGreens >= 3 ? "Hat-trick!" : streakGreens === 2 ? "On fire" : null;
  const label = mode === "practice" ? "Nets" : mode === "duel" ? "Duel" : mode === "edition" ? (round?.kind === "test" ? (editionKey?.startsWith("test-am-") ? "Morning Test" : "Evening Test") : round?.kind === "evening" ? "Evening Daily" : "Match Day") : round?.number ? `No. ${round.number}` : mode === "archive" ? (round?.title?.split(" · ")[0] ?? "Archive") : "";

  return (
    <main className="night-sky fixed inset-0 overflow-hidden">
      <div className="stars" aria-hidden />
      {/* Floodlights switch on as the game starts and stay on for every ball */}
      <div className={`floodlights-play ${phase === "loading" ? "" : "on"}`}><Floodlights /></div>
      <Globe onTap={onTap} onReady={onReady} onPainted={onPainted} />

      {/* Top HUD: player on the left, Round / Score boxes on the right */}
      {(inRound || phase === "summary") && (
        <div className="tv-ui pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-1.5 px-2 pt-[calc(env(safe-area-inset-top)+10px)] min-[420px]:gap-3 min-[420px]:px-3 sm:px-5">
          {/* The player box doubles as the way home (progress is saved, so leaving mid-round is safe). */}
          <Link href="/" aria-label="Home" className="pointer-events-auto flex min-w-0 items-center gap-2 !text-cream !no-underline">
            {me?.profile ? (
              <div className="hud-box flex min-w-0 items-center gap-2 py-1 pl-1 pr-2 min-[420px]:pr-3">
                <Avatar code={me.profile.avatar} size={34} />
                <div className="min-w-0 leading-tight">
                  <div className="max-w-[5.5rem] truncate text-sm font-semibold min-[420px]:max-w-[11rem]">@{me.profile.handle}</div>
                  <div className="hud-label flex items-center gap-1"><Flag code={me.profile.country} size={10} /> {label}</div>
                </div>
              </div>
            ) : <div className="hud-box flex items-center gap-2 px-3 py-2"><House weight="fill" size={14} className="text-muted" /><span className="hud-label">{label}</span></div>}
          </Link>
          <div className={`pointer-events-auto flex shrink-0 items-stretch gap-1 min-[420px]:gap-1.5 ${phase === "summary" ? "hidden" : ""}`}>
            <div className="hud-box flex flex-col items-center justify-center px-2 py-1.5 min-[420px]:px-3">
              <span className="hud-label">Round</span>
              <span className="display text-lg leading-none">{Math.min(idx + 1, n)}<span className="text-muted"> / {n}</span></span>
            </div>
            <div key={results.length} className={`hud-box flex flex-col items-center justify-center px-1.5 py-1.5 min-[420px]:px-2.5 ${results.length ? "score-pulse" : ""}`}>
              <span className="hud-label">Score</span>
              <Board value={shownTotal} />
            </div>
            {phase === "aim" && <ShotClock left={Math.max(0, deadline - now)} />}
            {phase === "aim" && me?.profile && deadline - now < 6000 && <span className="hud-box hidden place-items-center px-1 min-[480px]:grid"><Avatar code={me.profile.avatar} size={40} mood="nervous" /></span>}
            <button onClick={toggleSound} aria-label={sound ? "Sound on" : "Sound off"} className="hud-box grid w-9 place-items-center min-[420px]:w-10">{sound ? <SpeakerHigh weight="fill" size={18} /> : <SpeakerSlash weight="fill" size={18} className="text-muted" />}</button>
          </div>
        </div>
      )}

      {/* Question banner */}
      {(phase === "aim" || phase === "reveal") && q?.text && (
        <div className="tv-ui pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+68px)] mx-auto max-w-[720px] px-3">
          <div className="glass pointer-events-auto overflow-hidden rounded-3xl rise">
            <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-ball to-[#B0203A] px-4 py-1.5">
              <span className="display flex items-center gap-2 text-xs tracking-[.14em]"><span className="live-dot" aria-hidden /><Microphone weight="fill" size={14} />Commentary · Ball {idx + 1}</span>
              <div className="flex items-center gap-2">
                {combo && <span className="combo display flex items-center gap-1 rounded-full bg-ok px-2.5 py-0.5 text-[11px] text-deep">{streakGreens >= 3 ? <Crown weight="fill" size={12} /> : <Fire weight="fill" size={12} />}{combo}</span>}
                {q.mult > 1 && <span className="display rounded-full bg-white px-2.5 py-0.5 text-[11px] text-deep">×{q.mult} points</span>}
              </div>
            </div>
            <div className="px-4 pb-4 pt-3">
              <Typewriter key={q.id} text={q.text ?? ""} className="text-[18px] font-semibold leading-snug [text-wrap:pretty] sm:text-xl" />
              <div className="mt-3 flex gap-1.5" aria-hidden>
                {round!.questions.map((_, i) => (
                  <span key={i} className={`h-1.5 flex-1 rounded-full ${i < results.length ? (results[i].points >= 90 ? "bg-good" : results[i].points >= 50 ? "bg-ok" : "bg-ball") : i === idx ? "bg-white" : "bg-white/15"}`} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ROUND n splash between rounds */}
      {phase === "splash" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="round-splash text-center">
            <div className="display text-sm tracking-[.3em] text-muted">{label}</div>
            <div className="display text-[clamp(64px,16vw,140px)] leading-none [text-shadow:0_8px_0_rgba(0,0,0,.25)]">Round {idx + 1}</div>
            {q && q.mult > 1 && <div className="display mt-2 inline-block rounded-full bg-ok px-4 py-1 text-lg text-deep">×{q.mult} points</div>}
            {beat != null && idx === 0 && <div className="display mt-3 rounded-full bg-ball/80 px-4 py-1.5 text-base">Your friend scored {beat}/1000. Beat it!</div>}
          </div>
        </div>
      )}

      {coach && phase === "aim" && (
        <div className="pointer-events-none absolute left-1/2 top-[55%] -translate-x-1/2 -translate-y-1/2 rounded-2xl [@media(max-height:520px)]:hidden border border-white/15 bg-deep/85 px-4 py-3 text-center text-sm leading-normal">
          Drag to spin · Pinch or scroll to zoom<br /><b>Tap to drop your ball, then press Guess</b>
        </div>
      )}

      {/* Guess dock. No ball yet: an instruction pill (a disabled button reads as broken). Ball placed: GUESS springs in. */}
      {phase === "aim" && (
        <div className="tv-ui pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center gap-2.5 px-3 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:justify-end sm:px-5">
          <div className="pointer-events-auto flex flex-col gap-1.5">
            <button aria-label="Zoom in" onClick={() => api.current?.zoom(0.9)} className="btn-ghost grid h-12 w-12 place-items-center backdrop-blur"><Plus weight="bold" size={20} /></button>
            <button aria-label="Zoom out" onClick={() => api.current?.zoom(-0.9)} className="btn-ghost grid h-12 w-12 place-items-center backdrop-blur"><Minus weight="bold" size={20} /></button>
          </div>
          <div className="pointer-events-auto flex flex-1 flex-col items-stretch gap-2 sm:w-[360px] sm:flex-none">
            {pin ? (
              <>
                {notice ? <p role="alert" className="rounded-full bg-ball/90 px-3 py-1.5 text-center text-sm font-semibold">{notice}</p>
                  : <p className="flex items-center justify-center gap-1.5 text-xs text-muted"><HandTap size={14} />Tap again to move your ball</p>}
                <button key="guess" className="btn-primary guess-in flex items-center justify-center gap-3 py-5 text-[30px]" onClick={() => guess()}>
                  <span className="pm-ball !m-0 !h-7 !w-7" aria-hidden />Guess
                  <kbd className="hidden rounded-md bg-black/20 px-1.5 py-0.5 font-sans text-xs not-italic sm:inline">Enter</kbd>
                </button>
              </>
            ) : (
              <div className="glass flex items-center gap-3 rounded-full py-3 pl-3 pr-5" role="status">
                <span className="target-pulse grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/10"><Crosshair weight="duotone" size={28} className="text-ok" /></span>
                <span className="leading-tight">
                  <span className="display block text-lg">Pitch your ball</span>
                  <span className="text-sm text-muted">Tap the spot on the globe where it happened</span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Result bar after each guess */}
      {phase === "reveal" && last && tier && (
        <>
          <span key={`fp${idx}`} className="float-points left-1/2 top-[40%]" style={{ ["--dx" as string]: "38vw", ["--dy" as string]: "-38vh" }}>+{last.points * last.mult}</span>
          {last.points >= 90 && <Confetti key={`cf${idx}`} />}
        </>
      )}
      {phase === "reveal" && last && tier && (
        <div role="status" className="tv-ui pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-[calc(env(safe-area-inset-bottom)+14px)]">
          <div className="rise glass pointer-events-auto mx-auto flex max-w-[760px] flex-col items-center gap-3 rounded-3xl px-5 pb-5 pt-4 text-center shadow-[0_-10px_40px_rgba(0,0,0,.4)]">
            <div className="flex items-center gap-3">
              {me?.profile && <Avatar code={me.profile.avatar} size={56} mood={last.points >= 90 ? "celebrate" : last.points >= 60 ? "happy" : last.points >= 25 ? "shocked" : "sad"} key={`mood${idx}`} />}
              <div className="display text-2xl" style={{ color: tier.color }}>{tier.toast}</div>
            </div>
            <div className="display text-[44px] leading-none">
              {(last.points * last.mult).toLocaleString("en-IN")} <span className="text-xl text-muted">points{last.mult > 1 ? ` (${last.points} ×${last.mult})` : ""}</span>
              {last.xp != null && last.xp !== 0 && (
                <span className={`xp-chip ml-2 inline-block rounded-full px-2.5 py-0.5 align-middle text-sm font-bold ${last.xp > 0 ? "bg-ok/20 text-ok" : "bg-ball/25 text-ball"}`}>
                  {last.xp > 0 ? `+${last.xp} XP${last.test ? " · ×2 Test" : ""}` : `${last.xp} XP`}
                </span>
              )}
            </div>
            <div className="h-3 w-full max-w-[520px] overflow-hidden rounded-full bg-white/15" aria-hidden>
              <i className="points-bar block h-full rounded-full" style={{ width: `${last.points}%` }} />
            </div>
            {last.rival && (
              <p className="display rounded-full bg-white/10 px-3 py-1 text-sm">
                @{last.rival.handle}: {(last.rival.points * last.mult).toLocaleString("en-IN")} · you {last.points > last.rival.points ? "won" : last.points < last.rival.points ? "lost" : "tied"} this ball
                <span className="text-muted"> · {totalOf(results).toLocaleString("en-IN")} – {results.reduce((t, x) => t + (x.rival?.points ?? 0) * x.mult, 0).toLocaleString("en-IN")}</span>
              </p>
            )}
            <p className="text-[15px]">
              {timedOut && last.points === 0
                ? <>The clock ran out. It was <b>{last.answer.name}</b></>
                : <>Your ball landed <b>{last.km < 1 ? "under 1" : Math.round(last.km).toLocaleString("en-IN")} km</b> from <b>{last.answer.name}</b></>}
            </p>
            <p className="max-w-[60ch] text-sm leading-relaxed text-[#E4E1FA]"><span className="text-muted">{last.answer.when} · </span>{last.answer.story}</p>
            <button autoFocus className="btn-primary mt-1 w-full max-w-[340px] py-4 text-2xl" onClick={next}>
              {idx + 1 < n ? "Next round" : "View summary"} <span className="opacity-70">· {autoNext}</span>
            </button>
          </div>
        </div>
      )}

      {phase === "summary" && round && (
        <Results profile={me?.profile ?? null} mode={mode} number={round.number ?? 0} date={round.date} results={results}
          title={round.title ?? null} duelId={duelId} questionIds={round.questions.map((q) => q.id)}
          onPractice={mode === "practice" ? newPractice : () => router.push("/nets")} />
      )}

      {setup && me && (
        <ProfileSetup initial={me.profile} suggestedCountry={me.suggestedCountry} user={me.user} googleEnabled={me.googleEnabled}
          onCancel={() => (arrival ? setSetup(false) : router.push("/"))}
          onDone={(profile) => { setMe({ ...me, profile }); setSetup(false); track("profile_saved", { country: profile.country }); if (round && !arrival) begin(round, results.length); }} />
      )}

      {arrival && round && me?.profile && !setup && (
        <div className="tv-ui absolute inset-x-0 bottom-0 z-30 mx-auto max-w-[520px] px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <div className="glass flex flex-col items-center gap-3 rounded-3xl p-5 text-center">
            {beat != null ? <>
              <p className="display text-xs tracking-[.18em] text-[#F5C000]">A FRIEND CHALLENGED YOU</p>
              <p className="display text-3xl leading-tight">They scored {beat}/1000.<br />Can you beat it?</p>
            </> : <>
              <p className="display text-xs tracking-[.18em] text-[#F5C000]">TODAY&apos;S DAILY</p>
              <p className="display text-3xl leading-tight">5 famous cricket moments.<br />Pin each one on the globe.</p>
            </>}
            <p className="text-sm text-muted">Closer pins score more. You get {QUESTION_SECONDS} seconds a ball, and the clock only starts when you tap Play.</p>
            <div className="flex w-full items-center gap-3 rounded-2xl bg-white/5 p-3 text-left">
              <Avatar code={me.profile.avatar} size={56} />
              <span className="min-w-0 flex-1"><span className="block text-xs text-muted">Batting as</span><b className="block truncate">@{me.profile.handle}</b></span>
              <button onClick={() => { setSetup(true); track("arrival_change_player"); }} className="btn-ghost shrink-0 px-3 py-2 text-sm font-semibold">Change</button>
            </div>
            <button onClick={() => { setArrival(false); track("arrival_play"); begin(round, results.length); }} className="btn-primary w-full py-4 text-2xl">Play</button>
          </div>
        </div>
      )}

      {phase === "loading" && !setup && !arrival && (
        <div className="absolute inset-0 grid place-items-center"><div className="display animate-pulse text-xl text-muted">Walking out to bat…</div></div>
      )}

      {phase === "error" && (
        <div className="absolute inset-0 grid place-items-center px-4">
          <div className="glass max-w-sm rounded-3xl p-5 text-center">
            <p className="mb-4">{error}</p>
            <Link href="/" className="btn-primary inline-block px-6 py-3">Back to home</Link>
          </div>
        </div>
      )}
    </main>
  );
}

/** Reveals the question like a live caption. Instant for reduced motion. */
function Typewriter({ text, className }: { text: string; className?: string }) {
  // Remounted per question (keyed), so the initial value is per question too.
  const [n, setN] = useState(() => (typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches ? text.length : 0));
  useEffect(() => {
    const step = Math.max(1, Math.round(text.length / 40)); // ~0.7s regardless of length
    const t = setInterval(() => setN((v) => (v >= text.length ? (clearInterval(t), v) : v + step)), 18);
    return () => clearInterval(t);
  }, [text]);
  return (
    <p className={className} aria-label={text}>
      <span aria-hidden>{text.slice(0, n)}</span><span aria-hidden className="opacity-0">{text.slice(n)}</span>
    </p>
  );
}

const CONFETTI = ["#FFC83D", "#8BD94F", "#E8344E", "#3FA9F5", "#FFFFFF", "#FF8A3D"];
/** A short burst for 90+ taps. Deterministic per mount so it renders the same on every device. */
function Confetti() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 36 }, (_, i) => (
        <i key={i} className="confetti-piece" style={{
          left: `${(i * 37) % 100}%`, background: CONFETTI[i % CONFETTI.length], animationDelay: `${(i % 6) * 40}ms`,
          ["--x" as string]: `${((i * 53) % 120) - 60}px`, ["--r" as string]: `${(i * 97) % 720}deg`,
        }} />
      ))}
    </div>
  );
}

/** Countdown ring in the HUD; turns red for the last 5 seconds. */
function ShotClock({ left }: { left: number }) {
  const secs = Math.ceil(left / 1000);
  const frac = left / (QUESTION_SECONDS * 1000);
  const hot = secs <= 5;
  const C = 2 * Math.PI * 16;
  return (
    <div className={`hud-box grid w-14 place-items-center ${hot ? "clock-hot" : ""}`} role="timer" aria-label={`${secs} seconds left`}>
      <svg width="42" height="42" viewBox="0 0 40 40" className="-rotate-90">
        <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="4" />
        <circle cx="20" cy="20" r="16" fill="none" stroke={hot ? "#E8344E" : "#8BD94F"} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ transition: "stroke-dashoffset .1s linear" }} />
      </svg>
      <span className="display absolute text-base">{secs}</span>
    </div>
  );
}
