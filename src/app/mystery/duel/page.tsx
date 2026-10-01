import type { Metadata } from "next";
import { WhoDuelLobby } from "@/components/WhoDuelLobby";

export const metadata: Metadata = {
  title: "Name Race: Mystery Cricketer 1v1",
  description: "Live cricket quiz duel. Clues land on the globe every few seconds; first to name the cricketer wins the round. First to three.",
  alternates: { canonical: "/mystery/duel" },
};

export default function WhoDuelPage() {
  return <WhoDuelLobby />;
}
