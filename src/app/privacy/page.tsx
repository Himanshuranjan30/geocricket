import type { Metadata } from "next";
import { Page } from "@/components/Page";

export const metadata: Metadata = { title: "Privacy", description: "What GeoCricket stores, who processes it, and how to get it deleted.", alternates: { canonical: "/privacy" } };

const EMAIL = "support@geocricket.app";

export default function Privacy() {
  return (
    <Page title="Privacy" eyebrow="Policy · updated 1 October 2026">
      <p>You can play GeoCricket without an account. We keep the data needed to run the game, and we never sell it.</p>

      <h2>What we store</h2>
      <ul className="list-disc pl-5">
        <li><b>Player ID:</b> a random ID in a cookie, so your scores and leaderboard entry belong to you.</li>
        <li><b>Your play:</b> guesses, scores, XP, streak, league standing, duels and cups, and which questions you&apos;ve seen (so you don&apos;t get repeats).</li>
        <li><b>Your profile:</b> leaderboard handle, avatar and country, which other players can see.</li>
        <li><b>Your age confirmation:</b> the date you confirmed you&apos;re 18 or older.</li>
        <li><b>Google sign-in (optional):</b> your Google account&apos;s name, email address and profile picture, used to save your progress across devices. We never see your Google password.</li>
        <li><b>Purchases:</b> which legends you bought, the order and payment IDs and the date. Card and UPI details go straight to our payment provider; we never see or store them.</li>
        <li><b>Notifications (optional):</b> if you turn on reminders, your browser&apos;s push subscription (an address and keys from your browser&apos;s push service) so we can send them.</li>
        <li><b>On your device only:</b> your sound setting and a few display preferences, in your browser&apos;s storage.</li>
      </ul>

      <h2>Who processes it</h2>
      <ul className="list-disc pl-5">
        <li><b>Vercel</b> (hosting) and <b>Neon</b> (database), in Singapore and the US.</li>
        <li><b>Google</b>, for sign-in (only if you use it) and for ads (below).</li>
        <li><b>Dodo Payments</b>, our payment provider and merchant of record, which processes purchases under its own privacy policy.</li>
        <li><b>Google Analytics</b>, to understand how the game is played (pages visited, games played, scores, device and approximate location). See Analytics below.</li>
        <li>Your browser&apos;s push service (for example Google or Apple), only if you turn on reminders.</li>
      </ul>

      <h2>Ads and cookies</h2>
      <p>
        We show ads through Google AdSense to keep the game free. Google and its partners use cookies to serve ads, including ads based on your
        previous visits to this and other websites. You can turn off personalised ads in <a href="https://adssettings.google.com" target="_blank" rel="noopener">Google&apos;s Ad Settings</a>,
        and read <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener">how Google uses information from sites that use its services</a>.
        In the UK, EEA and Switzerland you&apos;ll be asked for consent before personalised ads. We block betting, gambling and real-money gaming ads.
      </p>

      <h2>Analytics</h2>
      <p>
        We use Google Analytics to see which modes people play, where they get stuck and what to improve. It uses cookies and records the pages you
        visit, the games you play and your scores, together with your device, browser and approximate location. Your player is identified to it only
        by a scrambled code, never your name, email or player ID. With Google signals on, Google may combine this with data from your Google account
        if you&apos;ve allowed ads personalisation there. In the UK, EEA and Switzerland, analytics cookies are only set after you consent. You can
        opt out with <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener">Google&apos;s opt-out add-on</a>, and read <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener">how Google uses this data</a>.
      </p>

      <h2>Age</h2>
      <p>GeoCricket is for players aged 18 and over. You confirm your age when you set up your player, and again before any purchase. We don&apos;t knowingly collect data from anyone under 18; if you think a child has used GeoCricket, write to us and we&apos;ll delete their data.</p>

      <h2>How long we keep it</h2>
      <p>Game data stays while your player exists, so your career and leaderboard history make sense. Order records are kept as long as tax and accounting law requires. Push subscriptions are deleted as soon as your browser reports them gone or you turn reminders off.</p>

      <h2>Your rights</h2>
      <p>
        You can ask us to show, correct or delete your data, or to withdraw a consent you gave (for example, notifications). Email <a href={`mailto:${EMAIL}`}>{EMAIL}</a> from
        your Google account&apos;s address, or with your leaderboard handle if you play as a guest. Clearing this site&apos;s cookies drops your guest player ID from your browser.
      </p>

      <h2>Grievance officer</h2>
      <p>
        For any complaint about your data or your purchases, contact our Grievance Officer at <a href={`mailto:${EMAIL}?subject=Grievance`}>{EMAIL}</a> (subject &ldquo;Grievance&rdquo;).
        We acknowledge complaints within 48 hours and resolve them within 30 days.
      </p>
    </Page>
  );
}
