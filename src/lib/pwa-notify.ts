import { playNotificationSound } from './notification-sound';
import { setAppBadge } from './pwa-badge';

/**
 * Vibrate the device with a notification pattern
 */
export function vibrateDevice() {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
  } catch { /* silent */ }
}

/**
 * Show a notification using Service Worker (works in background/locked screen)
 * Falls back to regular Notification API if SW is not available
 */
export async function showPushNotification(
  title: string,
  body: string,
  options?: {
    tag?: string;
    icon?: string;
    badge?: string;
    data?: any;
    requireInteraction?: boolean;
  }
) {
  const tag = options?.tag || `portalguard-${Date.now()}`;
  const icon = options?.icon || '/pwa-icon-192.png';
  const badge = options?.badge || '/pwa-icon-192.png';

  // Try Service Worker notification first (works in background)
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body,
        icon,
        badge,
        tag,
        vibrate: [200, 100, 200],
        data: options?.data,
      } as NotificationOptions);
      return;
    } catch {
      // Fall through to regular Notification
    }
  }

  // Fallback: regular Notification API
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon, badge, tag });
    } catch { /* silent */ }
  }
}

/**
 * Full notification alert: sound + vibration + push notification + badge update
 * This is the main function to call when a new event arrives
 */
export function notifyResident(
  title: string,
  body: string,
  options?: {
    tag?: string;
    totalBadge?: number;
    requireInteraction?: boolean;
  }
) {
  playNotificationSound();
  vibrateDevice();
  showPushNotification(title, body, {
    tag: options?.tag,
    requireInteraction: options?.requireInteraction,
  });
  if (options?.totalBadge !== undefined) {
    setAppBadge(options.totalBadge);
  }
}

/**
 * Request notification permission proactively with a user gesture
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}
