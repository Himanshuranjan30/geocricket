import type { Metadata } from "next";
import { Game } from "@/components/Game";

export const metadata: Metadata = { title: "Nets", description: "Unlimited practice rounds. Earn XP, level up and unlock new kits." };

export default function Nets() {
  return <Game mode="practice" />;
}
