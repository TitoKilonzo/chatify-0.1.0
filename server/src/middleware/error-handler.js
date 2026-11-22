import { AppError, notFound } from '../utils/errors.js';

export function notFoundHandler(_req, _res, next) {
  next(notFound('Route not found'));
}

/**
 * Convert any thrown value into the consistent JSON error shape. Unknown errors are logged with
 * full detail but reported to the client as a generic 500 so internals never leak.
 */
export function createErrorHandler(logger) {
  // Express identifies error middleware by its four-argument signature, so _next must stay.
  return function errorHandler(err, req, res, _next) {
    let appError;

    if (err instanceof AppError) {
      appError = err;
    } else if (err?.type === 'entity.too.large') {
      appError = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    } else if (err?.type === 'entity.parse.failed') {
      appError = new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON');
    } else {
      logger.error({ err, method: req.method, path: req.path }, 'unhandled error');
      appError = new AppError(500, 'INTERNAL_ERROR', 'Something went wrong');
    }

    if (res.headersSent) {
      return res.end();
    }

    const body = { code: appError.code, message: appError.message };
    if (appError.details !== undefined) {
      body.details = appError.details;
    }
    return res.status(appError.status).json({ error: body });
  };
}
