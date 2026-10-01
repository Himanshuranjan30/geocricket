"use client";

import { ArrowRight, Copy, Crown, Lock, Robot, Sword, WhatsappLogo } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { naturalBreak } from "@/lib/ads";
import { buzz, sfx, siteUrl } from "@/lib/client";
import { WL } from "@/lib/whoLive";
import { POINTS, type Clue } from "@/lib/whoRules";
import { track } from "./Analytics";
import { Avatar } from "./Avatar";
import { Flag } from "./Flag";
import type { GlobeApi } from "./Globe";
import { Mystery, PlayerFace } from "./PlayerFace";
import { ProfileSetup, type Account } from "./ProfileSetup";
import { ClueCard, NameSearch, type WhoP } from "./WhoParts";
import type { Profile } from "@/lib/profile";

const Globe = dynamic(() => import("./Globe"), { ssr: false });

type Face = { id: string; name: string; team: string; photo: boolean };
type P = { slot: string; me: boolean; handle: string; avatar: string; country: string | null; bot: boolean };
type View = {
  id: string; status: "open" | "playing" | "done"; now: number; rounds: number; win: number; bot: boolean; quick: boolean; players: P[]; createdMs?: number;
  wins?: Record<string, number>; pts?: Record<string, number>; winner?: string | null;
  log?: { round: number; winner: string | null; clue: number | null; answer: Face }[];
  round?: {
    n: number; openMs: number; endMs: number; clueTimes: number[]; clue: number; clues: Clue[];
    buzzes: { slot: string; clue: number; name: string; correct: boolean }[];
    result: { winner: string | null; clue: number | null; ms: number | null; answer: Face & { story: string } } | null; nextMs: number | null;
  };
  error?: string;
};
type Me = { profile: Profile | null; user: Account; googleEnabled: boolean; suggestedCountry: string | null };

/** A live Name Race. Polls the server (and again the moment each clue lands); the server decides everything. */
export function WhoDuel({ id }: { id: string }) {
  const router = useRouter();
  const [v, setV] = useState<View | null>(null);
  const [players, setPlayers] = useState<WhoP[]>([]);
  const [skew, setSkew] = useState(0); // server time − local time
  const [clock, setClock] = useState(0); // local time, ticked by an interval (never read Date.now() during render)
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [setup, setSetup] = useState<Me | null>(null); // arrived from a link without a player profile
  const [copied, setCopied] = useState(false);
  const api = useRef<GlobeApi | null>(null);
  const [globeReady, setGlobeReady] = useState(false);
  const shown = useRef("");
  const joined = useRef(false);
  const botAsked = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  const poll = useCallback(async () => {
    const r = await fetch(`/api/who-duel/${id}`, { cache: "no-store" }).catch(() => null);
    if (!r) return;
    const d: View = await r.json();
    if (d.now) setSkew(d.now - Date.now());
    setV(d);
  }, [id]);
  useEffect(() => {
    const first = setTimeout(poll, 0);
    const t = setInterval(poll, 800);
    const c = setInterval(() => setClock(Date.now()), 200);
    fetch("/api/who/players").then((r) => r.json()).then(setPlayers, () => {});
    return () => { clearTimeout(first); clearInterval(t); clearInterval(c); };
  }, [poll]);

  const serverNow = clock + skew;
  const r = v?.round;
  const me = v?.players.find((p) => p.me), opp = v?.players.find((p) => !p.me);
  const phase = !v ? "loading" : v.error ? "error" : v.status === "open" ? "waiting" : v.status === "done" && (!r?.nextMs || serverNow >= r.nextMs - WL.RESULT_MS + 4000) ? "done"
    : !r ? "loading" : r.result ? "result" : serverNow < r.openMs ? "countdown" : "live";

  // Poll right when the next clue lands, so it shows on time rather than up to a poll late.
  const nextClueMs = r && !r.result ? r.clueTimes.find((t) => t > serverNow) ?? r.endMs : null;
  useEffect(() => {
    if (nextClueMs == null) return;
    const t = setTimeout(poll, Math.max(0, nextClueMs - (Date.now() + skew)) + 60);
    return () => clearTimeout(t);
  }, [nextClueMs, skew, poll]);

  // Arriving from a friend's link: take the empty seat (or set up a profile first).
  useEffect(() => {
    if (!v || joined.current || v.status !== "open" || v.players.some((p) => p.me)) return;
    joined.current = true;
    fetch(`/api/who-duel/${id}/join`, { method: "POST" }).then(async (res) => {
      if (res.status === 403) setSetup(await fetch("/api/me", { cache: "no-store" }).then((x) => x.json()));
      else { track("who_duel_joined"); poll(); }
    });
  }, [v, id, poll]);

  // Quick match with nobody around: a bot steps in after a short wait.
  const waitedMs = v?.createdMs ? serverNow - v.createdMs : 0;
  const playBot = useCallback(async () => {
    if (botAsked.current) return;
    botAsked.current = true;
    await fetch(`/api/who-duel/${id}/bot`, { method: "POST" });
    track("who_duel_bot"); poll();
  }, [id, poll]);
  const creator = !!me && v?.status === "open";
  useEffect(() => { if (creator && v?.quick && waitedMs > WL.BOT_AFTER_MS) void playBot(); }, [creator, v?.quick, waitedMs, playBot]);

  // Globe: the ground on clue 1, the career trail on clue 4, back to the ground for the reveal.
  const onReady = useCallback((g: GlobeApi) => { api.current = g; g.labels(true); setGlobeReady(true); }, []);
  useEffect(() => {
    const g = api.current;
    if (!g || !globeReady || !r || !r.clues.length) return;
    const trailOn = !r.result && r.clues.length >= 4 && !!r.clues[3].pins?.length;
    const key = `${r.n}:${r.result ? "res" : trailOn ? "trail" : "pin"}`;
    if (shown.current === key) return;
    const fresh = !shown.current.startsWith(`${r.n}:`);
    shown.current = key;
    const pad = { top: 120, bottom: Math.round(window.innerHeight * 0.5), left: 40, right: 40 };
    if (trailOn) g.trail(r.clues[3].pins!, pad);
    else if (fresh) g.reset().then(() => g.showAnswer(r.clues[0].pins![0]));
    else g.showAnswer(r.clues[0].pins![0]);
  }, [r, globeReady]);

  // Sounds: "go" when a round opens, a tick per clue, then the round's verdict and the match's.
  const fx = useRef("");
  useEffect(() => {
    if (!r) return;
    const key = r.result ? `${r.n}:res` : `${r.n}:${r.clue}`;
    if (fx.current === key || r.clue < 0) return;
    fx.current = key;
    if (r.result) {
      const w = r.result.winner;
      if (w === me?.slot) { sfx("hit"); buzz([20, 30, 40]); } else if (w) { sfx("hurt"); buzz([80, 40, 120]); } else sfx("draw");
    } else sfx(r.clue === 0 ? "go" : "tick");
  }, [r, me?.slot]);
  const ended = useRef(false);
  useEffect(() => {
    if (phase !== "done" || ended.current || !v) return;
    ended.current = true;
    sfx(v.winner === me?.slot ? "win" : v.winner === "draw" ? "draw" : "lose");
    track("who_duel_end", { result: v.winner === me?.slot ? "win" : v.winner === "draw" ? "draw" : "loss", bot: v.bot });
  }, [phase, v, me?.slot]);

  const myBuzzes = useMemo(() => r?.buzzes.filter((b) => b.slot === me?.slot) ?? [], [r, me?.slot]);
  const locked = !!r && myBuzzes.some((b) => b.clue === r.clue && !b.correct);
  const tried = useMemo(() => new Set(myBuzzes.map((b) => b.name)), [myBuzzes]);

  async function send(pick: string) {
    if (!r || busy) return;
    setBusy(true); setNotice(null);
    try {
      const res = await fetch(`/api/who-duel/${id}/buzz`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ round: r.n, pick }) });
      const d = await res.json();
      if (!res.ok) setNotice(d.error ?? "That didn't go through.");
      else if (!d.correct) { buzz(30); setNotice(`Not ${players.find((p) => p.id === pick)?.name ?? "him"}. Locked until the next clue.`); track("who_duel_miss", { clue: d.clue + 1 }); }
      else track("who_duel_named", { clue: d.clue + 1 });
    } catch { setNotice("Connection hiccup. Try again."); }
    finally { setBusy(false); poll(); }
  }
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 2600); return () => clearTimeout(t); }, [notice]);
  useEffect(() => { if (phase === "live" && !locked) input.current?.focus(); }, [phase, locked, r?.n]);

  async function again(mode: "quick" | "bot") {
    await naturalBreak("who_duel_rematch"); // between matches only, never mid-race
    const res = await fetch("/api/who-duel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode }) });
    const d = await res.json();
    if (res.ok) { track("who_duel_rematch", { mode }); router.push(`/mystery/duel/${d.id}`); }
  }

  const invite = `${siteUrl()}/mystery/duel/${id}`;
  const inviteText = `🏏 Name Race on GeoCricket: clues land on the globe, first to name the cricketer wins. Race me live: ${invite}`;
  const name = (p?: P) => (!p ? "Rival" : p.me ? "You" : p.bot ? p.handle : `@${p.handle}`);
  const secs = (ms: number) => Math.max(0, Math.ceil(ms / 1000));
  const clueLeft = nextClueMs != null ? nextClueMs - serverNow : 0;
  const clueSpan = r && r.clue >= 0 ? (r.clueTimes[r.clue + 1] ?? r.endMs) - r.clueTimes[r.clue] : 1;

  return (
    <main className="night-sky fixed inset-0 overflow-hidden">
      <div className="stars" aria-hidden />
      <Globe onTap={() => {}} onReady={onReady} />

      {/* Scoreboard: you v rival, rounds won as pips */}
      {v && v.players.length > 0 && (
        <div className="tv-ui pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-3 pt-[calc(env(safe-area-inset-top)+10px)] sm:px-5">
          {[me, opp].map((p, i) => p ? (
            <div key={p.slot} className={`hud-box flex min-w-0 items-center gap-2 px-2.5 py-1.5 ${i ? "flex-row-reverse text-right" : ""}`}>
              {p.bot ? <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10"><Robot weight="fill" size={20} /></span> : <Avatar code={p.avatar} size={36} />}
              <div className="min-w-0">
                <div className={`flex items-center gap-1 text-sm font-semibold ${i ? "justify-end" : ""}`}><span className="truncate">{name(p)}</span>{!p.bot && <Flag code={p.country} size={10} />}</div>
                <div className={`flex items-center gap-1 ${i ? "justify-end" : ""}`} aria-label={`${v.wins?.[p.slot] ?? 0} rounds won`}>
                  {Array.from({ length: v.win }, (_, k) => <span key={k} className={`h-2.5 w-2.5 rounded-full ${k < (v.wins?.[p.slot] ?? 0) ? "bg-[#F5C000]" : "bg-white/20"}`} />)}
                  <span className="ml-1 text-xs tabular-nums text-muted">{v.pts?.[p.slot] ?? 0}</span>
                </div>
              </div>
            </div>
          ) : <div key={i} className="hud-box px-3 py-2 text-sm text-muted">Waiting…</div>)}
        </div>
      )}

      {phase === "error" && <Center><p className="mb-3">{v?.error}</p><Link href="/mystery/duel" className="btn-primary inline-block px-5 py-3 !no-underline">New match</Link></Center>}

      {phase === "waiting" && (
        <Center>
          {!me ? <p className="display text-2xl">Joining the race…</p> : v?.quick ? (
            <>
              <Sword weight="fill" size={36} className="mx-auto mb-2 animate-pulse text-[#F5C000]" />
              <p className="display text-2xl">Finding a rival…</p>
              <p className="mt-1 text-sm text-muted">Nobody in {secs(WL.BOT_AFTER_MS - waitedMs)}s? You&apos;ll race the bot.</p>
              <button onClick={playBot} className="btn-ghost mt-4 px-5 py-3 font-semibold">Race the bot now</button>
            </>
          ) : (
            <>
              <p className="display text-2xl">Send this to a friend</p>
              <p className="mt-1 text-sm text-muted">The race starts the moment they open it.</p>
              <div className="mt-4 flex flex-col gap-2">
                <a href={`https://wa.me/?text=${encodeURIComponent(inviteText)}`} target="_blank" rel="noopener" onClick={() => track("who_duel_invite", { via: "whatsapp" })}
                  className="btn-primary flex items-center justify-center gap-2 py-3 text-lg !no-underline"><WhatsappLogo weight="fill" size={22} />Invite on WhatsApp</a>
                <button onClick={() => { navigator.clipboard?.writeText(invite).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); }, () => {}); track("who_duel_invite", { via: "copy" }); }}
                  className="btn-ghost flex items-center justify-center gap-2 py-3 font-semibold"><Copy weight="bold" />{copied ? "Link copied" : "Copy link"}</button>
                <button onClick={playBot} className="text-sm text-muted underline">Race the bot instead</button>
              </div>
            </>
          )}
        </Center>
      )}

      {phase === "countdown" && r && (
        <Center>
          <p className="display text-sm tracking-[.16em] text-muted">Player {r.n + 1} of {v!.rounds}</p>
          <Mystery size={88} className="mx-auto my-3" />
          <p className="display text-6xl tabular-nums">{secs(r.openMs - serverNow) || "Go"}</p>
          {r.n === 0 && <p className="mt-2 text-sm text-muted">First to name him wins the round. A wrong name locks you out until the next clue. First to {v!.win}.</p>}
        </Center>
      )}

      {(phase === "live" || phase === "result") && r && (
        <section aria-label={`Player ${r.n + 1}`} className="tv-ui absolute inset-x-0 bottom-0 mx-auto flex max-h-[64svh] max-w-[620px] flex-col px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <div className="glass flex min-h-0 flex-col overflow-hidden rounded-3xl">
            <div className="relative flex items-center gap-3 bg-gradient-to-r from-ball to-[#B0203A] px-4 py-2">
              {r.result ? <PlayerFace key="face" {...r.result.answer} size={40} className="face-pop" /> : <Mystery size={40} />}
              <span className="min-w-0 flex-1 leading-tight">
                <span className="display block text-[15px]">{r.result ? r.result.answer.name : "Name him first"}</span>
                <span className="block text-[11px] tracking-[.12em] text-white/80">PLAYER {r.n + 1} OF {v!.rounds}{!r.result ? ` · CLUE ${r.clue + 1} OF 5` : ""}</span>
              </span>
              {!r.result && <span className="display rounded-full bg-white px-2.5 py-0.5 text-[11px] text-deep">Worth {POINTS[r.clue] ?? 0}</span>}
              {!r.result && r.clue < 4 && <span className="absolute inset-x-0 bottom-0 h-1 bg-[#F5C000] transition-[width] duration-200 ease-linear" style={{ width: `${Math.max(0, Math.min(100, (clueLeft / clueSpan) * 100))}%` }} aria-hidden />}
            </div>
            <ol className="flex min-h-0 flex-col gap-2 overflow-y-auto px-3 pb-2 pt-3" aria-live="polite">
              {r.clues.map((c, i) => <ClueCard key={i} clue={c} n={i} fresh={i === r.clues.length - 1 && !r.result} />)}
            </ol>

            {phase === "live" ? (
              <div className="flex flex-col gap-2 border-t border-white/10 p-3">
                {r.buzzes.some((b) => !b.correct) && (
                  <p className="flex flex-wrap gap-1.5 text-xs">
                    {r.buzzes.filter((b) => !b.correct).map((b, i) => <span key={i} className={`rounded-full px-2 py-0.5 line-through decoration-ball ${b.slot === me?.slot ? "bg-white/5 text-muted" : "bg-ball/25"}`}>{b.slot === me?.slot ? "" : `${name(opp)}: `}{b.name}</span>)}
                  </p>
                )}
                {notice && <p role="alert" className="rounded-full bg-ball/90 px-3 py-1.5 text-center text-sm font-semibold">{notice}</p>}
                <NameSearch players={players} exclude={tried} onPick={send} busy={busy} locked={locked} inputRef={input}
                  placeholder={locked ? `Locked · next clue in ${secs(clueLeft)}s` : "Name him first"}>
                  {locked && <span className="grid w-12 shrink-0 place-items-center rounded-2xl bg-white/5 text-muted" aria-hidden><Lock weight="fill" /></span>}
                </NameSearch>
              </div>
            ) : r.result && (
              <div className="flex flex-col gap-2 border-t border-white/10 p-4">
                <p className={`display text-center text-xl ${r.result.winner === me?.slot ? "text-ok" : r.result.winner ? "text-[#FF8F9C]" : ""}`}>
                  {r.result.winner === me?.slot ? `You got him on clue ${r.result.clue! + 1} · +${POINTS[r.result.clue!]}`
                    : r.result.winner ? `${name(opp)} got him first · clue ${r.result.clue! + 1}`
                    : "Nobody got him"}
                  {r.result.ms != null && r.result.winner && <span className="block text-sm font-normal text-muted">{(r.result.ms / 1000).toFixed(1)}s after the clue landed</span>}
                </p>
                <p className="text-[15px] leading-snug">{r.result.answer.story}</p>
                {r.nextMs && v!.status !== "done" && <p className="text-center text-sm text-muted">Next player in {secs(r.nextMs - serverNow)}s</p>}
              </div>
            )}
          </div>
        </section>
      )}

      {phase === "done" && v && (
        <section aria-label="Match result" className="tv-ui absolute inset-x-0 bottom-0 mx-auto max-w-[520px] px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <div className="glass flex flex-col gap-3 rounded-3xl p-5 text-center">
            <p className="display text-sm tracking-[.16em] text-muted">Name Race</p>
            <p className="display flex items-center justify-center gap-2 text-4xl leading-none">
              {v.winner === me?.slot ? <><Crown weight="fill" className="text-[#F5C000]" />You win</> : v.winner === "draw" ? "Draw" : `${name(opp)} wins`}
            </p>
            <p className="display text-2xl tabular-nums">{v.wins?.[me?.slot ?? ""] ?? 0} – {v.wins?.[opp?.slot ?? ""] ?? 0}</p>
            <div className="flex justify-center gap-3">
              {v.log?.map((l) => (
                <div key={l.round} className="flex flex-col items-center gap-1">
                  <PlayerFace {...l.answer} size={48} className={l.winner ? "" : "opacity-50 grayscale"} />
                  <span className={`text-[11px] font-semibold ${l.winner === me?.slot ? "text-ok" : l.winner ? "text-[#FF8F9C]" : "text-muted"}`}>{l.winner === me?.slot ? "You" : l.winner ? (opp?.bot ? "Bot" : "Them") : "—"}</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted">+{v.winner === me?.slot ? 25 : v.winner === "draw" ? 15 : 10} XP{!v.bot && v.winner !== "draw" ? " · rating updated if you're both signed in" : ""}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={() => again(v.bot ? "bot" : "quick")} className="btn-primary flex items-center gap-2 px-5 py-3 text-lg">Race again <ArrowRight weight="bold" /></button>
              <a href={`https://wa.me/?text=${encodeURIComponent(`I ${v.winner === me?.slot ? "won" : "lost"} a Name Race ${v.wins?.[me?.slot ?? ""] ?? 0}–${v.wins?.[opp?.slot ?? ""] ?? 0} on GeoCricket. Think you know your cricketers? ${siteUrl()}/mystery/duel`)}`}
                target="_blank" rel="noopener" onClick={() => track("who_duel_shared")} className="btn-ghost flex items-center gap-2 px-4 py-3 font-semibold !text-cream !no-underline"><WhatsappLogo weight="fill" size={20} />Challenge a friend</a>
            </div>
            <p className="text-xs text-muted"><Link href="/mystery" className="underline">Today&apos;s Mystery Cricketer</Link> · <Link href="/" className="underline">Home</Link></p>
          </div>
        </section>
      )}

      {setup && (
        <ProfileSetup initial={null} suggestedCountry={setup.suggestedCountry} user={setup.user} googleEnabled={setup.googleEnabled} onCancel={() => router.push("/mystery/duel")}
          onDone={() => { setSetup(null); joined.current = false; poll(); }} />
      )}
    </main>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="tv-ui absolute inset-x-0 bottom-[12svh] mx-auto max-w-sm px-4 text-center">
      <div className="glass rounded-3xl p-5">{children}</div>
    </div>
  );
}
