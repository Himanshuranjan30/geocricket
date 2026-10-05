import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { dodo, dodoEnabled } from "@/lib/dodo";
import { LEGEND_BY_ID } from "@/lib/legends";
import { canWear } from "@/lib/locker";
import { offerFor } from "@/lib/offer";
import { getProfile, playerId, sessionUser } from "@/lib/server";

// Start buying a legend: a Dodo checkout session for the one "legend unlock" product. The legend is granted only by the
// signed payment.succeeded webhook, matched back to this order.
export async function POST(req: Request) {
  if (!dodoEnabled()) return NextResponse.json({ error: "Purchases open soon." }, { status: 503 });
  const pid = await playerId();
  if (!pid || !(await getProfile(pid))) return NextResponse.json({ error: "Create your player profile first." }, { status: 403 });
  if (!(await sessionUser())) return NextResponse.json({ error: "Sign in to buy legends, so they're saved to your account.", signIn: true }, { status: 401 });
  // GeoCricket is 18+: purchases need the account's own confirmation on record (POST /api/me/age).
  const db = await getDb();
  const [age] = await db.select({ ms: schema.players.ageConfirmedMs }).from(schema.players).where(eq(schema.players.id, pid));
  if (!age?.ms) return NextResponse.json({ error: "Legends are for players aged 18 and over.", needAge: true }, { status: 403 });
  const id = String((await req.json().catch(() => null))?.id ?? "");
  const legend = LEGEND_BY_ID.get(id);
  if (!legend) return NextResponse.json({ error: "Unknown legend." }, { status: 404 });
  if (await canWear(pid, id)) return NextResponse.json({ error: "You already have this legend." }, { status: 409 });

  const orderId = crypto.randomUUID();
  const user = await sessionUser();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const offer = await offerFor(pid, true);
  // DataFast revenue attribution: the visitor cookie set by datafa.st's script rides along in the payment's metadata, and
  // Dodo's DataFast webhook reports the sale against that visitor's marketing channel (datafa.st/docs/revenue-attribution-guide).
  const datafast = (await cookies()).get("datafast_visitor_id")?.value;
  let session: Awaited<ReturnType<ReturnType<typeof dodo>["checkoutSessions"]["create"]>>;
  try {
    session = await dodo().checkoutSessions.create({
    ...(offer.eligible && offer.active ? { discount_code: process.env.DODO_FIRST_DISCOUNT_CODE } : {}),
    feature_flags: { allow_discount_code: false }, // the only discount is the server-applied first-purchase offer
    product_cart: [{ product_id: process.env.DODO_LEGEND_PRODUCT_ID!, quantity: 1 }],
    ...(user?.email ? { customer: { email: user.email, name: user.name ?? undefined } } : {}),
    return_url: `${site}/locker?bought=${id}`,
    metadata: { order: orderId, item: `legend:${id}`, ...(datafast ? { datafast_visitor_id: datafast } : {}) },
    });
  } catch (e) {
    // Dodo refused the checkout (e.g. MERCHANT_NOT_LIVE while the live account is still being verified): tell the
    // player plainly instead of failing silently, and keep the free path (levelling up) front and centre.
    const code = (e as { error?: { code?: string } }).error?.code;
    console.error("checkout refused", code ?? e);
    return NextResponse.json({ error: code === "MERCHANT_NOT_LIVE"
      ? `Buying legends opens in a day or two. Until then, level up to unlock ${legend.name} free (level ${legend.level}).`
      : "Checkout is unavailable right now. Please try again in a few minutes.", unavailable: true }, { status: 503 });
  }
  await db.insert(schema.orders).values({ id: orderId, playerId: pid, itemId: `legend:${id}`, amountPaise: 0, paymentId: session.session_id, createdMs: Date.now() });
  return NextResponse.json({ checkoutUrl: session.checkout_url, mode: process.env.DODO_ENV === "live" ? "live" : "test" });
}
