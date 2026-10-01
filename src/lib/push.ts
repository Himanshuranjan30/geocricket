import "server-only";
import { eq } from "drizzle-orm";
import webpush from "web-push";
import { getDb, schema } from "@/db";

// Web push (VAPID). Keys: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (see scripts/set-vapid-keys.sh).
export const pushEnabled = () => !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

export type PushMessage = { title: string; body: string; url?: string; tag?: string };

/** Send to every browser a player subscribed; drop subscriptions the push service reports as gone. */
export async function pushTo(playerId: string, msg: PushMessage) {
  if (!pushEnabled()) return 0;
  webpush.setVapidDetails("mailto:hello@geocricket.app", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const db = await getDb();
  const subs = await db.select().from(schema.pushSubs).where(eq(schema.pushSubs.playerId, playerId));
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 6 * 3600 });
      await db.update(schema.pushSubs).set({ lastSentMs: Date.now() }).where(eq(schema.pushSubs.endpoint, s.endpoint));
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.delete(schema.pushSubs).where(eq(schema.pushSubs.endpoint, s.endpoint));
    }
  }
  return sent;
}
