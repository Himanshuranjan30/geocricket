import type { Metadata } from "next";
import { EmailLink } from "@/components/EmailLink";
import { Page } from "@/components/Page";

export const metadata: Metadata = { title: "Terms" };

export default function Terms() {
  return (
    <Page title="Terms of use" eyebrow="Policy">
      <p>By playing GeoCricket at geocricket.app you agree to these terms.</p>
      <h2>The game</h2>
      <p>GeoCricket is a free daily cricket geography game. You can play as a guest or sign in with Google to save your progress and appear on leaderboards.</p>
      <h2>Fair play</h2>
      <p>Don&apos;t use bots, scripts or other ways to cheat. We may hide suspicious scores from leaderboards or remove accounts that break these rules.</p>
      <h2>Purchases</h2>
      <p>Legend avatars are optional cosmetic items sold as one-time digital purchases through Dodo Payments, our merchant of record. They don&apos;t change how the game is scored. See our <a href="/refunds">refund policy</a>.</p>
      <h2>Your content</h2>
      <p>Keep your handle respectful. We may change handles that are offensive or impersonate others.</p>
      <h2>Changes and contact</h2>
      <p>We may update the game and these terms. Questions? <EmailLink subject="GeoCricket question">Email us</EmailLink>.</p>
    </Page>
  );
}
