import { useSyncExternalStore } from 'react';

/*
 * Install-app support. Browsers fire `beforeinstallprompt` once, often before React has mounted,
 * so the event is captured at module load and exposed through a tiny external store.
 */

let deferredPrompt = null;
let installed = isStandalone();
const listeners = new Set();
let snapshot = computeSnapshot();

function isStandalone() {
  if (typeof window === 'undefined') {
    return false;
  }
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.navigator.standalone === true
  );
}

/** Classify the device so the install dialog can show instructions that match it. */
export function detectPlatform(userAgent = '', maxTouchPoints = 0) {
  const ios =
    /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (ios) {
    // Only Safari can add to the home screen on iOS; other browsers need to hand off to it.
    const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);
    return { family: 'ios', safari: !otherBrowser };
  }
  if (/Android/.test(userAgent)) {
    return { family: 'android', safari: false };
  }
  if (/Firefox\//.test(userAgent)) {
    return { family: 'firefox', safari: false };
  }
  if (/Safari\//.test(userAgent) && !/Chrome|Chromium|Edg\//.test(userAgent)) {
    return { family: 'safari', safari: true };
  }
  return { family: 'desktop', safari: false };
}

function computeSnapshot() {
  return { canPrompt: deferredPrompt !== null, installed };
}

function emit() {
  snapshot = computeSnapshot();
  listeners.forEach((listener) => listener());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installed = true;
    emit();
  });
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => snapshot;

/** Ask the browser to show its native install prompt. Resolves with the user's choice. */
export async function promptInstall() {
  if (!deferredPrompt) {
    return 'unavailable';
  }
  const event = deferredPrompt;
  // A prompt can only be used once.
  deferredPrompt = null;
  emit();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome;
}

/** { canPrompt, installed } - installed is true when running as an installed app. */
export function useInstallState() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Register the service worker in production builds only, so development reloads stay simple. */
export function registerServiceWorker() {
  if (
    !import.meta.env.PROD ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return;
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Installability is a progressive enhancement; the app works without the worker.
    });
  });
}

/** Keep the browser UI color in step with the design token instead of repeating a hex value. */
export function applyThemeColor() {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--color-cocoa').trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && value) {
    meta.setAttribute('content', value);
  }
}
