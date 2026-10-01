import type { Metadata } from "next";
import { CupPage } from "@/components/CupPage";

export const metadata: Metadata = { title: "Cup", description: "A live GeoCricket knockout cup. Join, check in, and play your way to the trophy.", robots: { index: false, follow: true } }; // shared invite links: not search results

export default async function Cup({ params }: PageProps<"/cup/[code]">) {
  return <CupPage code={(await params).code} />;
}
