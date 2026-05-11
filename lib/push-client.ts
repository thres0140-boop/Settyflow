// Client-side service worker registration + push subscription flow.
// Safe to call on every page load — it's idempotent.

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function registerPush(): Promise<
  "ok" | "unsupported" | "denied" | "no_vapid" | "skipped"
> {
  if (typeof window === "undefined") return "skipped";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }

  // Register the service worker (idempotent)
  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });
    await navigator.serviceWorker.ready;
  } catch (e) {
    console.warn("[push] sw register failed:", e);
    return "unsupported";
  }

  // Permission
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") {
    const result = await Notification.requestPermission();
    if (result !== "granted") return "denied";
  }

  // Fetch VAPID public key
  const keyRes = await fetch("/api/push/vapid-public-key");
  const { key } = (await keyRes.json()) as { key: string | null };
  if (!key) return "no_vapid";

  // Subscribe (or reuse existing)
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // The DOM type wants a stricter ArrayBuffer; the underlying browser API
      // happily accepts any Uint8Array. Cast through to avoid TS noise.
      applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource,
    });
  }

  // Send to server
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });

  return "ok";
}
