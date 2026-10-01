import type { Metadata } from "next";
import { FeedbackInbox } from "@/components/FeedbackInbox";

export const metadata: Metadata = { title: "Feedback inbox", robots: { index: false } };

export default function AdminFeedback() {
  return (
    <main className="night-sky min-h-screen px-4 py-8">
      <div className="mx-auto flex max-w-[760px] flex-col gap-4"><h1 className="display text-3xl">Feedback inbox</h1><FeedbackInbox /></div>
    </main>
  );
}
