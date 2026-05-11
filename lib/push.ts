// Push notifications wrapper — only does anything when running inside Capacitor (iOS app).
// On the web (PWA) it no-ops; we'll add Web Push later.

export async function initPushNotifications(opts: {
  onToken?: (token: string) => void;
  onNotification?: (n: { title: string; body: string; data?: any }) => void;
}) {
  if (typeof window === "undefined") return;

  // Only attempt to load Capacitor inside a native shell.
  // @ts-ignore — Capacitor is injected by the iOS WebView when wrapped
  const cap = (window as any).Capacitor;
  if (!cap?.isNativePlatform?.()) return;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    const perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") {
      const req = await PushNotifications.requestPermissions();
      if (req.receive !== "granted") return;
    }

    await PushNotifications.register();

    PushNotifications.addListener("registration", (token) => {
      opts.onToken?.(token.value);
      // POST token to your server here so you can target this device:
      // fetch("/api/devices", { method: "POST", body: JSON.stringify({ token: token.value }) })
    });

    PushNotifications.addListener("pushNotificationReceived", (n) => {
      opts.onNotification?.({
        title: n.title ?? "",
        body: n.body ?? "",
        data: n.data,
      });
    });
  } catch (e) {
    console.warn("[push] init failed:", e);
  }
}
