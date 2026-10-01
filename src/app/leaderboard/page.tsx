import type { Metadata } from "next";
import { plural } from "@/lib/game";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Boards } from "@/components/Boards";
import { Page } from "@/components/Page";
import { istDate, periodRange, shiftPeriod, type Period } from "@/lib/game";
import { countryName } from "@/lib/profile";
import { leaderboard, playerId } from "@/lib/server";
import { Flag } from "@/components/Flag";
import { Rank } from "@/components/Rank";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leaderboards", description: "GeoCricket Ranking plus points, accuracy, streak, effort and head-to-head boards, by player and country.", alternates: { canonical: "/leaderboard" } };

const PERIODS: { id: Period; label: string }[] = [{ id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }];
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });

function title(period: Period, date: string, today: string) {
  const [start, end] = periodRange(date, period);
  const current = today >= start && today <= end;
  if (period === "day") return current ? "Today's leaderboard" : `Leaderboard · ${fmt(date, { day: "numeric", month: "long" })}`;
  if (period === "week") return current ? "This week" : `Week of ${fmt(start, { day: "numeric", month: "short" })} – ${fmt(end, { day: "numeric", month: "short" })}`;
  return current ? "This month" : fmt(start, { month: "long", year: "numeric" });
}

export default async function Leaderboard({ searchParams }: PageProps<"/leaderboard">) {
  const today = istDate();
  const sp = await searchParams;
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const view = sp.view === "countries" ? "countries" : "players";
  const period: Period = sp.period === "week" || sp.period === "month" ? sp.period : "day";
  const lb = await leaderboard(date, await playerId(), period);
  const [, end] = periodRange(date, period);
  const href = (o: { view?: string; period?: Period; date?: string }) => {
    const q = new URLSearchParams({ view: o.view ?? view, period: o.period ?? period });
    const d = o.date ?? date;
    if (d !== today) q.set("date", d);
    return `/leaderboard?${q}`;
  };
  const multiDay = period !== "day";

  return (
    <Page title="Leaderboards" eyebrow="GeoCricket Ranking · points · accuracy · streak · effort · head-to-head">
      <Boards full />
      <p className="text-sm text-muted">
        The <b className="text-cream">GeoCricket Ranking</b> is the headline number: how much of the maximum you score in every scored game (Tests
        count double, recent games count most, half-life 14 days), scaled by consistency (play on 10 of the last 14 days to keep the full number).
        Under 5 games it&apos;s provisional. Only fair play counts: a flagged game sits a player out of every board for 30 days.
      </p>
      <h2>{title(period, date, today)} · Daily Challenge</h2>
      <p className="-mt-2 text-sm text-muted">{plural(lb.count, "player")} · {lb.countries.length} {lb.countries.length === 1 ? "country" : "countries"} · average {lb.avg}. Browse any past day, week or month.</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Tabs items={PERIODS.map((p) => ({ key: p.id, label: p.label, href: href({ period: p.id, date: today }), on: period === p.id }))} />
          <Tabs items={[
            { key: "players", label: "Players", href: href({ view: "players" }), on: view === "players" },
            { key: "countries", label: "Countries", href: href({ view: "countries" }), on: view === "countries" },
          ]} />
        </div>
        <div className="flex gap-3 text-sm">
          <Link href={href({ date: shiftPeriod(date, period, -1) })}>← Previous</Link>
          {end < today && <Link href={href({ date: shiftPeriod(date, period, 1) > today ? today : shiftPeriod(date, period, 1) })}>Next →</Link>}
        </div>
      </div>

      {view === "players" ? (
        <>
          {lb.me && !lb.top.some((r) => r.me) && <PlayerRow r={lb.me} multiDay={multiDay} />}
          {lb.top.length === 0 ? <p className="text-muted">No scores yet. <Link href="/">Be the first.</Link></p> : (
            <ol className="flex flex-col gap-1.5">{lb.top.map((r) => <PlayerRow key={r.rank} r={r} multiDay={multiDay} />)}</ol>
          )}
          <p className="text-sm text-muted">
            {multiDay ? "Weekly and monthly boards add up every daily score in the period, so playing every day counts. " : ""}
            Ties go to whoever finished first, then to the closer total distance.
          </p>
        </>
      ) : (
        <>
          {lb.countries.length === 0 ? <p className="text-muted">No scores yet. <Link href="/">Put your country on the board.</Link></p> : (
            <ol className="flex flex-col gap-1.5">
              {lb.countries.map((c) => {
                const mine = lb.me?.country === c.country;
                return (
                  <li key={c.country} className={`grid grid-cols-[44px_1fr_auto] items-center gap-3 rounded-2xl border px-4 py-2.5 ${mine ? "border-ok/60 bg-white/15" : "border-white/10 bg-white/5"}`}>
                    <span className="text-lg"><Rank n={c.rank} /></span>
                    <span className="flex min-w-0 items-center gap-2.5"><Flag code={c.country} size={20} /><span className="truncate">{countryName(c.country)}{mine ? " (you)" : ""}</span></span>
                    <span className="text-right"><b className="display text-xl">{c.avg}</b> <span className="text-xs text-muted">avg · {c.players} player{c.players > 1 ? "s" : ""}</span></span>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="text-sm text-muted">Countries rank by the average {multiDay ? "total " : ""}score of their players{multiDay ? " over the period" : ""}.</p>
        </>
      )}
    </Page>
  );
}

function Tabs({ items }: { items: { key: string; label: string; href: string; on: boolean }[] }) {
  return (
    <div className="flex rounded-full border border-white/15 bg-white/5 p-1" role="tablist">
      {items.map((t) => (
        <Link key={t.key} href={t.href} role="tab" aria-selected={t.on}
          className={`display rounded-full px-4 py-1.5 text-sm !no-underline ${t.on ? "bg-white !text-deep" : "!text-muted hover:!text-white"}`}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}

function PlayerRow({ r, multiDay }: { r: { rank: number; handle: string; avatar: string; country: string | null; total: number; km: number; days: number; me: boolean }; multiDay: boolean }) {
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
        <span className="text-xs text-muted">{multiDay ? `${r.days} day${r.days > 1 ? "s" : ""}` : `${r.km.toLocaleString("en-IN")} km`}</span>
      </span>
    </li>
  );
}
