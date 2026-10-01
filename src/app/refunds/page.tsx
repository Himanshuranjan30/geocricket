import type { Metadata } from "next";
import { EmailLink } from "@/components/EmailLink";
import { Page } from "@/components/Page";

export const metadata: Metadata = { title: "Refunds" };

export default function Refunds() {
  return (
    <Page title="Refunds" eyebrow="Policy">
      <p>GeoCricket is free to play. The only thing you can buy is a legend avatar: a one-time purchase (₹49 in India, US$0.99 elsewhere, taxes included) that unlocks that legend on your account forever.</p>
      <h2>Delivery</h2>
      <p>Your legend unlocks instantly after payment and stays on your signed-in account on every device.</p>
      <h2>Refunds</h2>
      <ul className="list-disc pl-5">
        <li>If you were charged but the legend didn&apos;t unlock, or you were charged twice, we&apos;ll unlock it or refund you in full.</li>
        <li>You can request a refund within 7 days of purchase for any reason, as long as you haven&apos;t used the legend in a scored game.</li>
        <li>Refunds go back to your original payment method. Most arrive within 5–10 business days.</li>
      </ul>
      <h2>How to ask</h2>
      <p><EmailLink subject="Refund request">Email us</EmailLink> with the email on your receipt. Payments are processed by our reseller, Dodo Payments, who may also handle your request.</p>
    </Page>
  );
}
