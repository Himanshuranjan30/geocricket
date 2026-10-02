import type { Metadata } from "next";
import Link from "next/link";
import { CreatorChallenges } from "@/components/CreatorChallenges";

export const metadata: Metadata = { title: "Creator challenges", robots: { index: false } };

export default function ChallengesAdmin() {
  return (
    <main className="night-sky min-h-screen px-4 py-8">
      <div className="mx-auto flex max-w-[760px] flex-col gap-4">
        <div className="flex items-baseline justify-between"><h1 className="display text-3xl">Creator challenges</h1><Link href="/admin" className="text-sm text-muted underline">Review queue</Link></div>
        <CreatorChallenges />
      </div>
    </main>
  );
}
