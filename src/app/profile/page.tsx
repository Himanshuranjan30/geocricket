import type { Metadata } from "next";
import { Career } from "@/components/Career";

export const metadata: Metadata = { title: "My career", robots: { index: false } };

export default function ProfilePage() {
  return <Career />;
}
