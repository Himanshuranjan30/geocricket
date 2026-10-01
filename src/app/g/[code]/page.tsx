import type { Metadata } from "next";
import { GroupPage } from "@/components/Groups";
import { Page } from "@/components/Page";
import { groupByCode } from "@/lib/groups";

export async function generateMetadata({ params }: PageProps<"/g/[code]">): Promise<Metadata> {
  const g = await groupByCode((await params).code);
  return g ? { title: `Join ${g.name}`, description: `You're invited to "${g.name}" on GeoCricket: daily cricket geography with your own leaderboard.` } : { title: "Group" };
}

export default async function Group({ params }: PageProps<"/g/[code]">) {
  return <Page title="Group" eyebrow="Private leaderboard"><GroupPage code={(await params).code} /></Page>;
}
