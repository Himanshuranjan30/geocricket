"use client";

import { plural } from "@/lib/game";
import { ArrowRight, CalendarBlank, CalendarCheck, CaretDown, ClockCounterClockwise, Crown, Fire, Ghost, Lightning, PencilSimple, Ranking, Snowflake, Sword, Target, Trophy, UsersThree } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { addDays, dayEndMs, istDate, slotKey, slotMs, slotName, SLOTS } from "@/lib/game";
import { useLeague } from "./League";
import { track } from "./Analytics";
import { Avatar } from "./Avatar";
import { Flag } from "./Flag";
import type { GlobeApi } from "./Globe";
import { fetchMe, publishMe, useMe, type Me } from "@/lib/useMe";
import { offerReward } from "@/lib/ads";
import { legendOf } from "@/lib/legends";
import { timeAt, untilLabel } from "@/lib/resetTime";
import { AccountMenu } from "./AccountMenu";
import { Boards } from "./Boards";
import { WhoCard } from "./WhoCard";
import { AdSlot } from "./AdSlot";
import { MobileNav } from "./MobileNav";
import { LegendSpotlight } from "./LegendSpotlight";
import { SignInNudge } from "./SignInNudge";
import { StreakOptIn } from "./StreakOptIn";
import { CharacterSwitcher } from "./CharacterSwitcher";
import { FirstOffer } from "./FirstOffer";
import { Logo } from "./Logo";
import { PlayerFigure } from "./PlayerFigure";
import { ProfileSetup } from "./ProfileSetup";
import { Floodlights, Ticker } from "./Stadium";

// Start downloading the map engine as soon as this module loads, not after hydration.
const globeChunk = typeof window !== "undefined" ? import("./Globe") : null;
const Globe = dynamic(() => globeChunk ?? import("./Globe"), { ssr: false });

type Pulse = { online: number; today: number; faces: string[]; recent: { players: { handle: string; avatar: string; country: string | null }[]; winner: number | null } | null };
type Edition = { key: string; kind: string; title: string; opensMs: number; closesMs: number; balls: number; live: boolean };

/** The home dashboard at /: modes on the left, your batter standing on the globe, today's board on the right. */
export function Landing({ challenge, logos = {} }: { challenge?: number; logos?: Record<string, string> }) {
  const router = useRouter();
  const [me, setMe] = useMe();
  const [done, setDone] = useState(0);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [eds, setEds] = useState<Edition[] | null>(null); // null until loaded: slots are assumed scheduled meanwhile
  const [prog, setProg] = useState<Record<string, number>>({}); // balls played in each open timed slot
  const [now, setNow] = useState(() => Date.now()); // ticks every minute so the countdowns move
  const [setup, setSetup] = useState<"play" | "edit" | "onboard" | "legends" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const league = useLeague();
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast]);
  // On desktop the dashboard doesn't scroll (overflow hidden), but focus inside the setup sheet can nudge it: reset on close.
  useEffect(() => {
    if (setup) return;
    const m = document.querySelector("main");
    if (m && getComputedStyle(m).overflowY === "hidden") m.scrollTop = 0;
  }, [setup]);

  useEffect(() => {
    fetchMe().then((m: Me) => {
      // First visit after signing up: character first, then the legends (once per account; editable later in Settings).
      const q = new URLSearchParams(window.location.search);
      if (m.user && !m.onboarded) setSetup("onboard");
      else if (q.has("legend")) setToast(`${legendOf(`legend:${q.get("legend")}`)?.name ?? "Your legend"} is ready. Every ball you bowl, they react.`);
      if (q.has("setup") || q.has("legend")) window.history.replaceState(null, "", "/"); // ?welcome is handled by AuthLayer
    });
    fetch("/api/round", { cache: "no-store" }).then((r) => r.json()).then((r) => setDone(r.progress?.length ?? 0), () => {});
    fetch("/api/editions", { cache: "no-store" }).then((r) => r.json()).then((d) => setEds(d.editions ?? []), () => setEds([]));
    const poll = () => fetch("/api/pulse", { cache: "no-store" }).then((r) => r.json()).then(setPulse, () => {});
    poll();
    const c = setTimeout(() => setNow(Date.now()), 0); // the page is prerendered, so its first render carries the build time: catch up right away
    const a = setInterval(() => { if (!document.hidden) poll(); }, 30_000), b = setInterval(() => setNow(Date.now()), 60_000);
    return () => { clearInterval(a); clearInterval(b); clearTimeout(c); };
  }, []);

  // First-time and lapsed visitors (no game in the last two weeks) get a one-line pitch; regulars get a clean screen.
  const pitch = !!me && !(me.played?.length);
  const onReady = useCallback((g: GlobeApi) => g.spin(true, true), []);
  const [painted, setPainted] = useState(false);
  const onPainted = useCallback(() => setPainted(true), []);
  const go = () => { track("play_clicked", { challenge: challenge ?? null }); router.push("/play"); };
  const play = () => (me?.profile ? go() : setSetup("play"));
  const match = eds?.find((e) => e.kind === "match" && e.live);
  // Four games a day at fixed IST times (SLOT_MINUTES_IST): the Daily (open from midnight), Morning Test, Evening Daily and
  // Evening Test. Every slot closes at midnight IST. The morning Daily is the dated round; the rest are timed.
  const country = me?.profile?.country;
  const today = istDate(new Date(now));
  const slots = SLOTS.map(({ game, slot }) => {
    const key = slotKey(today, game, slot), balls = game === "daily" ? 5 : 10, opensMs = slotMs(today, game, slot), closesMs = dayEndMs(today);
    const exists = key === today || !eds || eds.some((e) => e.key === key);
    const n = key === today ? done : prog[key] ?? 0;
    return { key, game, slot, balls, opensMs, closesMs, exists, open: exists && now >= opensMs && now <= closesMs, n, finished: n >= balls };
  });
  const openKeys = slots.filter((x) => x.open && x.key !== today).map((x) => x.key).join(",");
  useEffect(() => {
    for (const key of openKeys ? openKeys.split(",") : [])
      fetch(`/api/round?key=${key}`, { cache: "no-store" }).then((r) => r.json()).then((r) => setProg((p) => ({ ...p, [key]: r.progress?.length ?? 0 })), () => {});
  }, [openKeys]);
  const played = slots.filter((x) => x.finished).length;
  const dailyCupMs = Date.parse(`${today}T21:30:00+05:30`); // official Daily Cup (DAILY_CUP_HOUR_IST in lib/cups.ts)
  const upcoming = slots.filter((x) => x.opensMs > now).sort((x, y) => x.opensMs - y.opensMs)[0];
  const tomorrow = addDays(today, 1), nextAt = upcoming?.opensMs ?? slotMs(tomorrow, "daily", "am");
  const nextName = upcoming ? slotName(upcoming.game, upcoming.slot) : "Tomorrow's Daily";
  const slotSub = (x: (typeof slots)[number]) => x.finished ? "Done ✓"
    : x.open ? (x.n ? `Resume · ${plural(x.balls - x.n, "ball")} left · closes in ${untilLabel(x.closesMs, now)}` : `Open now · closes in ${untilLabel(x.closesMs, now)}`)
    : now > x.closesMs ? "Closed" : !x.exists && now >= x.opensMs ? "Coming soon" : `Opens ${timeAt(x.opensMs, country)} · in ${untilLabel(x.opensMs, now)}`;

  // Today's games first, then everything else; on phones the leaderboards sit between the two so they're seen early.
  const today4 = (
    <div className="flex flex-col gap-3">
      <WhoCard />
      <SignInNudge variant="banner" />
      <StreakOptIn />
      <StreakCard streak={me?.streak ?? 0} played={me?.played ?? []} frozen={me?.frozen ?? []} atRisk={!!me?.streakAtRisk} />
      <StreakSaver streak={me?.saveStreak ?? 0} />
      <div className="flex flex-col gap-0.5 rounded-2xl bg-white/5 px-4 py-2.5 ring-1 ring-white/10" aria-live="polite">
        <span className="display text-sm">Today <span className={played === 4 ? "text-ok" : "text-[#F5C000]"}>{played}/4</span> games played</span>
        <span className="text-[11px] text-[#CFC8F5]" suppressHydrationWarning>Next: <b className="text-cream" suppressHydrationWarning>{nextName}</b> at {timeAt(nextAt, country)} · in {untilLabel(nextAt, now)}</span>
      </div>
      {(["daily", "test"] as const).map((game) => {
        // One card per game that follows the day: the open slot you haven't finished, else the next one, else done.
        const mine = slots.filter((x) => x.game === game), doneN = mine.filter((x) => x.finished).length;
        const x = mine.find((y) => y.open && !y.finished) ?? mine.find((y) => y.opensMs > now) ?? mine[mine.length - 1];
        const slotName = x.slot === "am" ? "Morning slot" : "Evening slot";
        const allDone = doneN === mine.length;
        const tag = allDone ? { text: `✓ ${doneN}/${mine.length} done today`, kind: "done" }
          : x.open ? { text: `● Live now · ${slotName}`, kind: "live" }
          : x.opensMs > now ? { text: `⏰ ${slotName} · ${timeAt(x.opensMs, country).replace(/ IST$/, "")}`, kind: "soon" } : null;
        const sub = allDone ? `All done · next tomorrow at ${timeAt(slotMs(tomorrow, game, "am"), country)}` : doneN ? `${slotSub(x)} · ${doneN}/${mine.length} played` : slotSub(x);
        const props = { title: game === "daily" ? "Daily Challenge" : "Test Match", badge: `${x.balls} balls · 2 slots a day`, sub, tag, hot: x.open && !x.finished,
          art: game === "daily" ? <CalendarCheck weight="duotone" /> : <CalendarBlank weight="duotone" /> };
        const canPlay = x.open || x.finished;
        return x.key === today
          ? <ModeCard key={game} {...props} onClick={canPlay ? play : undefined} />
          : <ModeCard key={game} {...props} href={canPlay ? `/test/${x.key}` : undefined} />;
      })}
    </div>
  );
  const more = (
    <div className="flex flex-col gap-3">
      <ModeCard href="/ghost" title="Ghost Race" badge="Anytime · instant 1v1" sub="Beat a real player's run, ball by ball" art={<Ghost weight="duotone" />} hot />
      <ModeCard href="/league" title="League" badge={league && !league.guest ? league.name : "Weekly · 8 tiers"}
        sub={!league || league.guest ? "Sign in, earn XP, move up a tier" : league.joined ? `#${league.members.find((m) => m.me)?.rank ?? "–"} of ${league.members.length} · ends in ${untilLabel(league.endsMs, now)}` : "Earn XP in any game to join this week"}
        art={<Ranking weight="duotone" />} />
      <ModeCard href="/mystery/duel" title="Name Race 1v1" badge="Mystery Cricketer live" art={<Sword weight="duotone" />} hot />
      <ModeCard href="/live" title="Live 1v1" badge="Quick match" art={<Lightning weight="duotone" />} hot />
      <ModeCard href="/cups" title="Cups" badge="Knockout tournaments" sub="Host one, invite friends, lift the trophy" art={<Trophy weight="duotone" />} hot
        tag={{ text: `Daily Cup · ${timeAt(dailyCupMs, country).replace(/ IST$/, "")}`, kind: now < dailyCupMs ? "soon" : "live" }} />
      {match && <ModeCard href={`/match/${match.key}`} title="Match Day" badge="Live now" sub={`${match.balls} balls`} art={<Trophy weight="duotone" />} hot />}
      <ModeCard href="/locker" title="Legends Locker" badge="30 legends" sub="Play as cricket's greatest" art={<Crown weight="duotone" />} />
      <ModeCard href="/archive" title="Archive" sub="Every past game · where would you rank?" art={<ClockCounterClockwise weight="duotone" />} />
      <ModeCard href="/nets" title="Nets" sub="Unlimited · earn XP" art={<Target weight="duotone" />} />
      <ModeCard href="/groups" title="Groups" sub="Your friends' board" art={<UsersThree weight="duotone" />} />
    </div>
  );

  return (
    <main className="night-sky fixed inset-0 overflow-y-auto overflow-x-hidden lg:overflow-hidden">
      <div className="stars" aria-hidden />
      {!pitch && <h1 className="sr-only">GeoCricket: the daily cricket geography game. Guess where cricket&apos;s greatest moments happened.</h1>}
      <Floodlights />

      {/* Hero: globe low in the frame, your batter standing on top of it. */}
      <section className="dash-hero">
        <div className="dash-globe">
          {/* eslint-disable-next-line @next/next/no-img-element -- static poster until the live globe paints */}
          <img src="/globe-poster.webp" alt="" aria-hidden fetchPriority="high" className={`dash-poster ${painted ? "gone" : ""}`} />
          <Globe onTap={() => {}} onReady={onReady} onPainted={onPainted} />
        </div>
        <PlayerFigure code={me?.profile?.avatar ?? "pitchmap-india"} className="dash-figure" />
        <div className="dash-switch"><CharacterSwitcher /></div>
        <button onClick={() => (me?.profile ? setSetup("edit") : setSetup("play"))} className="dash-edit display flex items-center gap-1.5 rounded-full bg-[#6B4CE6] px-5 py-2 text-sm shadow-[0_4px_0_#3E2A9A,0_10px_30px_rgba(0,0,0,.4)] hover:brightness-110">
          <PencilSimple weight="bold" size={14} />{me?.profile ? "Edit avatar" : "Create player"}
        </button>
        {/* phone: the main call to action sits under the globe's edge */}
        <div className="absolute inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+16px)] mx-auto max-w-[480px] lg:hidden">
          <button className="btn-primary w-full py-4 text-2xl" disabled={!me} onClick={play}>{done >= 5 ? "See scorecard" : done ? "Resume innings" : "Take guard"}</button>
        </div>
      </section>

      <header className="tv-ui absolute inset-x-0 top-0 z-20 flex items-center gap-5 px-4 pt-[calc(env(safe-area-inset-top)+12px)] lg:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex">
          <Menu label="Singleplayer" items={[["/play", "Daily Challenge"], ["/nets", "Nets"], ["/archive", "Archive"]]} />
          <Link href="/locker" className="display px-3 py-2 text-sm !text-[#F5C000] !no-underline hover:brightness-110">Legends</Link>
          <Menu label="Multiplayer" items={[["/live", "Live 1v1"], ["/mystery/duel", "Name Race 1v1"], ["/mystery/host", "Host a challenge"], ["/cups", "Cups"], ["/groups", "Groups"]]} />
          <Link href="/leaderboard" className="display px-3 py-2 text-sm !text-cream !no-underline hover:text-ok">Leaderboards</Link>
          <Link href="/how-it-works" className="display hidden whitespace-nowrap px-3 py-2 text-xs xl:block !text-muted !no-underline hover:!text-cream">How to play</Link>
        </nav>
        <div className="ml-auto shrink-0">
          {/* compact (avatar only) until there's room for the name next to the nav */}
          <span className="xl:hidden"><AccountMenu compact onEdit={() => setSetup(me?.profile ? "edit" : "play")} /></span>
          <span className="hidden xl:block"><AccountMenu onEdit={() => setSetup(me?.profile ? "edit" : "play")} /></span>
        </div>
      </header>

      {/* Top centre: last live duel + who's playing right now. */}
      <div className="tv-ui absolute inset-x-0 top-[calc(env(safe-area-inset-top)+70px)] z-10 flex flex-col items-center gap-2 px-4 rise">
        {pitch && (
          <h1 className="max-w-[92vw] text-center text-[15px] leading-snug text-cream [text-shadow:0_1px_10px_rgba(10,6,40,.9)] lg:text-base">
            <span className="display italic text-[#F5C000]">Lara&apos;s 400. Dhoni&apos;s six. Kapil&apos;s &apos;83.</span>{" "}
            <span className="whitespace-nowrap">Can you pin them all?</span>
          </h1>
        )}
        {challenge != null && (
          <div className="rounded-2xl border border-ball/60 bg-ball/20 px-4 py-2 text-sm font-semibold"><Sword weight="fill" size={16} className="-mt-0.5 mr-1.5 inline text-ok" />A friend scored {challenge}/1000. Can you beat it?</div>
        )}
        {pulse?.recent && (
          <Link href="/live" className="glass flex max-w-full items-center gap-2 rounded-xl px-2.5 py-2 !text-cream !no-underline hover:bg-white/10 sm:gap-2.5 sm:px-3">
            <span className="display flex items-center gap-1 rounded-md bg-[#E5233B] px-2 py-0.5 text-[11px]"><span className="h-1.5 w-1.5 rounded-full bg-white" /><span className="hidden min-[400px]:inline">RECENT</span></span>
            {pulse.recent.players.map((p, i) => (
              <span key={i} className="flex min-w-0 items-center gap-1.5">
                {i === 1 && <span className="display mr-1 text-lg italic text-[#8FB8FF]">VS.</span>}
                <Avatar code={p.avatar} size={22} /><b className={`display max-w-[6.5rem] truncate text-sm min-[400px]:max-w-[7rem] ${pulse.recent!.winner === i ? "text-ok" : ""}`}>{p.handle}</b><span className="hidden min-[400px]:inline-flex"><Flag code={p.country} size={11} /></span>
              </span>
            ))}
            <ArrowRight size={16} className="text-muted" />
          </Link>
        )}
        {/* Social proof, always a true number: who's playing this minute, else today's players once there are a few (an
            empty room reads worse than no counter). */}
        {pulse && (pulse.online > 0 || pulse.today >= 5) && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <span className="flex -space-x-2">{pulse.faces.map((f, i) => <Avatar key={i} code={f} size={24} className="ring-2 ring-[var(--night)]" />)}</span>
            {pulse.online > 0
              ? <><b className="text-cream">{pulse.online.toLocaleString("en-IN")}</b> playing now</>
              : <><b className="text-cream">{pulse.today.toLocaleString("en-IN")}</b> players today</>}
          </p>
        )}
      </div>

      {/* Desktop columns. On phones the same cards follow the hero. */}
      <aside className="tv-ui absolute bottom-20 left-6 top-[84px] z-10 hidden w-[250px] overflow-y-auto pb-[72px] [mask-image:linear-gradient(to_bottom,#000_calc(100%-56px),transparent)] [scrollbar-width:none] lg:block"><div className="flex flex-col gap-3">{today4}{more}</div></aside>
      <div className="tv-ui absolute bottom-24 right-6 top-36 z-10 hidden w-[340px] overflow-y-auto [scrollbar-width:none] lg:block"><Boards /><AdSlot slot={process.env.NEXT_PUBLIC_AD_SLOT_HUBS} className="mt-3" /></div>
      <div className="relative z-10 flex flex-col gap-4 px-4 pb-[calc(env(safe-area-inset-bottom)+96px)] lg:hidden">
        <div id="modes" className="scroll-mt-4">{today4}</div>
        <div id="boards" className="scroll-mt-4"><Boards /></div>
        <AdSlot slot={process.env.NEXT_PUBLIC_AD_SLOT_HUBS} />
        {more}
      </div>
      <MobileNav onPlay={play} />

      <div className="tv-ui absolute bottom-0 inset-x-0 hidden lg:block"><Ticker logos={logos} /></div>
      <footer className="tv-ui absolute inset-x-0 bottom-12 z-10 hidden items-center gap-3 px-6 lg:flex">
        <nav className="ml-auto flex items-center gap-1 text-xs font-semibold">
          {[["/how-it-works", "How to play"], ["/grounds", "Grounds"], ["/players", "Players"], ["/moments", "Moments"], ["/about", "About"], ["/privacy", "Privacy"], ["/terms", "Terms"], ["/refunds", "Refunds"], ["/feedback", "Report a bug"]].map(([href, label]) => (
            <Link key={href} href={href} className="rounded-full px-3 py-1 !text-cream !no-underline hover:bg-white/10">{label}</Link>
          ))}
        </nav>
      </footer>

      {(setup === "play" || setup === "edit" || setup === "onboard") && me && (
        <ProfileSetup initial={me.profile} suggestedCountry={me.suggestedCountry} user={me.user} googleEnabled={me.googleEnabled} onboard={setup === "onboard"}
          onCancel={() => setSetup(null)}
          onDone={(profile) => {
            const then = setup; setMe({ ...me, profile, onboarded: me.onboarded || then === "onboard" }); track("profile_saved", { country: profile.country, step: then });
            if (then === "onboard") setSetup("legends"); else { setSetup(null); if (then === "play") go(); }
          }} />
      )}
      {setup === "legends" && me && <LegendSpotlight country={me.profile?.country ?? me.suggestedCountry} onDone={() => setSetup(null)} />}
      {!setup && me?.user && <FirstOffer variant="modal" country={me.profile?.country ?? me.suggestedCountry} />}
      {toast && <div role="status" className="rise fixed inset-x-4 bottom-6 z-50 mx-auto max-w-[420px] rounded-2xl bg-ok px-4 py-3 text-center font-semibold text-deep shadow-xl">{toast}</div>}
    </main>
  );
}

function Menu({ label, items }: { label: string; items: [string, string][] }) {
  return (
    <div className="group relative">
      <button className="display flex items-center gap-1 px-3 py-2 text-sm">{label}<CaretDown size={12} weight="bold" className="text-muted" /></button>
      <div className="invisible absolute left-0 top-full z-30 min-w-[180px] pt-1 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        <ul className="glass flex flex-col rounded-xl p-1.5">
          {items.map(([href, text]) => <li key={href}><Link href={href} className="block rounded-lg px-3 py-2 text-sm font-semibold !text-cream !no-underline hover:bg-white/10">{text}</Link></li>)}
        </ul>
      </div>
    </div>
  );
}

function ModeCard({ title, sub, badge, art, href, onClick, hot, tag }: { title: string; sub?: string; badge?: string; art: React.ReactNode; href?: string; onClick?: () => void; hot?: boolean; tag?: { text: string; kind: string } | null }) {
  const body = (
    <span className="relative block">
    {tag && <span key={tag.text} className={`mode-tag display ${tag.kind}`} suppressHydrationWarning>{tag.text}</span>}
    <span className={`mode-card ${hot ? "hot" : ""} ${href || onClick ? "" : "opacity-80"}`}>
      <span className="mode-text relative z-10 flex flex-col gap-1.5">
        <span className="display text-[17px] italic leading-none xl:text-[19px]">{title}</span>
        {badge && <span className="display text-[11px] uppercase italic tracking-wide text-[#F5C000]">{badge}</span>}
        {sub && <span className="text-xs italic text-[#CFC8F5]" suppressHydrationWarning>{sub}</span>}
      </span>
      <span className="mode-art">{art}</span>
    </span>
    </span>
  );
  const label = [tag?.text.replace(/^[^\p{L}\d]+/u, ""), title, sub].filter(Boolean).join(". ");
  if (href) return <Link href={href} aria-label={label} className="!no-underline">{body}</Link>;
  if (onClick) return <button onClick={onClick} aria-label={label} className="w-full text-left">{body}</button>;
  return body;
}

/** Missed yesterday after this week's freeze was spent: offer to save the streak with a rewarded ad. Shown only when
 * Google has an ad ready, so it never appears as a dead button. */
function StreakSaver({ streak }: { streak: number }) {
  const [show, setShow] = useState<(() => Promise<boolean>) | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => { if (streak) offerReward("save-streak", (s) => setShow(() => s)); }, [streak, tries]);
  if (!streak || !show) return null;
  const save = async () => {
    setShow(null);
    track("reward_offer_click", { reward: "save-streak", streak });
    if (await show() && (await fetch("/api/streak/save", { method: "POST" })).ok) {
      track("reward_granted", { reward: "save-streak", streak });
      publishMe(await fetchMe(true));
    } else setTries((t) => t + 1); // dismissed or failed: offer again if another ad is ready
  };
  return (
    <button onClick={save} className="mode-card !flex w-full items-center gap-3 !py-3 text-left">
      <Snowflake weight="duotone" size={28} className="shrink-0 text-[#9ED3FF]" />
      <span className="flex flex-col gap-0.5">
        <span className="display text-sm italic">Save your {streak}-day streak</span>
        <span className="text-xs text-[#CFC8F5]">You missed yesterday. Watch a short ad to keep it going.</span>
      </span>
    </button>
  );
}

function StreakCard({ streak, played, frozen, atRisk }: { streak: number; played: string[]; frozen: string[]; atRisk: boolean }) {
  const today = istDate();
  const dow = new Date(today + "T12:00:00Z").getUTCDay();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - dow)); // this week, Sun..Sat
  const set = new Set(played), ice = new Set(frozen);
  return (
    <div className="relative pt-4">
      <span className="display absolute left-4 top-1 z-10 rounded-t-lg bg-[#4B3BB8] px-3 py-1 text-[11px] uppercase tracking-wide">{streak ? `${streak} day${streak === 1 ? "" : "s"} streak${atRisk && streak > 1 ? " · play today" : ""}` : "Start a streak today"}</span>
      <Fire weight="duotone" size={40} className={`absolute right-3 top-0 z-10 ${streak ? "text-[#FF8A3D] drop-shadow-[0_0_12px_rgba(255,138,61,.7)]" : "text-white/25"}`} />
      <div className="mode-card !block !pt-5">
        <div className="grid grid-cols-7 gap-1 text-center">
          {"SMTWTFS".split("").map((d, i) => <span key={i} className="display text-[10px] text-muted">{d}</span>)}
          {days.map((d) => {
            const on = set.has(d), froze = ice.has(d), isToday = d === today, future = d > today;
            return (
              <span key={d} title={froze ? "Streak freeze used" : undefined} className={`display grid aspect-square place-items-center rounded-lg text-xs ${on ? "bg-[#FF8A3D] text-deep" : froze ? "bg-[#3FA9F5]/30 text-[#9ED3FF]" : isToday ? "ring-2 ring-[#F5C000] text-cream" : future ? "text-white/25" : "bg-white/5 text-muted"}`}>
                {on ? <Fire weight="fill" size={14} /> : froze ? <Snowflake weight="bold" size={14} /> : Number(d.slice(8))}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

