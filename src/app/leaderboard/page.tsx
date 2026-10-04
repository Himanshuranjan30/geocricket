import type { Metadata } from "next";
import { plural } from "@/lib/game";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Page } from "@/components/Page";
import { addDays, istDate } from "@/lib/game";
import { leaderboard, playerId } from "@/lib/server";
import { Flag } from "@/components/Flag";
import { Rank } from "@/components/Rank";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leaderboard", description: "Today's GeoCricket leaderboard: everyone's points from all of the day's challenges.", alternates: { canonical: "/leaderboard" } };

const fmt = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

export default async function Leaderboard({ searchParams }: PageProps<"/leaderboard">) {
  const today = istDate();
  const sp = await searchParams;
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const lb = await leaderboard(date, await playerId());
  const href = (d: string) => (d === today ? "/leaderboard" : `/leaderboard?date=${d}`);

  return (
    <Page title={date === today ? "Today's leaderboard" : `Leaderboard · ${fmt(date)}`} eyebrow="One board · every public challenge of the day">
      <p className="text-sm text-muted">
        Everyone plays the same challenges each day: the <b className="text-cream">Daily</b>, the <b className="text-cream">Morning Test</b>, the{" "}
        <b className="text-cream">Evening Daily</b>, the <b className="text-cream">Evening Test</b> and <b className="text-cream">Mystery Cricketer</b>.
        Your points from all of them add up here. The board resets at midnight (IST).
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{plural(lb.count, "player")} · average {lb.avg.toLocaleString("en-IN")}</p>
        <div className="flex gap-3 text-sm">
          <Link href={href(addDays(date, -1))}>← Previous day</Link>
          {date < today && <Link href={href(addDays(date, 1))}>Next day →</Link>}
        </div>
      </div>
      {lb.me && !lb.top.some((r) => r.me) && <PlayerRow r={lb.me} />}
      {lb.top.length === 0 ? <p className="text-muted">No scores yet. <Link href="/">Be the first.</Link></p> : (
        <ol className="flex flex-col gap-1.5">{lb.top.map((r) => <PlayerRow key={r.rank} r={r} />)}</ol>
      )}
      <p className="text-sm text-muted">
        Signed-in players only (guests see where they would be). 1v1s, cups, Nets and private group games don&apos;t count, and replaying a
        past day doesn&apos;t change its board. Ties go to whoever finished first, then to the closer total distance.
      </p>
    </Page>
  );
}

function PlayerRow({ r }: { r: { rank: number; handle: string; avatar: string; country: string | null; total: number; km: number; me: boolean } }) {
  return (
    <li className={`grid grid-cols-[44px_1fr_auto] items-center gap-3 rounded-2xl border px-4 py-2.5 ${r.me ? "border-ok/60 bg-white/15" : "border-white/10 bg-white/5"}`}>
      <span className="text-lg"><Rank n={r.rank} /></span>
      <span className="flex min-w-0 items-center gap-2">
        <Avatar code={r.avatar} size={32} />
        <span className="truncate font-medium">@{r.handle}{r.me ? " (you)" : ""}</span>
        <Flag code={r.country} />
      </span>
      <span className="text-right">
        <b className="display text-xl">{r.total.toLocaleString("en-IN")}</b>{" "}
        <span className="text-xs text-muted">pts</span>
      </span>
    </li>
  );
}
