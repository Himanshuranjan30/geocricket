import type { Metadata } from "next";
import { GroupsHome } from "@/components/Groups";
import { Page } from "@/components/Page";

export const metadata: Metadata = { title: "Groups", description: "Private GeoCricket leaderboards for your WhatsApp group, office or college." };

export default function Groups() {
  return <Page title="Groups" eyebrow="Play with your people"><GroupsHome /></Page>;
}
