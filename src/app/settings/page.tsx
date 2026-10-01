import type { Metadata } from "next";
import { Settings } from "@/components/Settings";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default function SettingsPage() {
  return <Settings />;
}
