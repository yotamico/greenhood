self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", function (event) {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "GreenHOOD", {
      body: data.body || "הודעה חדשה",
      icon: "/icon-192.svg",
      badge: "/icon-192.svg",
      data: { url: data.url || "/" },
      dir: "rtl",
      lang: "he",
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow(event.notification.data?.url || "/");
    })
  );
});
