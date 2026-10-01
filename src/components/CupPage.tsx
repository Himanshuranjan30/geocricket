"use client";

import { Copy, Crown, Lightning, ShareNetwork, Sword, Trophy, UsersThree } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ensurePlayer, sfx, siteUrl } from "@/lib/client";
import type { CupView } from "@/lib/cups";
import { timeAt } from "@/lib/resetTime";
import { AccountMenu } from "./AccountMenu";
import { track } from "./Analytics";
import { Logo } from "./Logo";
import { Avatar } from "./Avatar";
import { Flag } from "./Flag";

type E = CupView["entrants"][number];
const placeLabel = (p: number) => (p === 1 ? "Champion" : p === 2 ? "Runner-up" : `Joint ${p}${p === 3 ? "rd" : "th"}`);

/** A cup: lobby → live bracket → champion. Polls the server (which advances the cup); the server decides everything. */
export function CupPage({ code }: { code: string }) {
  const router = useRouter();
  const [v, setV] = useState<CupView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [skew, setSkew] = useState(0);
  const sentTo = useRef<string | null>(null);

  const poll = useCallback(async () => {
    const r = await fetch(`/api/cups/${code}`, { cache: "no-store" }).catch(() => null);
    if (!r) return;
    const d = await r.json();
    if (!r.ok) { setErr(d.error ?? "Couldn't load the cup."); return; }
    setSkew(d.now - Date.now());
    setV(d);
  }, [code]);
  useEffect(() => {
    const first = setTimeout(poll, 0);
    const p = setInterval(() => { if (!document.hidden) poll(); }, 2000), c = setInterval(() => setNow(Date.now()), 500);
    return () => { clearTimeout(first); clearInterval(p); clearInterval(c); };
  }, [poll]);

  // Your match is ready: go play it (once per match).
  const match = v?.me?.match ?? null;
  useEffect(() => {
    if (!match || sentTo.current === match) return;
    sentTo.current = match; sfx("go");
    router.push(`/live/${match}`);
  }, [match, router]);

  async function act(action: string, extra: object = {}) {
    setBusy(true); setErr(null);
    if (action === "join" && !(await ensurePlayer())) { setBusy(false); setErr("Couldn't set up your player. Try again."); return; }
    const r = await fetch(`/api/cups/${code}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) setErr(d.error ?? "Something went wrong.");
    else track(`cup_${action}`, { code });
    poll();
  }

  if (err && !v) return <Shell><p className="glass rounded-3xl p-6 text-center">{err} <Link href="/cups" className="underline">All cups</Link></p></Shell>;
  if (!v) return <Shell><p className="text-center text-muted">Loading cup…</p></Shell>;

  const serverNow = now + skew;
  const byAlias = new Map(v.entrants.map((e) => [e.alias, e]));
  const url = `${siteUrl()}/cup/${v.code}`;
  const invite = `🏆 Join my GeoCricket cup "${v.name}" · ${v.capacity} players, knockout, live. Starts ${timeAt(v.startsMs, null)}. ${url}`;
  const here = v.entrants.filter((e) => e.here).length;
  const online = v.entrants.filter((e) => e.online).length; // in the lobby right now (what "Start now" needs, same as the server)
  const me = v.me;
  const inCup = !!me?.seated;

  return (
    <Shell>
        <header className="flex items-center justify-between gap-3"><Logo /><div className="flex items-center gap-2"><Link href="/" className="btn-ghost hidden px-4 py-2 text-sm sm:block">← Home</Link><AccountMenu /></div></header>
      <header className="flex flex-col gap-2 text-center">
        <span className="display mx-auto flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] tracking-[.14em]">
          <Trophy weight="fill" size={14} className="text-[#F5C000]" />{v.official ? "Official cup" : v.visibility === "public" ? "Public cup" : "Private cup"} · {v.capacity} players · knockout
        </span>
        <h1 className="display text-4xl leading-none sm:text-5xl">{v.name}</h1>
        {v.host && <p className="text-sm text-muted">Hosted by @{v.host.handle}</p>}
      </header>

      {err && <p role="alert" className="rounded-xl bg-ball/20 px-4 py-2 text-center text-sm">{err}</p>}

      {(v.phase === "lobby" || v.phase === "checkin") && (
        <section className="glass flex flex-col gap-4 rounded-3xl p-5">
          <div className="text-center">
            <div className="hud-label">{v.phase === "checkin" ? "Check-in open · starts in" : "Starts in"}</div>
            <div className="display text-5xl tabular-nums">{countdown(v.startsMs - serverNow)}</div>
            <div className="text-sm text-muted">{timeAt(v.startsMs, null)}{v.delayed ? " · pushed back once, waiting for players" : ""}</div>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8" aria-label="Seats">
            {Array.from({ length: v.capacity }, (_, i) => {
              const e = v.entrants.filter((x) => !x.reserve)[i];
              return (
                <div key={i} className={`flex flex-col items-center gap-1 rounded-xl p-2 ${e ? "bg-white/10" : "border border-dashed border-white/15"}`}>
                  {e ? <span className="relative"><Avatar code={e.avatar} size={40} />{v.phase === "checkin" && <i className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full ring-2 ring-deep ${e.here ? "bg-ok" : "bg-white/30"}`} />}</span>
                    : <span className="grid h-10 w-10 place-items-center rounded-full bg-white/5 text-xs text-muted">{i + 1}</span>}
                  <span className="w-full truncate text-center text-[10px]">{e ? `@${e.handle}` : "Open"}</span>
                </div>
              );
            })}
          </div>
          <p className="text-center text-xs text-muted">
            {v.entrants.length}/{v.capacity} joined{v.waitlist ? ` · ${v.waitlist} on the waitlist` : ""}{v.phase === "checkin" ? ` · ${here} checked in` : ""}. Be on this page at the start: that&apos;s your check-in.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {!inCup && !me?.waitlist && <button className="btn-primary flex-1 py-4 text-2xl" disabled={busy} onClick={() => act("join")}>{v.entrants.length >= v.capacity ? "Join the waitlist" : "Join the cup"}</button>}
            {me?.waitlist && <div className="flex-1 rounded-2xl bg-white/10 p-3 text-center text-sm">You&apos;re <b>#{me.waitlist}</b> on the waitlist. Stay here: no-shows are replaced at the start.</div>}
            {me?.host && <button className="btn-primary flex-1 py-4 text-xl" disabled={busy || online < 4} onClick={() => act("start")} title={online < 4 ? "Needs 4 players in the lobby" : ""}>Start now{online < 4 ? ` (${online}/4 here)` : ""}</button>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <a className="share-btn whatsapp" target="_blank" rel="noopener" href={`https://wa.me/?text=${encodeURIComponent(invite)}`}><ShareNetwork weight="bold" size={18} />Invite</a>
            <button className="share-btn" onClick={() => { navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {}); }}><Copy weight="bold" size={18} />{copied ? "Copied!" : "Copy link"}</button>
          </div>
          {(inCup || me?.waitlist) && <button className="text-xs text-muted underline" disabled={busy} onClick={() => act("leave")}>Leave this cup</button>}
        </section>
      )}

      {v.phase === "running" && (
        <section className="glass flex flex-col items-center gap-2 rounded-3xl p-4 text-center">
          {me?.alive && match ? (
            <Link href={`/live/${match}`} className="btn-primary flex items-center gap-2 px-6 py-4 text-2xl"><Sword weight="fill" />Play your {me.roundName}</Link>
          ) : me?.alive ? (
            <p className="display text-xl">{(v.roundStartsMs ?? 0) > serverNow ? `${v.bracket[v.round]?.name} starts in ${countdown((v.roundStartsMs ?? 0) - serverNow)}` : "Waiting for the other matches…"}</p>
          ) : me?.place ? (
            <p className="text-lg">Knocked out · <b>{placeLabel(me.place)}</b>. Watch how it ends below.</p>
          ) : <p className="text-muted">{v.bracket[v.round]?.name} in progress.</p>}
        </section>
      )}

      {v.phase === "done" && v.winner && (
        <Champion v={v} winner={byAlias.get(v.winner)} runnerUp={v.runnerUp ? byAlias.get(v.runnerUp) : undefined} />
      )}
      {v.phase === "cancelled" && (
        <section className="glass flex flex-col items-center gap-3 rounded-3xl p-6 text-center">
          <p className="display text-2xl">Cup cancelled</p>
          <p className="text-muted">{v.cancelReason}</p>
          <Link href="/cups" className="btn-primary px-6 py-3 text-lg">Host a new cup</Link>
        </section>
      )}

      {v.bracket.length > 0 && <Bracket v={v} byAlias={byAlias} />}

      <p className="text-center text-xs text-muted">Every match is a live 1v1: same ball, same moment. A no-show loses after 45 s. Level after all rounds? Fewer total km wins.</p>
      <div className="flex justify-center gap-4 text-sm"><Link href="/cups">All cups</Link><Link href="/cups#leaderboard">Cup leaderboard</Link><Link href="/">Home</Link></div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="night-sky min-h-dvh overflow-x-hidden"><div className="stars" aria-hidden /><div className="tv-ui relative z-10 mx-auto flex max-w-[1100px] flex-col gap-5 px-4 py-8">{children}</div></main>;
}

function countdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${m}:${String(ss).padStart(2, "0")}`;
}

function Bracket({ v, byAlias }: { v: CupView; byAlias: Map<string, E> }) {
  const mine = v.me?.alias;
  return (
    <section aria-label="Bracket" className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="flex min-w-max gap-4">
        {v.bracket.map((round, r) => (
          <div key={r} className="flex w-[200px] flex-col">
            <div className="display mb-2 text-center text-xs tracking-[.14em] text-muted">{round.name}{r === v.round && v.phase === "running" ? " · live" : ""}</div>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {round.fixtures.map((f) => (
                <div key={f.slot} className={`hud-box flex flex-col gap-0.5 p-1.5 ${[f.a, f.b].includes(mine ?? "") ? "ring-2 ring-[#F5C000]" : ""} ${r === v.round && !f.winner && v.phase === "running" ? "shadow-[0_0_20px_rgba(64,220,130,.35)]" : ""}`}>
                  {[f.a, f.b].map((p, i) => {
                    const e = p ? byAlias.get(p) : undefined, won = !!p && f.winner === p, lost = !!f.winner && !!p && !won;
                    return (
                      <div key={i} className={`flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs ${won ? "bg-ok/20 font-bold" : lost ? "opacity-45" : ""}`}>
                        {e ? <Avatar code={e.avatar} size={20} /> : <span className="h-5 w-5 rounded-full bg-white/10" />}
                        <span className="min-w-0 flex-1 truncate">{e ? `@${e.handle}` : p ? "…" : "bye"}</span>
                        {e && <Flag code={e.country} size={9} />}
                        {won && f.how === "walkover" && <span className="text-[9px] text-muted">w/o</span>}
                        {won && <Crown weight="fill" size={11} className="text-ok" />}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Champion({ v, winner, runnerUp }: { v: CupView; winner?: E; runnerUp?: E }) {
  const played = useRef(false);
  useEffect(() => { if (!played.current) { played.current = true; setTimeout(() => sfx(v.me?.place === 1 ? "win" : "draw"), 300); } }, [v.me?.place]);
  const text = `🏆 @${winner?.handle} won "${v.name}" on GeoCricket (${Object.keys(v.places).length} players, knockout). ${v.me?.place ? `I finished ${placeLabel(v.me.place).toLowerCase()}. ` : ""}Host your own: ${siteUrl()}/cups`;
  return (
    <section className="glass rise relative flex flex-col items-center gap-3 overflow-hidden rounded-[28px] p-6 text-center">
      <div className="pointer-events-none absolute inset-0" aria-hidden>{Array.from({ length: 24 }, (_, i) => <i key={i} className="confetti-piece" style={{ "--x": `${(i * 37) % 60 - 30}vw`, "--r": `${i * 47}deg`, left: `${(i * 13) % 100}%`, background: ["#F5C000", "#40DC82", "#E8344E", "#5B8CFF"][i % 4], animationDelay: `${(i % 6) * 0.12}s` } as React.CSSProperties} />)}</div>
      <Trophy weight="fill" size={64} className="text-[#F5C000] drop-shadow-[0_0_24px_rgba(245,192,0,.6)]" />
      <div className="hud-label">Champion</div>
      {winner && (
        <div className="flex max-w-full flex-col items-center gap-2 sm:flex-row sm:gap-3">
          <Avatar code={winner.avatar} size={64} className="shrink-0 ring-4 ring-[#F5C000]" />
          <span className="flex min-w-0 max-w-full items-center gap-2"><span className="display truncate text-2xl sm:text-3xl">@{winner.handle}</span><Flag code={winner.country} size={16} /></span>
        </div>
      )}
      {runnerUp && <p className="text-sm text-muted">Runner-up: @{runnerUp.handle}</p>}
      {v.me?.place && <p className="display text-xl">{v.me.place === 1 ? "That's you! 🏆" : `You: ${placeLabel(v.me.place)}`}</p>}
      <div className="grid w-full max-w-[420px] grid-cols-2 gap-2">
        <a className="share-btn whatsapp" target="_blank" rel="noopener" href={`https://wa.me/?text=${encodeURIComponent(text)}`}><ShareNetwork weight="bold" size={18} />Share</a>
        <Link href="/cups#host" className="share-btn whitespace-nowrap !no-underline"><UsersThree weight="bold" size={18} />Host a cup</Link>
      </div>
      <Link href="/live" className="flex items-center gap-1 text-sm text-muted"><Lightning size={14} />Quick 1v1 while you wait</Link>
    </section>
  );
}
