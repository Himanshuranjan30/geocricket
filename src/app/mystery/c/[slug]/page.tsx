import type { Metadata } from "next";
import { WhoGame } from "@/components/WhoGame";
import { whoSet } from "@/lib/who";

const valid = (s: string) => /^[a-z0-9-]{2,30}$/.test(s);

export async function generateMetadata({ params }: PageProps<"/mystery/c/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const set = valid(slug) ? await whoSet(`c:${slug}`) : null;
  if (!set?.challenge) return { title: "Mystery Cricketer challenge", robots: { index: false } };
  const c = set.challenge;
  return {
    title: c.title, robots: { index: false, follow: true }, // creator links: shared, not search results
    description: `@${c.hostHandle}'s Mystery Cricketer challenge: name ${set.puzzles.length} cricketers from clues on the globe. Can you beat the host?`,
    openGraph: { title: `${c.title} · Can you beat @${c.hostHandle}?` },
  };
}

// A creator's hosted challenge (scripts/challenge.mjs). ?host=<key> is the host's own link: it seats them as host.
export default async function CreatorChallenge({ params, searchParams }: PageProps<"/mystery/c/[slug]">) {
  const [{ slug }, { host }] = await Promise.all([params, searchParams]);
  return <WhoGame set={`c:${valid(slug) ? slug : "-"}`} host={typeof host === "string" && /^[\w-]{6,40}$/.test(host) ? host : undefined} />;
}
