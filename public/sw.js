/* Settyflow service worker — handles incoming web push and notification clicks.
   Registered by lib/push-client.ts on first app load (after permission grant). */

self.addEventListener("install", (event) => {
  // Activate immediately so we don't wait for tabs to close
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Settyflow", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Settyflow";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag,
    renotify: true,
    data: { url: data.url || "/inbox" },
  };

  const tasks = [self.registration.showNotification(title, options)];

  // iOS app icon badge — number on the home-screen icon.
  if (typeof data.unreadCount === "number" && self.navigator && self.navigator.setAppBadge) {
    if (data.unreadCount > 0) {
      tasks.push(self.navigator.setAppBadge(data.unreadCount).catch(() => {}));
    } else if (self.navigator.clearAppBadge) {
      tasks.push(self.navigator.clearAppBadge().catch(() => {}));
    }
  }

  event.waitUntil(Promise.all(tasks));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/inbox";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        // If a Settyflow window is already open, focus it and navigate
        if ("focus" in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
