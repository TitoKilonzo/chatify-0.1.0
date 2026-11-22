/**
 * Log one line per finished request. Only method, path (no query string), status, and duration are
 * recorded: never headers, cookies, or bodies.
 */
export function createRequestLogger(logger) {
  return function requestLogger(req, res, next) {
    const start = process.hrtime.bigint();
    // originalUrl keeps the full mount path; the query string is dropped on purpose.
    const path = req.originalUrl.split('?')[0];
    res.on('finish', () => {
      const durationMs = Math.round(Number(process.hrtime.bigint() - start) / 1e5) / 10;
      logger.info({ method: req.method, path, status: res.statusCode, durationMs }, 'request');
    });
    next();
  };
}
