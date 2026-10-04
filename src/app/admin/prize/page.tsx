import type { Metadata } from "next";
import { PrizeAdmin } from "@/components/PrizeAdmin";

export const metadata: Metadata = { title: "Prize payouts", robots: { index: false } };

export default function AdminPrize() {
  return (
    <main className="night-sky min-h-screen px-4 py-8">
      <div className="mx-auto flex max-w-[760px] flex-col gap-4"><h1 className="display text-3xl">Prize payouts</h1><PrizeAdmin /></div>
    </main>
  );
}
