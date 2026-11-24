import { api } from './api.js';

/*
 * Browser push subscription helpers. Push needs a service worker, the Push API, and the user's
 * permission. On iOS it only works for an installed home-screen app, which the support check
 * reflects because PushManager is absent in a plain Safari tab there.
 */

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function keyToBytes(base64Url) {
  const padded = base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.ready;
}

/** Whether this browser currently has a subscription. */
export async function currentSubscription() {
  if (!pushSupported()) {
    return null;
  }
  return (await registration()).pushManager.getSubscription();
}

export async function enablePush() {
  const { enabled, publicKey } = await api.get('/push/key');
  if (!enabled) {
    throw new Error('Notifications are not set up on this server.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      'Notifications are blocked. Allow them in your browser settings to turn this on.',
    );
  }
  const reg = await registration();
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyToBytes(publicKey),
    }));
  await api.post('/push/subscriptions', subscription.toJSON());
  return subscription;
}

export async function disablePush() {
  const subscription = await currentSubscription();
  if (!subscription) {
    return;
  }
  await api.delete('/push/subscriptions', { endpoint: subscription.endpoint }).catch(() => {});
  await subscription.unsubscribe();
}

export async function pushServerEnabled() {
  const { enabled } = await api.get('/push/key');
  return enabled;
}
