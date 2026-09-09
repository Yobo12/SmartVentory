/**
 * api.js — SmartVentory frontend API layer.
 *
 * The ONLY place that constructs the Authorization header or calls
 * fetch() against the backend. Every page-specific JS file imports
 * `api` from here and calls through it.
 *
 * Backend contract this was built against (backend Phase 7 zip):
 *   - Base path: settings.API_V1_PREFIX = "/api/v1"
 *   - POST /api/v1/auth/login expects application/x-www-form-urlencoded
 *     with a "username" field carrying the user's EMAIL (OAuth2 password
 *     flow quirk — see routers/auth.py's own docstring), returns
 *     { access_token, token_type }.
 *   - Every other endpoint expects/returns JSON, and protected routes
 *     require "Authorization: Bearer <token>".
 *   - A 401 means the token is missing/expired/invalid — the caller
 *     should treat this as "log the user out", not retry.
 */

const API_BASE_URL = 'http://127.0.0.1:8000/api/v1';

/** Thrown for any non-2xx response. Carries the HTTP status and the
 *  backend's own `detail` message (FastAPI's standard error shape)
 *  so callers can show something meaningful instead of a generic error. */
class ApiError extends Error {
  constructor(status, detail) {
    super(detail || `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

function getToken() {
  return sessionStorage.getItem('sv_token');
}

/**
 * Core request function. Not exported directly — every HTTP verb
 * below is a thin wrapper around this.
 *
 * @param {string} path - e.g. "/products" (leading slash, no base URL)
 * @param {object} options
 * @param {string} [options.method='GET']
 * @param {object} [options.body] - plain object, JSON-encoded automatically
 * @param {boolean} [options.auth=true] - attach the Bearer token
 * @param {boolean} [options.form=false] - send as
 *        application/x-www-form-urlencoded instead of JSON (only
 *        auth/login needs this, per the backend's OAuth2 password flow)
 */
async function request(path, { method = 'GET', body, auth = true, form = false } = {}) {
  const headers = {};
  let payload;

  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(body).toString();
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  if (auth) {
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { method, headers, body: payload });
  } catch (networkError) {
    // fetch() itself throws on network failure (server down, no
    // connection, CORS block) — normalize this into an ApiError too
    // so callers only ever need to catch one thing.
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }

  // 204 No Content — nothing to parse.
  if (response.status === 204) {
    return null;
  }

  let data = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await response.json().catch(() => null);
  }

  if (!response.ok) {
    // Auth expired/invalid: broadcast a single event that auth.js
    // listens for, rather than every caller having to special-case 401.
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('sv:unauthorized'));
    }
    const detail = data?.detail
      ? (Array.isArray(data.detail)
          ? data.detail.map((d) => d.msg).join(', ') // Pydantic validation errors
          : data.detail)
      : null;
    throw new ApiError(response.status, detail);
  }

  return data;
}

const api = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  delete: (path, opts) => request(path, { ...opts, method: 'DELETE' }),

  /** Login is the one endpoint that isn't JSON-in/JSON-out. */
  login: (email, password) =>
    request('/auth/login', {
      method: 'POST',
      auth: false,
      form: true,
      body: { username: email, password },
    }),

  me: () => request('/auth/me'),
};

export { api, ApiError, API_BASE_URL };
