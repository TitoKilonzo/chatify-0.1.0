let context = null;
let timer = null;

function beep(kind) {
  if (!context) {
    return;
  }
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = kind === 'in' ? 880 : 440;
  gain.gain.value = 0.05;
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.35);
}

/** A repeating tone: higher for an incoming call, lower for the dial tone. Silent if blocked. */
export function startRinging(kind) {
  stopRinging();
  try {
    context = new (window.AudioContext ?? window.webkitAudioContext)();
    beep(kind);
    timer = setInterval(() => beep(kind), 1800);
  } catch {
    context = null;
  }
}

export function stopRinging() {
  clearInterval(timer);
  timer = null;
  context?.close().catch(() => {});
  context = null;
}
