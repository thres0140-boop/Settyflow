import webpush from "web-push";
import { prisma } from "@/lib/prisma";

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:cenk@onlinepersonaltrainer.co";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export async function sendPushToAll(payload: {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  tag?: string;
}) {
  if (!ensureConfigured()) {
    console.warn("[push] VAPID keys missing — skipping notification");
    return;
  }

  const subs = await prisma.pushSubscription.findMany();
  const data = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          data,
        );
        await prisma.pushSubscription.update({
          where: { id: s.id },
          data: { lastUsed: new Date() },
        });
      } catch (err: any) {
        // 410 Gone or 404 → subscription is dead, prune it
        const status = err?.statusCode;
        if (status === 410 || status === 404) {
          console.log(`[push] pruning dead subscription ${s.id}`);
          await prisma.pushSubscription
            .delete({ where: { id: s.id } })
            .catch(() => {});
        } else {
          console.warn(`[push] send failed for ${s.id}:`, err?.body ?? err?.message ?? err);
        }
      }
    }),
  );
}
