import type { Metadata } from "next";
import { plural } from "@/lib/game";
import Link from "next/link";
import { Page } from "@/components/Page";
import { pastRounds } from "@/lib/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Archive", description: "Play every past GeoCricket round and see where you'd have finished." };

const label = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const KIND: Record<string, string> = { daily: "Daily", evening: "Evening Daily", match: "Match Day" };
const name = (r: { key: string; kind: string; title: string | null; number: number | null }) =>
  r.kind === "daily" ? `No. ${r.number} · Daily` : r.kind === "test" ? (r.key.startsWith("test-am-") ? "Morning Test Match" : "Evening Test Match") : r.kind === "match" ? (r.title ?? "Match Day") : KIND[r.kind] ?? r.title ?? r.key;

export default async function Archive() {
  const rounds = await pastRounds();
  return (
    <Page title="Past rounds" eyebrow="Archive">
      <p>Replay any finished game and see where you&apos;d have ranked against everyone who played it live. Each ball earns XP the first time you play it. Archive plays don&apos;t change the leaderboards or your streak.</p>
      {rounds.length === 0 ? (
        <p className="text-muted">No past rounds yet. Come back tomorrow.</p>
      ) : (
        <ul className="flex flex-col gap-2 !no-underline">
          {rounds.map((r) => (
            <li key={r.key}>
              <Link href={`/archive/${r.key}`} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3 !text-cream !no-underline hover:bg-panel-2">
                <span className="min-w-0">
                  <span className="display block truncate text-lg font-bold">{name(r)}</span>
                  <span className="text-xs text-muted">{r.balls} balls{r.players ? ` · ${plural(r.players, "player")} played live` : ""}</span>
                </span>
                <span className="shrink-0 text-muted">{r.day ? label(r.day) : ""} →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
