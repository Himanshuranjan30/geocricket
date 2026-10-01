import type { Metadata } from "next";
import { Game } from "@/components/Game";

export const metadata: Metadata = { title: "Today's round" };

export default function Play() {
  return <Game mode="daily" />;
}
