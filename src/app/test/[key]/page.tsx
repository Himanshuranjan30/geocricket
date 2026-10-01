import type { Metadata } from "next";
import { Game } from "@/components/Game";

export const metadata: Metadata = { title: "Today's games" }; // morning/evening Test Match and the evening Daily

export default async function Edition({ params }: PageProps<"/test/[key]">) {
  return <Game mode="edition" editionKey={(await params).key} />;
}
