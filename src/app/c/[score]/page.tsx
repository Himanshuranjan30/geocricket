import type { Metadata } from "next";
import { PlayRedirect } from "./Redirect";

const parse = (s: string) => Math.max(0, Math.min(1000, Number.parseInt(s, 10) || 0));

export async function generateMetadata({ params }: PageProps<"/c/[score]">): Promise<Metadata> {
  const score = parse((await params).score);
  const title = `Can you beat ${score}/1000?`;
  return { title, description: "Five famous cricket moments. Tap where each one happened on the globe. Play today's GeoCricket round.", openGraph: { title } };
}

// Challenge link from a shared result: straight into today's round, with the friend's score to beat.
export default async function Challenge({ params }: PageProps<"/c/[score]">) {
  return <PlayRedirect score={parse((await params).score)} />;
}
