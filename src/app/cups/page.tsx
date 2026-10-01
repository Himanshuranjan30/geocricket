import type { Metadata } from "next";
import { CupsHome } from "@/components/CupsHome";

export const metadata: Metadata = { title: "Cups", description: "Knockout cricket-geography tournaments. Host a cup, invite friends, lift the trophy." };

export default function Cups() {
  return <CupsHome />;
}
