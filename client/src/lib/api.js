const API_BASE = '/api';
const CSRF_COOKIE = 'chatify_csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// Auth endpoints never trigger the refresh-and-retry flow: a 401 from them is a real answer.
const NO_REFRESH_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
  '/auth/csrf',
]);
const RACE_RETRY_DELAY_MS = 400;

export class ApiError extends Error {
  constructor({ status, code, message, details }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = Array.isArray(details) ? details : [];
  }
}

function readCookie(name) {
  const prefix = `${name}=`;
  const part = document.cookie.split('; ').find((entry) => entry.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : null;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function send(method, path, { body, csrf } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (csrf) {
    headers['X-CSRF-Token'] = csrf;
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Could not reach the server. Check your connection and try again.',
    });
  }

  if (response.status === 204) {
    return null;
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      code: data?.error?.code ?? 'UNKNOWN_ERROR',
      message: data?.error?.message ?? 'Something went wrong. Please try again.',
      details: data?.error?.details,
    });
  }
  return data;
}

/** The CSRF token from its cookie, fetching a fresh one from the server when it is missing. */
async function csrfToken() {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) {
    return existing;
  }
  const data = await send('GET', '/auth/csrf');
  return data.csrfToken;
}

let refreshInFlight = null;

/**
 * Refresh the session. Concurrent callers share one request. If another browser tab won the
 * rotation race, wait briefly and retry once: the cookie jar is shared, so the retry carries the
 * winner's new token.
 */
function refreshSession() {
  refreshInFlight ??= (async () => {
    try {
      await send('POST', '/auth/refresh', { csrf: await csrfToken() });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'REFRESH_RACE') {
        await delay(RACE_RETRY_DELAY_MS);
        await send('POST', '/auth/refresh', { csrf: await csrfToken() });
        return;
      }
      throw error;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

let onSessionExpired = () => {};

/** Register the callback that runs when the session can no longer be refreshed. */
export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

/**
 * Run an attempt and, on an expired access token, refresh the session once and run it again.
 * Auth endpoints are excluded: a 401 from them is a real answer.
 */
async function withRefresh(path, attempt) {
  try {
    return await attempt();
  } catch (error) {
    const canRefresh =
      error instanceof ApiError &&
      error.status === 401 &&
      error.code === 'UNAUTHENTICATED' &&
      !NO_REFRESH_PATHS.has(path);
    if (!canRefresh) {
      throw error;
    }

    try {
      await refreshSession();
    } catch (refreshError) {
      if (refreshError instanceof ApiError && refreshError.status === 0) {
        throw refreshError;
      }
      onSessionExpired();
      throw error;
    }
    return attempt();
  }
}

async function request(method, path, body) {
  const mutating = !SAFE_METHODS.has(method);
  return withRefresh(path, async () =>
    send(method, path, { body, csrf: mutating ? await csrfToken() : undefined }),
  );
}

/** One multipart upload through XMLHttpRequest, the only browser API that reports upload progress. */
function xhrUpload(method, path, file, { csrf, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${API_BASE}${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-CSRF-Token', csrf);
    xhr.responseType = 'json';

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(event.loaded / event.total);
      }
    };
    xhr.onerror = () =>
      reject(
        new ApiError({
          status: 0,
          code: 'NETWORK_ERROR',
          message: 'Could not reach the server. Check your connection and try again.',
        }),
      );
    xhr.onabort = () =>
      reject(new ApiError({ status: 0, code: 'ABORTED', message: 'Upload cancelled' }));
    xhr.onload = () => {
      const data = xhr.response;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
        return;
      }
      reject(
        new ApiError({
          status: xhr.status,
          code: data?.error?.code ?? 'UNKNOWN_ERROR',
          message: data?.error?.message ?? 'Upload failed. Please try again.',
          details: data?.error?.details,
        }),
      );
    };

    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
  /** Upload one file. options: { method = 'POST', onProgress(0..1), signal }. */
  upload: (path, file, { method = 'POST', onProgress, signal } = {}) =>
    withRefresh(path, async () =>
      xhrUpload(method, path, file, { csrf: await csrfToken(), onProgress, signal }),
    ),
};
