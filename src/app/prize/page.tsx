import type { Metadata } from "next";
import Link from "next/link";
import { Page } from "@/components/Page";
import { PrizeClaim } from "@/components/PrizeClaim";
import { prizeState } from "@/lib/prize";
import { playerId } from "@/lib/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Win a prize every day", description: "Top GeoCricket's daily leaderboard and win ₹100, or the same in your currency. Free to play, worldwide.", alternates: { canonical: "/prize" } };

export default async function Prize() {
  const p = await prizeState(await playerId());
  return (
    <Page title={`Win ${p.label} every day`} eyebrow="Daily leaderboard prize">
      <PrizeClaim />
      <p>Top <Link href="/leaderboard">today&apos;s leaderboard</Link> and win <b className="text-[#F5C000]">{p.label}</b>. Free to play, every day, from anywhere in the world.</p>
      {!p.signedIn && <Link href="/settings" className="display rounded-2xl bg-ok px-4 py-3 text-center !text-deep !no-underline">Sign in to get on the board →</Link>}
      <h2>Rules</h2>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted">
        <li>Every day, the player ranked <b className="text-cream">#1 on the leaderboard at midnight IST</b> wins <b className="text-cream">₹100</b>, or the same value in their own currency (set by the country on their profile, at that day&apos;s exchange rate). The board adds up your points from the day&apos;s five public challenges.</li>
        <li><b className="text-cream">Free to enter.</b> No purchase is needed, and buying anything never changes your score or your chances.</li>
        <li><b className="text-cream">You must be signed in.</b> Guests don&apos;t appear on the leaderboard and can&apos;t win. Open to players aged 18+, one account per person. Ties follow the leaderboard&apos;s rules.</li>
        <li>The winner gets a notification in the app and claims here within 30 days, choosing <b className="text-cream">UPI</b> (India), <b className="text-cream">PayPal</b> or an <b className="text-cream">Amazon gift card</b>. We pay within 48 hours of the claim.</li>
        <li>GeoCricket may withhold a prize for abuse (multiple or fake accounts, automated play) and may change or end this prize by updating this page. Winnings may be subject to applicable taxes.</li>
      </ol>
      <p className="text-xs text-muted"><a href="https://www.exchangerate-api.com" rel="nofollow noopener">Rates By Exchange Rate API</a></p>
    </Page>
  );
}
