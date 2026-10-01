import type { Metadata } from "next";
import { WhoGame } from "@/components/WhoGame";

export const metadata: Metadata = {
  title: "Mystery Cricketer",
  description: "Guess the cricketer: three a day. Clues land on the globe one at a time: the ground, the match, the numbers, the career trail. Name them in as few clues as you can.",
  alternates: { canonical: "/mystery" },
};

export default async function WhoPage({ searchParams }: PageProps<"/mystery">) {
  const { date: d, vs: v } = await searchParams;
  const date = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined;
  const vs = typeof v === "string" && /^[a-f0-9]{10}$/.test(v) ? v : undefined;
  return <WhoGame date={date} vs={vs} />;
}
