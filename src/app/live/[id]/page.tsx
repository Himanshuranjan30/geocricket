import type { Metadata } from "next";
import { LiveDuel } from "@/components/LiveDuel";

export const metadata: Metadata = { title: "Live duel", description: "You've been invited to a live 1v1 on GeoCricket.", robots: { index: false, follow: true } }; // shared invite links: not search results

export default async function LiveMatch({ params }: PageProps<"/live/[id]">) {
  return <LiveDuel id={(await params).id} />;
}
