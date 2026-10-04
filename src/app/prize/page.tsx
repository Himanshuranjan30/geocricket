import type { Metadata } from "next";
import Link from "next/link";
import { Page } from "@/components/Page";
import { PrizeClaim } from "@/components/PrizeClaim";
import { PRIZE_INR } from "@/lib/prize";

export const metadata: Metadata = { title: `Win ₹${PRIZE_INR} every day`, description: `Top GeoCricket's daily leaderboard and win ₹${PRIZE_INR} by UPI. Free to play.`, alternates: { canonical: "/prize" } };

export default function Prize() {
  return (
    <Page title={`Win ₹${PRIZE_INR} every day`} eyebrow="Daily leaderboard prize">
      <PrizeClaim />
      <p>Top <Link href="/leaderboard">today&apos;s leaderboard</Link> and win <b className="text-[#F5C000]">₹{PRIZE_INR}</b>, paid by UPI. Free to play, every day.</p>
      <h2>Rules</h2>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted">
        <li>Every day, the player ranked <b className="text-cream">#1 on the leaderboard at midnight IST</b> wins ₹{PRIZE_INR}. The board adds up your points from the day&apos;s five public challenges.</li>
        <li><b className="text-cream">Free to enter.</b> No purchase is needed, and buying anything never changes your score or your chances.</li>
        <li>Open to signed-in players aged 18+, one account per person. Ties follow the leaderboard&apos;s rules.</li>
        <li>The winner gets a notification in the app and claims here with a UPI ID within 30 days. We pay within 48 hours of the claim.</li>
        <li>GeoCricket may withhold a prize for abuse (multiple or fake accounts, automated play) and may change or end this prize by updating this page. Winnings may be subject to applicable taxes.</li>
      </ol>
    </Page>
  );
}
