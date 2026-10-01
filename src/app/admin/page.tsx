import type { Metadata } from "next";
import { Review } from "@/components/Review";

export const metadata: Metadata = { title: "Review queue", robots: { index: false } };

export default function Admin() {
  return (
    <main className="night-sky min-h-screen px-4 py-8">
      <div className="mx-auto flex max-w-[760px] flex-col gap-4"><h1 className="display text-3xl">Review queue</h1><Review /></div>
    </main>
  );
}
