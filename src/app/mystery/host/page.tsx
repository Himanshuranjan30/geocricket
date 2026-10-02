import type { Metadata } from "next";
import { HostChallenge } from "@/components/HostChallenge";
import { Page } from "@/components/Page";

export const metadata: Metadata = {
  title: "Host a Mystery Cricketer challenge",
  description: "Pick 3–5 cricketers and challenge your friends: they get the clues one by one on the globe, you set the score to beat. Free.",
  alternates: { canonical: "/mystery/host" },
};

export default function HostPage() {
  return <Page title="Host a challenge" eyebrow="Mystery Cricketer"><HostChallenge /></Page>;
}
