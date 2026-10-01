import type { Metadata } from "next";
import { DuelIntro } from "@/components/DuelIntro";

export const metadata: Metadata = { title: "You've been challenged", description: "Same 5 cricket moments. Beat your friend's score.", robots: { index: false, follow: true } }; // shared invite links: not search results

export default async function Duel({ params }: PageProps<"/duel/[id]">) {
  return <DuelIntro id={(await params).id} />;
}
