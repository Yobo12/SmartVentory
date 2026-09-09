/**
 * auth.js — session management for SmartVentory.
 *
 * Token lives in sessionStorage (explicit team decision — not
 * localStorage, not cookies: see handover Section 13). This file is
 * the only place that reads/writes it.
 *
 * Usage:
 *   Protected pages: import { requireAuth } from './auth.js' and call
 *   requireAuth() at the top of the page's own script, before doing
 *   anything else. It redirects to login.html if there's no token.
 *
 *   login.html: import { login } from './auth.js', call it from the
 *   form submit handler.
 *
 *   Anywhere with a logout button: import { logout }.
 */

import { api, ApiError } from './api.js';
import { addNotification } from './notifications.js';

const TOKEN_KEY = 'sv_token';

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

/**
 * Reads the "role" claim out of the JWT payload (e.g. "Admin" / "Staff")
 * WITHOUT verifying the signature — this is for UI purposes only (show/
 * hide Admin-only buttons), never for actual authorization. The backend
 * re-checks the real, signature-verified role on every request via
 * require_role(), so a tampered token here can't grant real access —
 * it would just make a button visible that the backend still rejects.
 * Exists because GET /auth/me returns role_id, not a role name, and
 * there's no roles-lookup endpoint.
 */
function getRole() {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || null;
  } catch {
    return null;
  }
}

function isAdmin() {
  return getRole() === 'Admin';
}

function isAuthenticated() {
  return Boolean(getToken());
}

function setToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

/**
 * Attempts login. On success, stores the token and returns the
 * logged-in user's profile (from GET /auth/me) so the caller can
 * greet them by name without a second round trip on the next page.
 * On failure, throws ApiError — the caller (login.html's form
 * handler) is responsible for displaying it.
 */
async function login(email, password) {
  const { access_token } = await api.login(email, password);
  setToken(access_token);
  sessionStorage.setItem('sv_login_time', new Date().toISOString());

  if (!localStorage.getItem('sv_welcomed')) {
    localStorage.setItem('sv_welcomed', 'true');
    addNotification({
      type: 'system_welcome',
      title: 'Welcome to SmartVentory',
      description: 'Your intelligent inventory assistant is ready.',
    });
  }

  try {
    return await api.me();
  } catch (err) {
    // Token was issued but /me failed for some other reason (rare) —
    // don't leave a half-logged-in state.
    clearToken();
    throw err;
  }
}

function logout({ redirect = true } = {}) {
  clearToken();
  if (redirect) {
    window.location.href = 'login.html';
  }
}

/**
 * Call at the top of every protected page. Redirects to login.html
 * immediately if there's no token — pages should call this before
 * rendering anything sensitive.
 */
function requireAuth() {
  if (!isAuthenticated()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

// A 401 from ANY api.js call (token expired mid-session, account
// deactivated server-side, etc.) means the session is no longer
// valid — log out and bounce to login regardless of which page or
// which call triggered it.
window.addEventListener('sv:unauthorized', () => {
  logout();
});

export { login, logout, requireAuth, isAuthenticated, getToken, getRole, isAdmin };
