"use client";

import { plural } from "@/lib/game";
import { ArrowRight, Check, CopySimple, Fire, Ghost, House, ImageSquare, Lightning, Sword, Target } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { tierOf } from "@/lib/game";
import { ensurePlayer, fmtDate, shareImage, shareText, siteUrl, totalOf, type Result } from "@/lib/client";
import { levelOf, titleFor } from "@/lib/level";
import { countryName, type Profile } from "@/lib/profile";
import { AdSlot } from "./AdSlot";
import { track } from "./Analytics";
import { testBallXp } from "@/lib/level";
import { nextSlotLabel } from "@/lib/resetTime";
import { SignInNudge } from "./SignInNudge";
import { StreakOptIn } from "./StreakOptIn";
import { Avatar } from "./Avatar";
import { Board, useCountUp } from "./Board";
import { Flag } from "./Flag";
import type { Mode } from "./Game";
import { LeaderboardPanel } from "./LeaderboardPanel";

type Me = { guest?: boolean; rank: number; total: number; percentile: number; country: string | null; countryRank: number | null } | null;
type DuelPlayer = { me: boolean; creator: boolean; handle: string; avatar: string; country: string | null; total: number; done: boolean };

export function Results({ profile, mode, number, date, title, duelId, questionIds, results, onPractice }: {
  profile: Profile | null; mode: Mode; number: number; date?: string; title: string | null; duelId?: string; questionIds: string[];
  results: Result[]; onPractice: () => void;
}) {
  const total = totalOf(results);
  const max = results.reduce((s, r) => s + 100 * r.mult, 0) || 1000;
  const shown = useCountUp(total, 900);
  const daily = mode === "daily";
  const ranked = daily || mode === "edition"; // has a leaderboard for this round
  const [streak, setStreak] = useState(0); // from the server once this game's score is in (lib/streak.ts)
  const [board, setBoard] = useState<{ count: number; avg: number; me: Me } | null>(null);
  const [duel, setDuel] = useState<DuelPlayer[] | null>(null);
  const [xp, setXp] = useState<ReturnType<typeof levelOf> | null>(null);
  const [copied, setCopied] = useState<boolean | null>(false); // null = copying was blocked
  const [img, setImg] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<{ url: string; busy: boolean } | null>(null);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const dateLabel = mode === "edition" || (mode === "archive" && !number) ? (title ?? "Edition") : date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? fmtDate(date) : mode === "duel" ? "Duel" : "Nets";
  const [would, setWould] = useState<{ count: number; rank: number; percentile: number; avg: number } | null>(null); // archive: vs the live field

  useEffect(() => {
    if (ranked && date) fetch(`/api/leaderboard?date=${date}`, { cache: "no-store" }).then((r) => r.json()).then(setBoard, () => {});
    if (mode === "archive" && date) fetch(`/api/archive/rank?key=${date}&total=${total}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then(setWould, () => {});
    if (mode === "duel" && duelId) fetch(`/api/duels/${duelId}`, { cache: "no-store" }).then((r) => r.json()).then((d) => setDuel(d.players), () => {});
    fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then((m) => { setXp(m.level ?? null); if (ranked) setStreak(m.streak ?? 0); }, () => {});
  }, [ranked, date, mode, duelId, total]);

  const text = shareText(number, dateLabel, results, streak);
  // XP this round: Test Matches pay ×2 for good balls and cost XP for poor ones (testBallXp); everything else earns its points.
  const isTest = /^test-/.test(date ?? "");
  const xpGain = isTest ? results.reduce((t, r) => t + testBallXp(r.points, r.mult), 0) : total;

  async function copy() {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {
      // Clipboard API blocked (some browsers / in-app webviews): classic copy from a hidden textarea.
      const t = document.createElement("textarea"); t.value = text; t.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(t); t.select();
      try { ok = document.execCommand("copy"); } catch {} t.remove();
    }
    setCopied(ok ? true : null); track("share_clicked", { via: "copy" });
    setTimeout(() => setCopied(false), 2500);
  }
  async function image() {
    const blob = await shareImage(number, dateLabel, results, streak);
    const file = new File([blob], `geocricket-${number}.png`, { type: "image/png" });
    track("share_clicked", { via: "image" });
    // Native share sheet on phones; on desktop show the image with a download button (desktop share sheets are unreliable).
    if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], text }); return; } catch {} }
    setImg(URL.createObjectURL(blob));
  }

  // Challenge a friend on the same balls (Nets/archive/duel) or a fresh set (live rounds stay secret).
  async function makeChallenge() {
    if (mode === "duel" && duelId) { setChallenge({ url: `${siteUrl()}/duel/${duelId}`, busy: false }); return; }
    setChallenge({ url: "", busy: true }); setChallengeError(null);
    // Guests from the Nets have no player profile yet: make one first, so the main sharing loop never dead-ends.
    if (!(await ensurePlayer())) { setChallenge(null); setChallengeError("Couldn't set up your player. Try again."); return; }
    const body = mode === "practice" || mode === "archive" ? { questionIds } : {};
    const res = await fetch("/api/duels", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setChallenge(null); setChallengeError(data.error ?? "Couldn't create the challenge. Try again."); return; }
    setChallenge({ url: `${siteUrl()}/duel/${data.id}`, busy: false });
    track("duel_created", { from: mode });
  }
  const challengeText = (url: string) => `🏏 I scored ${total} on GeoCricket. Beat me on the same 5 balls ⚔️ ${url}`;

  return (
    <div className="tv-ui absolute inset-x-0 bottom-0 top-[42vh] overflow-y-auto rounded-t-[28px] border-t border-white/15 bg-deep/80 px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-5 backdrop-blur-md lg:inset-y-0 lg:left-auto lg:right-0 lg:top-0 lg:w-[480px] lg:rounded-none lg:border-l lg:border-t-0 lg:pt-[calc(env(safe-area-inset-top)+80px)]">
      <div className="rise mx-auto flex max-w-[460px] flex-col gap-3.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="display text-3xl">{mode === "practice" ? "Nets session done!" : mode === "duel" ? "Duel innings done!" : "Innings over!"}</h2>
          <Link href="/" className="btn-ghost flex shrink-0 items-center gap-1.5 px-3.5 py-2 text-sm !text-cream !no-underline"><House weight="fill" size={16} />Home</Link>
        </div>
        <section className="glass flex flex-col gap-3.5 rounded-3xl px-4 py-5">
          <div className="display flex justify-between text-[13px] font-semibold tracking-[.14em] text-muted">
            <span className="truncate">{(daily || mode === "archive") && number ? `GeoCricket No. ${number} · ${dateLabel}` : dateLabel}</span>
            {ranked && streak > 0 && <span className="flex items-center gap-1"><Fire weight="fill" size={14} className="text-meh" />{streak} day{streak > 1 ? "s" : ""}</span>}
          </div>
          {profile && (
            <div className="flex items-center justify-center gap-2.5">
              <Avatar code={profile.avatar} size={56} className="ring-2 ring-white/40" />
              <div className="text-left leading-tight">
                <div className="font-semibold">@{profile.handle}</div>
                <div className="flex items-center gap-1.5 text-sm text-muted"><Flag code={profile.country} size={12} />{countryName(profile.country)}</div>
              </div>
            </div>
          )}
          <div className="flex items-end justify-center gap-2.5">
            <Board value={shown} digits={total >= 1000 ? 4 : 3} size="lg" />
            <span className="display pb-2 text-[22px] text-muted">/ {max.toLocaleString("en-IN")}</span>
          </div>
          <div className="flex flex-wrap justify-center gap-2" aria-label="Result per question">{results.map((r, i) => <span key={i} className="h-5 w-5 rounded-full shadow-[inset_0_-3px_0_rgba(0,0,0,.2)]" style={{ background: tierOf(r.points).color }} />)}</div>
          <ol className="flex flex-col gap-2">
            {results.map((r, i) => (
              <li key={i} className="grid grid-cols-[18px_1fr_auto] items-center gap-2.5">
                <span className="display font-bold text-muted">{i + 1}</span>
                <span className="flex min-w-0 flex-col gap-1.5 text-[13.5px]">
                  <Link href={`/moments/${r.answer.id}`} className="truncate hover:underline">{r.answer.name}{r.mult > 1 ? ` · ×${r.mult}` : ""}</Link>
                  <span className="h-2 overflow-hidden rounded bg-[#1A1450]"><i className="block h-full rounded" style={{ width: `${r.points}%`, background: tierOf(r.points).color }} /></span>
                </span>
                <span className="display min-w-10 text-right text-lg font-bold tabular-nums">{r.points * r.mult}</span>
              </li>
            ))}
          </ol>
          {ranked && board?.me && (
            <div className="flex items-center justify-between gap-2.5 rounded-xl bg-panel-2 px-3 py-2.5 text-sm">
              <span>{board.count > 1
                ? <>Better than <b className="display text-xl">{board.me.percentile}%</b> of {plural(board.count, "player")}</>
                : <>First on the board</>}</span>
              <span className="text-muted">Rank #{board.me.rank}{board.count > 1 ? ` · avg ${board.avg}` : ""}</span>
            </div>
          )}
          {mode === "archive" && would && (
            <div className="flex items-center justify-between gap-2.5 rounded-xl bg-panel-2 px-3 py-2.5 text-sm">
              <span>{would.count
                ? <>You&apos;d have finished <b className="display text-xl">#{would.rank}</b> of {(would.count + 1).toLocaleString("en-IN")}</>
                : <>Nobody ranked played this one live</>}</span>
              {would.count > 0 && <span className="text-muted">better than {would.percentile}% · avg {would.avg}</span>}
            </div>
          )}
        </section>

        {mode === "duel" && duel && <DuelBoard players={duel} />}

        <StreakOptIn />
        <SignInNudge variant="card" rank={ranked ? board?.me?.rank : null} count={board?.count} />

        {xp && (
          <section className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
            <span className="display grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ok text-lg text-deep">{xp.level}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between text-sm">
                <b>{titleFor(xp.level)}</b>
                <span className={`flex items-center gap-1 ${xpGain >= 0 ? "text-good" : "text-ball"}`}><Lightning weight="fill" size={14} />{xpGain >= 0 ? "+" : ""}{xpGain} XP</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/15"><i className="points-bar block h-full rounded-full" style={{ width: `${Math.round(xp.progress * 100)}%` }} /></div>
              <div className="mt-1 text-xs text-muted">{xp.forNext - xp.intoLevel} XP to level {xp.level + 1} · legends unlock as you level up · <Link href="/profile" className="text-ok">Badges &amp; career →</Link></div>
            </div>
          </section>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <button className="btn-primary col-span-2 flex items-center justify-center gap-2 p-3.5 text-[19px]" onClick={makeChallenge} disabled={challenge?.busy}>
            <Sword weight="fill" size={20} />{challenge?.busy ? "Creating…" : "Challenge a friend"}
          </button>
          {challengeError && <p role="alert" className="col-span-2 rounded-xl bg-ball/20 px-3 py-2 text-center text-sm">{challengeError}</p>}
          {challenge?.url && (
            <div className="col-span-2 flex flex-col gap-2 rounded-2xl border border-ok/50 bg-ok/10 p-3 text-sm">
              <span>Send this link. They play the same 5 balls, and you both see who won.</span>
              <a className="display rounded-xl bg-[#1FA855] p-3 text-center text-lg text-white" target="_blank" rel="noopener"
                href={`https://wa.me/?text=${encodeURIComponent(challengeText(challenge.url))}`} onClick={() => track("share_clicked", { via: "duel_whatsapp" })}>
                Send on WhatsApp
              </a>
              <code className="select-all break-all rounded-lg bg-deep/70 px-2 py-1.5 text-xs">{challenge.url}</code>
            </div>
          )}
          {ranked && (
            <a className="display col-span-2 rounded-xl bg-[#1FA855] p-3.5 text-center text-xl font-extrabold tracking-[.06em] text-white"
              href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener" onClick={() => track("share_clicked", { via: "whatsapp" })}>
              Share on WhatsApp
            </a>
          )}
          {ranked && <button className={`share-btn ${copied ? "done" : ""}`} onClick={copy}>{copied ? <Check weight="bold" size={20} /> : <CopySimple weight="bold" size={20} />}{copied ? "Copied!" : copied === null ? "Copy blocked" : "Copy result"}</button>}
          {ranked && <button className="share-btn" onClick={image}><ImageSquare weight="bold" size={20} />Share image</button>}
          <button onClick={onPractice} className="next-card group text-left">
            <Target weight="duotone" size={34} className="shrink-0 text-[#F5C000] transition group-hover:rotate-12" />
            <span className="min-w-0"><b className="display block text-lg leading-tight">{mode === "practice" ? "Another Nets session" : "Go to the Nets"}</b><span className="text-xs text-[#CFC8F5]">Unlimited balls · earn XP</span></span>
            <ArrowRight weight="bold" size={18} className="ml-auto shrink-0 text-muted transition group-hover:translate-x-1 group-hover:text-cream" />
          </button>
          <Link href="/ghost" className="next-card hot group col-span-2 !no-underline">
            <Ghost weight="duotone" size={34} className="shrink-0 text-ok transition group-hover:scale-110" />
            <span className="min-w-0"><b className="display block text-lg leading-tight !text-cream">Race a ghost</b><span className="text-xs text-[#CFC8F5]">A real player&apos;s run on 5 balls you haven&apos;t played · anytime</span></span>
            <ArrowRight weight="bold" size={18} className="ml-auto shrink-0 text-muted transition group-hover:translate-x-1 group-hover:text-cream" />
          </Link>
          <Link href="/live" className="next-card hot group !no-underline">
            <Lightning weight="duotone" size={34} className="shrink-0 text-ok transition group-hover:scale-110" />
            <span className="min-w-0"><b className="display block text-lg leading-tight !text-cream">Play a live 1v1</b><span className="text-xs text-[#CFC8F5]">Same ball, same moment · win the duel</span></span>
            <ArrowRight weight="bold" size={18} className="ml-auto shrink-0 text-muted transition group-hover:translate-x-1 group-hover:text-cream" />
          </Link>
        </div>

        <Link href="/" className="btn-ghost flex items-center justify-center gap-2 py-3 text-base !text-cream !no-underline"><House weight="fill" size={18} />Back to home · today&apos;s games</Link>

        {(ranked || mode === "archive") && <LeaderboardPanel date={date} refreshKey={board ? 1 : 0} fixed={mode !== "daily"} title={mode === "archive" ? "Who played it live" : undefined} />}

        <AdSlot slot={process.env.NEXT_PUBLIC_AD_SLOT_RESULTS} />

        <p className="text-center text-xs leading-normal text-[#8B84C9]">
          {ranked ? `Next: ${nextSlotLabel(profile?.country)}. ` : ""}<Link href="/archive" className="underline">Play past rounds</Link> · <Link href="/about" className="underline">About</Link><br />
          Not affiliated with BCCI, IPL, ICC or any team.
        </p>
      </div>

      {img && (
        <div className="fixed inset-0 grid place-items-center bg-[rgba(3,6,12,.88)] px-4 py-5" onClick={() => setImg(null)}>
          <div className="flex w-full max-w-[360px] flex-col gap-3 text-center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt="Your GeoCricket scorecard" className="w-full rounded-2xl border border-line" />
            <a className="btn-primary p-3" href={img} download={`geocricket-${number}.png`}>Save image</a>
            <button className="btn-ghost p-3" onClick={() => setImg(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Head-to-head table for a friend challenge. */
export function DuelBoard({ players }: { players: DuelPlayer[] }) {
  const done = players.filter((p) => p.done).sort((a, b) => b.total - a.total);
  const waiting = players.filter((p) => !p.done);
  const top = done[0]?.total;
  return (
    <section className="glass flex flex-col gap-2 rounded-3xl p-4">
      <h3 className="display flex items-center gap-2 text-lg"><Sword weight="fill" size={18} className="text-ok" />Head to head</h3>
      {done.length < 2 && <p className="text-sm text-muted">{done.length ? "Waiting for your friend to play." : "Nobody has finished yet."}</p>}
      <ol className="flex flex-col gap-1.5">
        {done.map((p, i) => (
          <li key={i} className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${p.me ? "bg-white/15" : "bg-white/5"}`}>
            <Avatar code={p.avatar} size={32} />
            <span className="min-w-0 flex-1 truncate">@{p.handle}{p.me ? " (you)" : ""}</span>
            <Flag code={p.country} size={12} />
            <b className="display text-xl">{p.total}</b>
            {done.length > 1 && p.total === top && <span className="display rounded-full bg-ok px-2 py-0.5 text-[11px] text-deep">Winner</span>}
          </li>
        ))}
        {waiting.map((p, i) => (
          <li key={`w${i}`} className="flex items-center gap-2.5 rounded-xl bg-white/5 px-2.5 py-2 text-muted">
            <Avatar code={p.avatar} size={32} className="opacity-60" /><span className="flex-1 truncate">@{p.handle}</span><span className="text-xs">playing…</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
