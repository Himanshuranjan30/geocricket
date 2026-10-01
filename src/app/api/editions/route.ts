import { NextResponse } from "next/server";
import { editions } from "@/lib/server";

export const dynamic = "force-dynamic";

// Match Day and weekend Test Match editions that are open now or coming up.
export async function GET() {
  return NextResponse.json({ editions: await editions() });
}
