import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Page } from "@/components/Page";
import { addDays, CHALLENGES, challengeHref, challengeOpensMs, dayEndMs, DAY_MAX, istDate, type ChallengeId } from "@/lib/game";
import { ChallengeChips } from "@/components/ChallengeChips";
import { leaderboard, playerId } from "@/lib/server";
import { prizeState } from "@/lib/prize";
import { Flag } from "@/components/Flag";
import { Rank } from "@/components/Rank";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leaderboard", description: "Today's GeoCricket leaderboard: everyone's points from all of the day's challenges.", alternates: { canonical: "/leaderboard" } };

/** Request time (dynamic page): the countdown and which challenges are open now. */
const requestTime = () => Date.now();
const fmt = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

export default async function Leaderboard({ searchParams }: PageProps<"/leaderboard">) {
  const today = istDate();
  const sp = await searchParams;
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const pid = await playerId();
  const [lb, prize] = await Promise.all([leaderboard(date, pid), prizeState(pid)]);
  const won = prize.mine.find((m) => m.status === "unclaimed");
  const href = (d: string) => (d === today ? "/leaderboard" : `/leaderboard?date=${d}`);
  const now = requestTime(), isToday = date === today;
  const mins = Math.max(0, Math.round((dayEndMs(today) - now) / 60e3)), left = `${Math.floor(mins / 60)}h ${mins % 60}m`;

  return (
    <Page title={date === today ? "Today's leaderboard" : `Leaderboard · ${fmt(date)}`} eyebrow="One board · every public challenge of the day">
      {won && <Link href="/prize" className="display rounded-2xl border border-[#F5C000] bg-[#F5C000]/15 px-4 py-3 text-center !text-[#F5C000] !no-underline">🏆 You won {won.label}! Claim your prize →</Link>}
      <Link href="/prize" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#F5C000]/40 bg-[#F5C000]/10 px-4 py-3 !no-underline">
        <span className="display !text-[#F5C000]">🏆 #1 at midnight wins {prize.label}</span>
        <span className="text-xs text-[#E4E1FA]">{prize.last ? <>Last winner: <b>@{prize.last.handle}</b> · </> : null}Free to play · Rules →</span>
      </Link>
      {!prize.signedIn && <Link href="/settings" className="display rounded-2xl bg-ok px-4 py-3 text-center !text-deep !no-underline">Sign in to get on the board and play for {prize.label} →</Link>}
      <p className="text-sm text-muted">Everyone plays the same five challenges each day. Your points from all of them add up here.</p>
      <ul className="grid grid-cols-2 gap-1.5 text-sm sm:grid-cols-5">
        {CHALLENGES.map((c) => (
          <li key={c.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <span className="display block">{c.name}</span>
            <span className="text-xs text-muted">up to <b className="text-cream">{c.max.toLocaleString("en-IN")}</b> · opens {c.opens}</span>
          </li>
        ))}
      </ul>
      <p className="-mt-1 text-xs text-muted">
        A full day is worth {DAY_MAX.toLocaleString("en-IN")} points; the Test Matches are worth the most.
        {isToday ? <> Board closes in <b className="text-cream">{left}</b> (midnight IST).</> : null}
      </p>
      {isToday && <YourDay games={lb.me?.games ?? {}} day={today} now={now} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          <b className="text-cream">{lb.count}</b> {lb.count === 1 ? "player" : "players"} on the board{isToday ? " today" : ""}
        </p>
        <div className="flex gap-3 text-sm">
          <Link href={href(addDays(date, -1))}>← Previous day</Link>
          {date < today && <Link href={href(addDays(date, 1))}>Next day →</Link>}
        </div>
      </div>
      {lb.me && !lb.top.some((r) => r.me) && <PlayerRow r={lb.me} />}
      {lb.top.length === 0 ? <p className="rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center text-muted">Nobody on the board yet{isToday ? " today" : ""}. {isToday ? <><Link href="/">Play the Daily</Link> and take #1.</> : null}</p> : (
        <ol className="flex flex-col gap-1.5">{lb.top.map((r) => <PlayerRow key={r.rank} r={r} />)}</ol>
      )}
      <p className="text-sm text-muted">
        Signed-in players only: guests don&apos;t appear on the board and can&apos;t win. 1v1s, cups, Nets and private group games don&apos;t count, and replaying a
        past day doesn&apos;t change its board. Ties go to whoever finished their last challenge first, then to the closer total distance.
      </p>
    </Page>
  );
}

/** Today's five challenges for the viewer: done (points), open now (play), or opening later; and what's still on the table. */
function YourDay({ games, day, now }: { games: Partial<Record<ChallengeId, number>>; day: string; now: number }) {
  const todo = CHALLENGES.filter((c) => games[c.id] == null);
  const up = todo.reduce((s, c) => s + c.max, 0);
  return (
    <section className="rounded-2xl border border-ok/30 bg-ok/5 px-4 py-3">
      <p className="display text-sm">{todo.length ? <>Your day: <span className="text-ok">{5 - todo.length}/5</span> played · up to <b className="text-ok">{up.toLocaleString("en-IN")}</b> points still to win</> : <>Your day: <span className="text-ok">all 5 played</span>. See you tomorrow.</>}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
        {CHALLENGES.map((c) => {
          const pts = games[c.id], open = challengeOpensMs(c.id, day) <= now;
          return pts != null
            ? <li key={c.id} className="rounded-full bg-ok/20 px-2.5 py-1 text-ok">✓ {c.name} · {pts}</li>
            : open
              ? <li key={c.id}><Link href={challengeHref(c.id, day)} className="display block rounded-full bg-ok px-2.5 py-1 !text-deep !no-underline">▶ {c.name}</Link></li>
              : <li key={c.id} className="rounded-full bg-white/5 px-2.5 py-1 text-muted">{c.name} · opens {c.opens}</li>;
        })}
      </ul>
    </section>
  );
}

function PlayerRow({ r }: { r: { rank: number; handle: string; avatar: string; country: string | null; total: number; km: number; me: boolean; games?: Partial<Record<ChallengeId, number>> } }) {
  return (
    <li className={`grid grid-cols-[44px_1fr_auto] items-center gap-3 rounded-2xl border px-4 py-2.5 ${r.me ? "border-ok/60 bg-white/15" : "border-white/10 bg-white/5"}`}>
      <span className="text-lg"><Rank n={r.rank} /></span>
      <span className="flex min-w-0 items-center gap-2">
        <Avatar code={r.avatar} size={32} />
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2"><span className="truncate font-medium">@{r.handle}{r.me ? " (you)" : ""}</span><Flag code={r.country} /></span>
          <ChallengeChips games={r.games} size="xs" />
        </span>
      </span>
      <span className="text-right">
        <b className="display text-xl">{r.total.toLocaleString("en-IN")}</b>{" "}
        <span className="text-xs text-muted">pts</span>
      </span>
    </li>
  );
}
