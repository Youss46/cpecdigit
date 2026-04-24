import { Router } from "express";
import webpush from "web-push";
import { db } from "@workspace/db";
import { pushSubscriptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";

const router = Router();

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL ?? "mailto:admin@cpec-u.fr";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
}

// GET /api/push/vapid-public-key — public VAPID key for frontend
router.get("/vapid-public-key", (req, res) => {
  if (!vapidPublicKey) {
    return res.status(503).json({ error: "Push notifications not configured" });
  }
  res.json({ publicKey: vapidPublicKey });
});

// POST /api/push/subscribe — save a push subscription for the current user
router.post("/subscribe", requireRole("student", "teacher", "admin"), async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "Invalid subscription payload" });
    }
    // Upsert: if subscription already exists for this endpoint, update the userId (device reused)
    await db
      .insert(pushSubscriptionsTable)
      .values({ userId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
      .onConflictDoUpdate({
        target: pushSubscriptionsTable.endpoint,
        set: { userId, p256dh: keys.p256dh, auth: keys.auth },
      });
    res.json({ ok: true });
  } catch (err) {
    console.error("push/subscribe error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// DELETE /api/push/unsubscribe — remove a subscription
router.delete("/unsubscribe", requireRole("student", "teacher", "admin"), async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: "endpoint required" });
    await db
      .delete(pushSubscriptionsTable)
      .where(and(eq(pushSubscriptionsTable.userId, userId), eq(pushSubscriptionsTable.endpoint, endpoint)));
    res.json({ ok: true });
  } catch (err) {
    console.error("push/unsubscribe error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;

// ─── Helper: send push notification to a specific user ───────────────────────
export async function sendPushToUser(userId: number, payload: { title: string; body: string; type?: string; url?: string; tag?: string }) {
  if (!vapidPublicKey || !vapidPrivateKey) return;
  try {
    const subscriptions = await db
      .select()
      .from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.userId, userId));

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 } // 24h
        );
      } catch (err: any) {
        // 410 Gone = subscription no longer valid, remove it
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, sub.id));
        } else {
          console.error("webpush send error for sub", sub.id, err?.message ?? err);
        }
      }
    }
  } catch (err) {
    console.error("sendPushToUser error:", err);
  }
}

// ─── Helper: send push notification to multiple users ────────────────────────
export async function sendPushToUsers(userIds: number[], payload: { title: string; body: string; type?: string; url?: string; tag?: string }) {
  await Promise.all(userIds.map(id => sendPushToUser(id, payload)));
}
