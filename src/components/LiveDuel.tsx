"use client";

import { Crown, SpeakerHigh, SpeakerSlash, Sword, Timer } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { naturalBreak } from "@/lib/ads";
import { buzz, setSoundOn, sfx, siteUrl, soundOn } from "@/lib/client";
import { LIVE } from "@/lib/live";
import { track } from "./Analytics";
import { Avatar } from "./Avatar";
import { Flag } from "./Flag";
import type { GlobeApi, LngLat } from "./Globe";

const Globe = dynamic(() => import("./Globe"), { ssr: false });

type P = { slot: string; me: boolean; handle: string; avatar: string; country: string | null };
type View = {
  status: "open" | "playing" | "done"; now: number; players: P[]; hp?: Record<string, number>; winner?: string | null;
  cup?: { code: string; name: string; round: string } | null;
  log?: { round: number; damage: number; loser: string | null; points: Record<string, number> }[];
  round?: {
    n: number; mult: number; openMs: number; deadlineMs: number | null; firstGuessMs: number | null; resolvedMs: number | null; text: string | null;
    myGuess: { lat: number; lng: number; points: number } | null; guessed: string[];
    result: { answer: { name: string; when: string; story: string; lat: number; lng: number }; guesses: { slot: string; lat: number; lng: number; points: number; km: number }[] } | null;
  };
  error?: string;
};

/** A live 1v1 match. Polls the server about once a second; the server decides everything, the client just shows it. */
export function LiveDuel({ id }: { id: string }) {
  const router = useRouter();
  const [v, setV] = useState<View | null>(null);
  const [pinAt, setPinAt] = useState<{ round: number; p: LngLat } | null>(null); // a pin belongs to one round
  const [sending, setSending] = useState(false);
  const [skew, setSkew] = useState(0); // server time − local time
  const [clock, setClock] = useState(0); // local time, ticked by an interval (never read Date.now() during render)
  const api = useRef<GlobeApi | null>(null);
  const shownRound = useRef<string>("");
  const joined = useRef(false);
  const [fx, setFx] = useState<{ kind: "hit" | "hurt" | "draw"; dmg: number; key: number } | null>(null);
  const [muted, setMuted] = useState(() => typeof window !== "undefined" && !soundOn());
  const logRef = useRef<NonNullable<View["log"]>[number] | undefined>(undefined);
  useEffect(() => { if (!fx) return; const t = setTimeout(() => setFx(null), 1600); return () => clearTimeout(t); }, [fx]);

  const poll = useCallback(async () => {
    const r = await fetch(`/api/live/${id}`, { cache: "no-store" });
    const d: View = await r.json();
    if (d.now) setSkew(d.now - Date.now());
    setV(d);
  }, [id]);

  useEffect(() => {
    const first = setTimeout(poll, 0);
    const t = setInterval(poll, 800);
    const c = setInterval(() => setClock(Date.now()), 200);
    return () => { clearTimeout(first); clearInterval(t); clearInterval(c); };
  }, [poll]);

  // Arriving from an invite link: take the empty seat.
  useEffect(() => {
    if (!v || joined.current || v.status !== "open" || v.players.some((p) => p.me)) return;
    joined.current = true;
    fetch(`/api/live/${id}/join`, { method: "POST" }).then(poll);
  }, [v, id, poll]);

  const serverNow = clock + skew;
  const r = v?.round;
  const pin = pinAt && r && pinAt.round === r.n ? pinAt.p : null;
  const me = v?.players.find((p) => p.me);
  const opp = v?.players.find((p) => !p.me);
  const phase = !v ? "loading" : v.status === "open" ? "waiting" : v.status === "done" ? "done"
    : !r ? "loading" : r.resolvedMs != null ? "result" : serverNow < r.openMs ? "countdown" : r.myGuess ? "waitingOpp" : "aim";

  // Globe choreography per round: fresh globe when a round opens, both flight paths when it resolves.
  useEffect(() => {
    if (!r || !api.current) return;
    const key = `${r.n}:${r.resolvedMs != null ? "res" : "open"}`;
    if (shownRound.current === key) return;
    shownRound.current = key;
    if (r.result) {
      const a: LngLat = [r.result.answer.lng, r.result.answer.lat];
      api.current.summary(r.result.guesses.map((g) => ({ guess: [g.lng, g.lat] as LngLat, answer: a })), { top: 150, bottom: 300, left: 30, right: 30 });
      // The hit lands a beat after the pins fly: sound, shake/flash and a damage number toward whoever lost the round.
      // Not cancelled by re-renders: this effect re-runs on every poll, and the shownRound guard keeps it to once per round.
      // The log is read when the timer fires, by then it holds this round's result.
      setTimeout(() => {
        const l = logRef.current;
        const kind = !l?.loser || !l.damage ? "draw" : l.loser === me?.slot ? "hurt" : "hit";
        sfx(kind); buzz(kind === "hurt" ? [80, 40, 120] : kind === "hit" ? [20, 30, 40] : 15);
        setFx({ kind, dmg: l?.damage ?? 0, key: Date.now() });
      }, 700);
    } else {
      api.current.reset();
    }
  }, [r, me?.slot, opp?.slot]);

  const onReady = useCallback((g: GlobeApi) => { api.current = g; g.labels(true); }, []);
  const phaseRef = useRef(phase);
  const roundRef = useRef(-1);
  useEffect(() => { phaseRef.current = phase; roundRef.current = r?.n ?? -1; }, [phase, r?.n]);
  const onTap = useCallback((p: LngLat) => {
    if (phaseRef.current !== "aim") return;
    setPinAt({ round: roundRef.current, p }); api.current?.setPin(p); buzz(8);
  }, []);

  async function guess() {
    if (!pin || !r || sending) return;
    setSending(true);
    await fetch(`/api/live/${id}/guess`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ round: r.n, lat: pin[1], lng: pin[0] }) });
    setSending(false); sfx("lock"); buzz(12); poll();
  }

  async function rematch() {
    await naturalBreak("duel_rematch"); // natural break between duels (never mid-match, never in cups)
    const res = await fetch("/api/live", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "quick" }) });
    const d = await res.json();
    if (res.ok) { track("live_rematch"); router.push(`/live/${d.id}`); }
  }

  const secsLeft = r?.deadlineMs ? Math.max(0, Math.ceil((r.deadlineMs - serverNow) / 1000)) : null;
  const oppGuessedFirst = !!r && !r.myGuess && r.guessed.length > 0;
  const inviteUrl = `${siteUrl()}/live/${id}`;
  const last = v?.log?.[v.log.length - 1];
  useEffect(() => { logRef.current = last; }, [last]);

  // Beeps: every second of the pre-round countdown, "go" when the round opens, and the last 5 seconds of the clock.
  const countdownSec = phase === "countdown" && r ? Math.ceil((r.openMs - serverNow) / 1000) : null;
  const beepKey = countdownSec != null ? `c${r?.n}:${countdownSec}` : (phase === "aim" || phase === "waitingOpp") && secsLeft != null && secsLeft <= 5 && secsLeft > 0 ? `a${r?.n}:${secsLeft}` : null;
  const lastBeep = useRef<string | null>(null);
  useEffect(() => { if (beepKey && beepKey !== lastBeep.current) { lastBeep.current = beepKey; sfx("tick"); } }, [beepKey]);
  const goKey = phase === "aim" && r ? r.n : null;
  const lastGo = useRef<number | null>(null);
  useEffect(() => { if (goKey != null && goKey !== lastGo.current) { lastGo.current = goKey; sfx("go"); } }, [goKey]);
  // Cup match over: back to the bracket after a moment (the next round starts from there).
  const cupCode = phase === "done" ? v?.cup?.code : null;
  useEffect(() => { if (!cupCode) return; const t = setTimeout(() => router.push(`/cup/${cupCode}`), 5000); return () => clearTimeout(t); }, [cupCode, router]);
  const endKey = phase === "done" && v && me ? (v.winner === me.slot ? "win" : v.winner === "draw" ? "draw" : "lose") : null;
  const ended = useRef(false);
  useEffect(() => { if (endKey && !ended.current) { ended.current = true; setTimeout(() => sfx(endKey), 400); track("live_finished", { result: endKey, cup: !!cupCode }); } }, [endKey, cupCode]);

  return (
    <main className={`night-sky fixed inset-0 overflow-hidden ${fx?.kind === "hurt" ? "duel-shake" : ""}`}>
      <div className="stars" aria-hidden />
      <Globe onTap={onTap} onReady={onReady} />
      {fx && fx.kind !== "draw" && <div key={fx.key} aria-hidden className={`duel-flash pointer-events-none absolute inset-0 z-20 ${fx.kind === "hurt" ? "hurt" : "hit"}`} />}
      {fx && fx.dmg > 0 && (
        <div key={`d${fx.key}`} aria-hidden className={`dmg-pop display pointer-events-none absolute top-[22%] z-30 text-[88px] leading-none ${fx.kind === "hurt" ? "left-[12%] text-ball" : "right-[12%] text-ok"}`}>−{fx.dmg.toLocaleString("en-IN")}</div>
      )}
      <button type="button" onClick={() => { const on = muted; setSoundOn(on); setMuted(!on); if (on) sfx("lock"); }} aria-label={muted ? "Sound on" : "Mute"}
        className="tv-ui hud-box absolute bottom-[calc(env(safe-area-inset-bottom)+16px)] left-3 z-30 grid h-11 w-11 place-items-center">{muted ? <SpeakerSlash size={20} /> : <SpeakerHigh size={20} />}</button>

      {/* HP bars */}
      {v && v.status !== "open" && me && opp && v.hp && (
        <div className="tv-ui pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-3 pt-[calc(env(safe-area-inset-top)+10px)] sm:px-5">
          <HpCard p={me} hp={v.hp[me.slot]} hurt={last?.loser === me.slot && phase === "result" ? last.damage : 0} align="left" />
          {r && <div className="hud-box display flex flex-col items-center px-3 py-1.5 text-center">{v.cup && <span className="max-w-[140px] truncate text-[9px] tracking-[.12em] text-[#F5C000]">{v.cup.round} · {v.cup.name}</span>}<span className="hud-label">Round</span><span className="text-lg leading-none">{r.n + 1}</span>{r.mult > 1 && <span className="text-[10px] text-ok">×{r.mult} dmg</span>}</div>}
          <HpCard p={opp} hp={v.hp[opp.slot]} hurt={last?.loser === opp.slot && phase === "result" ? last.damage : 0} align="right" />
        </div>
      )}

      {/* Question */}
      {r?.text && (phase === "aim" || phase === "waitingOpp") && (
        <div className="tv-ui pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+84px)] mx-auto max-w-[720px] px-3">
          <div className="glass rise overflow-hidden rounded-3xl">
            <div className="flex items-center justify-between bg-gradient-to-r from-ball to-[#B0203A] px-4 py-1.5">
              <span className="display flex items-center gap-2 text-xs tracking-[.14em]"><Sword weight="fill" size={14} />Duel · Round {r.n + 1}</span>
              {secsLeft != null && <span className={`display flex items-center gap-1 text-sm ${secsLeft <= 5 ? "text-ok" : ""}`}><Timer weight="fill" size={14} />{secsLeft}s</span>}
            </div>
            <p className="px-4 pb-4 pt-3 text-[18px] font-semibold leading-snug">{r.text}</p>
          </div>
          {oppGuessedFirst && <div className="combo mx-auto mt-2 w-fit rounded-full bg-ball px-4 py-1.5 text-sm font-semibold">@{opp?.handle} has guessed! {secsLeft}s left</div>}
        </div>
      )}

      {/* Countdown before a round */}
      {phase === "countdown" && r && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="display text-sm tracking-[.3em] text-muted">Round {r.n + 1}{r.mult > 1 ? ` · ×${r.mult} damage` : ""}</div>
            <div key={Math.ceil((r.openMs - serverNow) / 1000)} className="round-splash display text-[140px] leading-none">{Math.max(1, Math.ceil((r.openMs - serverNow) / 1000))}</div>
          </div>
        </div>
      )}

      {/* Aim dock */}
      {phase === "aim" && (
        <div className="tv-ui pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:justify-end sm:px-5">
          <div className="pointer-events-auto w-full sm:w-[360px]">
            {pin
              ? <button className="btn-primary guess-in flex w-full items-center justify-center gap-3 py-5 text-[30px]" onClick={guess} disabled={sending}><span className="pm-ball !m-0 !h-7 !w-7" aria-hidden />Guess</button>
              : <div className="glass rounded-full px-5 py-4 text-center"><span className="display text-lg">Pitch your ball</span><span className="block text-sm text-muted">Tap the spot on the globe</span></div>}
          </div>
        </div>
      )}
      {phase === "waitingOpp" && (
        <div className="tv-ui pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+16px)]">
          <div className="glass rounded-full px-5 py-4 text-center"><span className="display text-lg">Ball locked in</span><span className="block text-sm text-muted">Waiting for @{opp?.handle}{secsLeft != null ? ` · ${secsLeft}s` : ""}</span></div>
        </div>
      )}

      {/* Round result */}
      {phase === "result" && r?.result && me && opp && (
        <div className="tv-ui pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-[calc(env(safe-area-inset-bottom)+14px)]">
          <div className="glass rise pointer-events-auto mx-auto flex max-w-[640px] flex-col gap-3 rounded-3xl p-4 text-center">
            <div className="display text-2xl">{!last?.loser || !last.damage ? "Level pegging" : last.loser === opp.slot ? `You hit @${opp.handle} for ${last.damage}` : `@${opp.handle} hit you for ${last.damage}`}</div>
            <div className="grid grid-cols-2 gap-2">
              {[me, opp].map((p) => {
                const g = r.result!.guesses.find((x) => x.slot === p.slot);
                return (
                  <div key={p.slot} className="hud-box flex items-center gap-2 px-3 py-2 text-left">
                    <Avatar code={p.avatar} size={30} />
                    <div className="min-w-0 leading-tight"><div className="truncate text-sm font-semibold">{p.me ? "You" : `@${p.handle}`}</div>
                      <div className="text-xs text-muted">{g ? <><b className="text-cream"><CountUp to={g.points} /></b> pts · {Math.round(g.km).toLocaleString("en-IN")} km</> : "No guess"}</div></div>
                  </div>
                );
              })}
            </div>
            <p className="text-sm"><b>{r.result.answer.name}</b> <span className="text-muted">· {r.result.answer.when}</span></p>
            <p className="text-xs text-muted">Next round in {Math.max(0, Math.ceil(((r.resolvedMs ?? 0) + LIVE.RESULT_MS - serverNow) / 1000))}s</p>
          </div>
        </div>
      )}

      {/* Waiting room */}
      {phase === "waiting" && (
        <div className="absolute inset-0 grid place-items-center px-4">
          <div className="glass rise flex w-full max-w-[420px] flex-col items-center gap-4 rounded-[28px] p-6 text-center">
            <Sword weight="fill" size={34} className="text-ok" />
            <h2 className="display text-3xl">{v?.players.length ? "Waiting for a rival" : "Loading…"}</h2>
            <p className="text-sm text-muted">Quick match pairs you with the next player who joins. Or send this duel to a friend:</p>
            <a className="display w-full rounded-xl bg-[#1FA855] p-3 text-lg text-white" target="_blank" rel="noopener"
              href={`https://wa.me/?text=${encodeURIComponent(`⚔️ 1v1 me on GeoCricket: cricket geography, live. ${inviteUrl}`)}`}>Invite on WhatsApp</a>
            <code className="w-full select-all break-all rounded-lg bg-deep/70 px-2 py-1.5 text-xs">{inviteUrl}</code>
            <span className="h-1.5 w-40 overflow-hidden rounded-full bg-white/10"><i className="block h-full w-1/3 animate-[ticker_1.2s_linear_infinite] rounded-full bg-ok" /></span>
            <Link href="/live" className="text-sm text-muted hover:underline">Cancel</Link>
          </div>
        </div>
      )}

      {/* Match over */}
      {phase === "done" && v && me && opp && (
        <div className="absolute inset-0 grid place-items-center bg-deep/70 px-4 backdrop-blur-sm">
          <div className="glass rise flex w-full max-w-[420px] flex-col items-center gap-4 rounded-[28px] p-6 text-center">
            {v.winner === me.slot ? <Crown weight="fill" size={44} className="text-ok" /> : <Sword weight="fill" size={40} className="text-muted" />}
            <h2 className="display text-5xl leading-none">{v.winner === "draw" ? "It's a tie!" : v.winner === me.slot ? "You win!" : "Stumped!"}</h2>
            <p className="text-muted">{(() => {
              // Knockout (someone hit 0 HP) or the full distance (more HP after every round)?
              const ko = Object.values(v.hp ?? {}).some((h) => h <= 0);
              if (v.winner === "draw") return "Level after every round. Honours even.";
              if (v.winner === me.slot) return ko ? `@${opp.handle} is out of health.` : `You finished ahead on health after ${LIVE.ROUNDS} rounds.`;
              return ko ? `@${opp.handle} knocked you out.` : `@${opp.handle} finished ahead on health after ${LIVE.ROUNDS} rounds.`;
            })()}</p>
            <div className="grid w-full grid-cols-2 gap-2">
              <HpCard p={me} hp={v.hp?.[me.slot] ?? 0} hurt={0} align="left" />
              <HpCard p={opp} hp={v.hp?.[opp.slot] ?? 0} hurt={0} align="right" />
            </div>
            {v.cup
              ? <Link href={`/cup/${v.cup.code}`} className="btn-primary w-full py-4 text-center text-2xl">{v.winner === me.slot ? "Next round →" : "Back to bracket"}</Link>
              : <button className="btn-primary w-full py-4 text-2xl" onClick={rematch}>Play again</button>}
            <Link href="/" className="text-sm text-muted hover:underline">Home</Link>
          </div>
        </div>
      )}

      {v?.error && (
        <div className="absolute inset-0 grid place-items-center px-4"><div className="glass rounded-3xl p-5 text-center"><p className="mb-4">{v.error}</p><Link href="/live" className="btn-primary px-6 py-3">New duel</Link></div></div>
      )}
    </main>
  );
}

function HpCard({ p, hp, hurt, align }: { p: P; hp: number; hurt: number; align: "left" | "right" }) {
  const pct = Math.max(0, Math.min(100, (hp / LIVE.HP) * 100));
  return (
    <div className={`hud-box pointer-events-auto flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 sm:max-w-[260px] ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <Avatar code={p.avatar} size={36} />
      <div className="min-w-0 flex-1">
        <div className={`flex items-center gap-1 text-sm font-semibold ${align === "right" ? "justify-end" : ""}`}><span className="truncate">{p.me ? "You" : `@${p.handle}`}</span><Flag code={p.country} size={10} /></div>
        <div className={`relative mt-1 h-3 overflow-hidden rounded-full bg-white/15 ${pct <= 20 ? "hp-low" : ""}`}>
          {/* ghost bar trails the real one, so the chunk you lost stays visible for a moment */}
          <i className={`absolute inset-y-0 block rounded-full bg-white/80 transition-[width] delay-500 duration-[1200ms] ease-out ${align === "right" ? "right-0" : "left-0"}`} style={{ width: `${pct}%` }} />
          <i className={`absolute inset-y-0 block rounded-full transition-[width] duration-300 ${align === "right" ? "right-0" : "left-0"} ${pct > 50 ? "bg-good" : pct > 20 ? "bg-ok" : "bg-ball"}`} style={{ width: `${pct}%` }} />
        </div>
        <div className={`mt-0.5 flex items-center gap-1 text-[11px] text-muted ${align === "right" ? "justify-end" : ""}`}>{hp.toLocaleString("en-IN")} HP{hurt > 0 && <span className="float-damage font-bold text-ball">−{hurt.toLocaleString("en-IN")}</span>}</div>
      </div>
    </div>
  );
}

/** Counts a number up from 0 over ~0.8 s. */
function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 800); setN(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{n.toLocaleString("en-IN")}</>;
}
