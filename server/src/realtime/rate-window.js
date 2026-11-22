/** Sliding-window limiter for one socket. allow() records a hit and reports whether it fits. */
export function createRateWindow({ max, windowMs, now = () => Date.now() }) {
  const hits = [];
  return {
    allow() {
      const current = now();
      while (hits.length > 0 && current - hits[0] >= windowMs) {
        hits.shift();
      }
      if (hits.length >= max) {
        return false;
      }
      hits.push(current);
      return true;
    },
  };
}
