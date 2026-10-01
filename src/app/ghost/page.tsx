import type { Metadata } from "next";
import { GhostStart } from "@/components/GhostStart";

export const metadata: Metadata = { title: "Ghost Race", description: "Race a real player's recorded run on 5 cricket moments you've never played.", robots: { index: false } };

export default function Ghost() {
  return <GhostStart />;
}
