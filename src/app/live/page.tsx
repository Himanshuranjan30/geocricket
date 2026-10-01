import type { Metadata } from "next";
import { LiveLobby } from "@/components/LiveLobby";

export const metadata: Metadata = { title: "Live 1v1", description: "Cricket geography duels, live. Same question, same moment." };

export default function Live() {
  return <LiveLobby />;
}
