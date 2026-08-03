// Custom Service Worker for Push Notifications
// This runs independently of the app - handles push even when app is closed

self.addEventListener('push', (event) => {
  let data = { title: 'Portal do Morador', body: 'Nova notificação' };
  
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || '',
    icon: '/pwa-icon-192.png',
    badge: '/pwa-icon-192.png',
    tag: data.tag || `portalguard-${Date.now()}`,
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: true,
    data: data.data || {},
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'close', title: 'Fechar' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Portal do Morador', options).then(() => {
      // Update app icon badge counter
      if (self.navigator && self.navigator.setAppBadge) {
        return self.registration.getNotifications().then((notifications) => {
          self.navigator.setAppBadge(notifications.length);
        });
      }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Update badge on click (decrement)
  if (self.navigator && self.navigator.setAppBadge) {
    self.registration.getNotifications().then((notifications) => {
      if (notifications.length > 0) {
        self.navigator.setAppBadge(notifications.length);
      } else {
        self.navigator.clearAppBadge();
      }
    });
  }

  if (event.action === 'close') return;

  // Open or focus the app
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to focus an existing window
      for (const client of clientList) {
        if (client.url.includes('/morador') && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window
      return self.clients.openWindow('/morador');
    })
  );
});

// Keep SW alive for push
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
