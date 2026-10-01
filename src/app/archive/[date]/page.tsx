import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Game } from "@/components/Game";
import { getRound, isClosed, isLive } from "@/lib/server";

export async function generateMetadata({ params }: PageProps<"/archive/[date]">): Promise<Metadata> {
  return { title: `Round of ${(await params).date}` };
}

// Any finished round by key: a past Daily (YYYY-MM-DD) or an Evening Daily / Test Match / Match Day.
export default async function ArchiveRound({ params }: PageProps<"/archive/[date]">) {
  const { date: key } = await params;
  if (!/^[a-z0-9-]{3,80}$/.test(key)) notFound();
  const round = await getRound(key);
  if (!round) notFound();
  // Not finished yet: send players to the live game (or home, for one that hasn't opened).
  if (!isClosed(round)) {
    redirect(!isLive(round) ? "/" : round.kind === "daily" ? "/play" : round.kind === "match" ? `/match/${key}` : `/test/${key}`);
  }
  return <Game mode="archive" date={key} />;
}
