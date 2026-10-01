import type { Metadata } from "next";
import { FeedbackForm } from "@/components/FeedbackForm";
import { Page } from "@/components/Page";

export const metadata: Metadata = { title: "Feedback & bug reports", description: "Report a bug or suggest an idea for GeoCricket.", alternates: { canonical: "/feedback" }, robots: { index: false } };

export default async function Feedback({ searchParams }: { searchParams: Promise<{ from?: string; kind?: string }> }) {
  const { from, kind } = await searchParams;
  return (
    <Page title="Tell us" eyebrow="Feedback">
      <p>Found a bug, spotted a wrong answer, or have an idea? Send it here. We go through every message daily.</p>
      <FeedbackForm from={from ?? null} initialKind={kind ?? null} />
    </Page>
  );
}
