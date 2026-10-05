self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || "Continuum", {
    body: data.message || "You have a check-in.",
    data: { url: data.url || "/dashboard#checkin" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url || "/dashboard#checkin";
  const url = new URL(path, self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    const client = clients.find((item) => new URL(item.url).pathname === url.pathname);
    if (client) { await client.focus(); await client.navigate(url.href); }
    else await self.clients.openWindow(url.href);
  }));
});
