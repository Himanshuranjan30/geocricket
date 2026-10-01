import type { Metadata } from "next";
import { Locker } from "@/components/Locker";

export const metadata: Metadata = { title: "Legends Locker", description: "Play as cricket's greatest: unlock animated legends by levelling up, or get them instantly." };

export default function LockerPage() {
  return <Locker />;
}
