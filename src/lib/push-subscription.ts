import { supabase } from '@/integrations/supabase/client';

/**
 * Get the VAPID public key from the server (generates if not exists)
 */
async function getVapidPublicKey(): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('send-push-notification', {
      body: { action: 'get-vapid-key' },
    });
    if (error) throw error;
    return data?.publicKey || null;
  } catch (e) {
    console.warn('Failed to get VAPID key:', e);
    return null;
  }
}

/**
 * Convert base64url string to Uint8Array for applicationServerKey
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Register the custom service worker for push notifications
 */
async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;

  try {
    // Register our custom SW alongside the PWA one
    const registration = await navigator.serviceWorker.register('/sw-custom.js', {
      scope: '/',
    });
    await navigator.serviceWorker.ready;
    return registration;
  } catch (e) {
    console.warn('Push SW registration failed:', e);
    return null;
  }
}

/**
 * Subscribe the browser to push notifications and store in DB
 */
export async function subscribeToPush(userId: string): Promise<boolean> {
  try {
    if (!('PushManager' in window)) {
      console.warn('Push API not supported');
      return false;
    }

    // Request notification permission
    if (Notification.permission === 'denied') return false;
    if (Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return false;
    }

    // Get VAPID key
    const vapidKey = await getVapidPublicKey();
    if (!vapidKey) return false;

    // Get or register SW
    let registration = await registerPushServiceWorker();
    if (!registration) {
      // Fall back to existing SW registration
      registration = await navigator.serviceWorker.ready;
    }

    // Check existing subscription
    const pm = (registration as any).pushManager;
    let subscription = await pm.getSubscription();
    
    if (!subscription) {
      subscription = await pm.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    // Extract keys
    const key = subscription.getKey('p256dh');
    const auth = subscription.getKey('auth');
    if (!key || !auth) return false;

    const p256dh = btoa(String.fromCharCode(...new Uint8Array(key)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const authKey = btoa(String.fromCharCode(...new Uint8Array(auth)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    // Upsert subscription in DB
    await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: p256dh,
        auth: authKey,
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: 'user_id,endpoint' }
    );

    console.log('Push subscription active');
    return true;
  } catch (e) {
    console.warn('Push subscription failed:', e);
    return false;
  }
}

/**
 * Send a push notification to a specific user via the edge function
 */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  tag?: string
): Promise<void> {
  try {
    await supabase.functions.invoke('send-push-notification', {
      body: { action: 'send', user_id: userId, title, body, tag },
    });
  } catch (e) {
    console.warn('Failed to send push:', e);
  }
}

/**
 * Send a push notification to all staff
 */
export async function sendPushToStaff(
  title: string,
  body: string,
  tag?: string
): Promise<void> {
  try {
    await supabase.functions.invoke('send-push-notification', {
      body: { action: 'send-to-staff', title, body, tag },
    });
  } catch (e) {
    console.warn('Failed to send push to staff:', e);
  }
}
