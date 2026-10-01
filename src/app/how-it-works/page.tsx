import type { Metadata } from "next";
import Link from "next/link";
import { Page } from "@/components/Page";
import { TIERS } from "@/lib/game";

export const metadata: Metadata = {
  title: "How to play GeoCricket, the daily cricket geography game",
  description: "Rules, scoring, the 4 daily games, Test Match stakes, live 1v1 duels and knockout cups. GeoCricket is a free daily cricket quiz: like Wordle and GeoGuessr, for cricket.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorks() {
  return (
    <Page title="How to play" eyebrow="Rules">
      <p className="text-lg text-cream">
        GeoCricket is a daily cricket geography game. Each question is a real cricket moment (a famous innings, a five-wicket haul, a final) and you
        answer by spinning the globe and tapping where it happened. The closer your pin, the more you score.
      </p>

      <h2>Four games a day</h2>
      <p>
        The 5-ball <b>Daily Challenge</b> is open all day from midnight IST. The 10-ball <b>Morning Test Match</b> drops at 8 AM, the
        <b> Evening Daily</b> at 6 PM and the <b>Evening Test Match</b> at 8 PM IST, and every game closes at midnight IST. Times show in your
        own time zone, and everyone plays the same questions.
      </p>

      <h2>Scoring</h2>
      <p>Each ball is worth up to 100 points. A pin within 5 km scores the full 100; after that points fall away with distance, so the right country isn&apos;t enough, aim for the right city.</p>
      <p>Later balls carry multipliers (the Daily goes ×1, ×1, ×2, ×3, ×3, so a perfect Daily is 1,000).</p>
      <ul className="flex flex-col gap-1">
        {TIERS.map((t) => <li key={t.min}>{t.emoji} <b>{t.min === 100 ? "100" : t.min === 0 ? "0" : `${t.min}+`}</b> · {t.toast}</li>)}
      </ul>

      <h2>Test Match stakes</h2>
      <p>Test Matches are higher stakes: a good ball (20+ points) earns <b>double XP</b>, a poor one costs 20 XP. You never drop below the start of your level, so you can&apos;t lose a level or an unlocked legend.</p>

      <h2>Leaderboards and streaks</h2>
      <p>Your first attempt counts. The higher score ranks first; on a tie, whoever finished first. Finish any game on consecutive days to build a streak. One missed day a week is covered by a freeze automatically, and if you miss another you can save it the next day by watching a short ad (once a week).</p>

      <h2>Any time of day</h2>
      <p>
        Between games there&apos;s always something that counts. A <Link href="/ghost">Ghost Race</Link> puts you head to head with a real player&apos;s run
        on 5 balls you&apos;ve never played. The <Link href="/archive">archive</Link> has every finished game, and shows where you&apos;d have ranked against
        everyone who played it live. Every ball earns XP for your weekly <Link href="/league">league</Link>: finish near the top of your group of 30 and you move up a tier
        on Monday (Nets and archive balls count half).
      </p>

      <h2>Live 1v1 and Cups</h2>
      <p>
        In a <Link href="/live">live 1v1</Link> you and a rival get the same ball at the same moment. Each guess scores up to 5,000 points and the gap is
        damage off the loser&apos;s 6,000 HP, with bigger multipliers in later rounds. <Link href="/cups">Cups</Link> are knockout tournaments of 4 to 32 players built from live 1v1s:
        host one, share the invite link, and the last player standing lifts the trophy. There&apos;s an official Daily Cup every night at 9:30 PM IST.
      </p>

      <h2>Practice</h2>
      <p>The <Link href="/nets">Nets</Link> give you unlimited practice balls that never repeat. Browse every moment by <Link href="/grounds">ground</Link>, <Link href="/players">player</Link> or <Link href="/moments">year</Link>.</p>

      <h2>Questions people ask</h2>
      <h3 className="font-semibold text-cream">Is GeoCricket free?</h3>
      <p>Yes. Every game mode is free. Optional legend characters can be unlocked by levelling up or bought.</p>
      <h3 className="font-semibold text-cream">Is it like Wordle for cricket?</h3>
      <p>Yes: new puzzles every day, the same for everyone, and a result you can share. Instead of guessing a word you guess a place, like GeoGuessr.</p>
      <h3 className="font-semibold text-cream">Where do the questions come from?</h3>
      <p>Hand-written moments plus facts drawn from ball-by-ball match data (Cricsheet), with every venue cross-checked against Wikipedia, Wikidata and OpenStreetMap.</p>
      <h3 className="font-semibold text-cream">Do I need an account?</h3>
      <p>No. You can play as a guest; sign in with Google to save your streak, XP and leaderboard spot across devices.</p>

      <h2>Controls</h2>
      <p>Drag to spin the globe. Pinch, scroll or use + and − to zoom (cricket cities and streets appear as you zoom in). Tap to place your pin, then press <b>Guess</b> or Enter.</p>
    </Page>
  );
}
