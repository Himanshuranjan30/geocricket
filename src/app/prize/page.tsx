import type { Metadata } from "next";
import Link from "next/link";
import { Page } from "@/components/Page";
import { PrizeClaim } from "@/components/PrizeClaim";
import { prizeState } from "@/lib/prize";
import { playerId } from "@/lib/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Win ₹100 Every Day Playing a Free Cricket Game",
  description: "Play GeoCricket free, top the daily leaderboard and win ₹100 (or the same in your currency) every day. No deposit, no betting: just cricket knowledge. Open worldwide.",
  alternates: { canonical: "/prize" },
  openGraph: { title: "Win ₹100 every day playing a free cricket game", description: "Top GeoCricket's daily leaderboard, win ₹100. No deposit, no betting.", url: "/prize" },
};

// Search answers for the prize page (also emitted as FAQPage structured data).
const FAQ = [
  ["How do I win money playing GeoCricket?", "Play the day's five free challenges (Daily, Morning Test, Evening Daily, Evening Test and Mystery Cricketer). Your points add up on one leaderboard, and whoever is #1 at midnight IST wins ₹100."],
  ["Is it really free? Is this betting?", "Yes, it's free and it isn't betting. There's no deposit, no entry fee and no stake: the prize is paid by GeoCricket, and buying anything never changes your score or your chances."],
  ["Can I play and win from outside India?", "Yes. Players anywhere can win. Outside India the prize is paid as the same value in your own currency, by PayPal or an Amazon gift card."],
  ["How is the prize paid?", "The winner gets a notification and claims on this page with a UPI ID (India), a PayPal email or an Amazon gift card email. We pay within 48 hours of the claim."],
  ["Do I need an account?", "Yes. You must sign in with Google to appear on the leaderboard and to win. Guests can play for fun but aren't ranked."],
  ["What kind of game is GeoCricket?", "A free daily cricket geography game: you read about a famous cricket moment and pin where it happened on a 3D globe. The closer you are, the more points you score."],
] as const;

export default async function Prize() {
  const p = await prizeState(await playerId());
  return (
    <Page title={`Win ${p.label} every day`} eyebrow="Free cricket game · daily cash prize">
      <PrizeClaim />
      <p>Top <Link href="/leaderboard">today&apos;s leaderboard</Link> and win <b className="text-[#F5C000]">{p.label}</b>. Free to play, every day, from anywhere in the world.</p>
      {!p.signedIn && <Link href="/settings" className="display rounded-2xl bg-ok px-4 py-3 text-center !text-deep !no-underline">Sign in to get on the board →</Link>}
      <h2>How it works</h2>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5">
        <li><Link href="/">Play today&apos;s free challenges</Link>: pin famous cricket moments on a 3D globe.</li>
        <li>Your points from all five challenges add up on <Link href="/leaderboard">one leaderboard</Link>.</li>
        <li>#1 at midnight IST wins {p.label}. New day, new chance, every day.</li>
      </ol>
      <h2>Rules</h2>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted">
        <li>Every day, the player ranked <b className="text-cream">#1 on the leaderboard at midnight IST</b> wins <b className="text-cream">₹100</b>, or the same value in their own currency (set by the country on their profile, at that day&apos;s exchange rate). The board adds up your points from the day&apos;s five public challenges.</li>
        <li><b className="text-cream">Free to enter.</b> No purchase is needed, and buying anything never changes your score or your chances.</li>
        <li><b className="text-cream">You must be signed in.</b> Guests don&apos;t appear on the leaderboard and can&apos;t win. Open to players aged 18+, one account per person. Ties follow the leaderboard&apos;s rules.</li>
        <li>The winner gets a notification in the app and claims here within 30 days, choosing <b className="text-cream">UPI</b> (India), <b className="text-cream">PayPal</b> or an <b className="text-cream">Amazon gift card</b>. We pay within 48 hours of the claim.</li>
        <li>GeoCricket may withhold a prize for abuse (multiple or fake accounts, automated play) and may change or end this prize by updating this page. Winnings may be subject to applicable taxes.</li>
      </ol>
      <h2>FAQ</h2>
      <dl className="flex flex-col gap-3">
        {FAQ.map(([q, a]) => <div key={q}><dt className="font-semibold text-cream">{q}</dt><dd className="text-sm text-muted">{a}</dd></div>)}
      </dl>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }).replace(/</g, "\\u003c") }} />
      <p className="text-xs text-muted"><a href="https://www.exchangerate-api.com" rel="nofollow noopener">Rates By Exchange Rate API</a></p>
    </Page>
  );
}
