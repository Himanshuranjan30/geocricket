import type { Metadata } from "next";
import { WhoDuel } from "@/components/WhoDuel";

export const metadata: Metadata = { title: "Name Race", description: "You've been challenged to a live Mystery Cricketer race on GeoCricket.", robots: { index: false, follow: true } }; // invite links: not search results

export default async function WhoDuelMatch({ params }: PageProps<"/mystery/duel/[id]">) {
  return <WhoDuel id={(await params).id} />;
}
