import type { Metadata } from "next";
import { Game } from "@/components/Game";

export const metadata: Metadata = { title: "Match Day" };

export default async function Edition({ params }: PageProps<"/match/[key]">) {
  return <Game mode="edition" editionKey={(await params).key} />;
}
