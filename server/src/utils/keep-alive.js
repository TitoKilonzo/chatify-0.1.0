const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Periodically request the service's own public health URL. Hosts that put idle free instances to
 * sleep count requests that arrive through the public URL, so this keeps one instance awake.
 * It is a stop-gap: a paid instance is the reliable fix. Returns a stop function.
 */
export function startKeepAlive({
  url,
  logger,
  intervalMs = DEFAULT_INTERVAL_MS,
  fetchImpl = fetch,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
}) {
  const target = new URL('/api/health', url).toString();

  async function ping() {
    try {
      const response = await fetchImpl(target, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) {
        logger.warn({ status: response.status }, 'keep-alive ping returned an error status');
      }
    } catch (err) {
      logger.warn({ err }, 'keep-alive ping failed');
    }
  }

  const timer = setIntervalImpl(ping, intervalMs);
  timer.unref?.();
  return () => clearIntervalImpl(timer);
}
