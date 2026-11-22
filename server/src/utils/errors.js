/**
 * Typed application error. The central error handler turns it into the JSON error shape:
 * { error: { code, message, details? } }
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFound(message = 'Resource not found') {
  return new AppError(404, 'NOT_FOUND', message);
}

export function validationFailed(details) {
  return new AppError(400, 'VALIDATION_FAILED', 'Request validation failed', details);
}

export function unauthorized(code = 'UNAUTHENTICATED', message = 'Authentication required') {
  return new AppError(401, code, message);
}

export function forbidden(code = 'FORBIDDEN', message = 'You do not have access to this resource') {
  return new AppError(403, code, message);
}

export function conflict(code, message, details) {
  return new AppError(409, code, message, details);
}

export function tooManyRequests(code, message) {
  return new AppError(429, code, message);
}

export function payloadTooLarge(message = 'The uploaded file is too large') {
  return new AppError(413, 'FILE_TOO_LARGE', message);
}

export function unsupportedMedia(message = 'This file type is not allowed') {
  return new AppError(415, 'UNSUPPORTED_FILE_TYPE', message);
}
