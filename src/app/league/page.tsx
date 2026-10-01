import type { Metadata } from "next";
import { LeagueHome } from "@/components/League";
import { Page } from "@/components/Page";

export const metadata: Metadata = { title: "League", description: "Weekly GeoCricket leagues: earn XP in any mode, finish top of your group and move up a tier." };

export default function League() {
  return <Page title="Your league" eyebrow="This week"><LeagueHome /></Page>;
}
