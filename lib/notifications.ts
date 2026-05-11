// Browser Notification API helper.
// Requests permission lazily and shows a notification only when the app
// isn't focused (so we don't double-buzz the user while they're using it).

export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

export function notifyIfBackgrounded(opts: {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  onClick?: () => void;
}) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  // Skip if the tab is focused — they'll see the update inline.
  if (document.visibilityState === "visible" && document.hasFocus()) return;

  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      icon: opts.icon ?? "/icon-192.png",
      tag: opts.tag,
    });
    n.onclick = () => {
      window.focus();
      opts.onClick?.();
      n.close();
    };
  } catch (e) {
    console.warn("[notify] failed:", e);
  }
}
