/* ═══════════════════════════════════════════════════════
   LawLibra – Auth API
   Mirrors: backend/routes/auth.routes.mjs
═══════════════════════════════════════════════════════ */

import { apiFetch } from './apiClient.js'

/* ── Session Storage Keys ─── */
export const SESSION_KEYS = {
  USER_NAME:  'USER_NAME',
  USER_EMAIL: 'USER_EMAIL',
  USER_ROLE:  'USER_ROLE',
  AUTH_TOKEN: 'AUTH_TOKEN',
}

/**
 * Saves user session data to sessionStorage after a successful login.
 * sessionStorage is automatically cleared when the tab is closed.
 */
function saveSession({ token, user }) {
  sessionStorage.setItem(SESSION_KEYS.AUTH_TOKEN,  token)
  sessionStorage.setItem(SESSION_KEYS.USER_NAME,   user.name)
  sessionStorage.setItem(SESSION_KEYS.USER_EMAIL,  user.email)
  sessionStorage.setItem(SESSION_KEYS.USER_ROLE,   user.role)
}

/**
 * Clears all session data from sessionStorage and fires the auth-change
 * event so the UI can react (e.g. redirect to /login).
 */
export function clearSession() {
  sessionStorage.removeItem(SESSION_KEYS.AUTH_TOKEN)
  sessionStorage.removeItem(SESSION_KEYS.USER_NAME)
  sessionStorage.removeItem(SESSION_KEYS.USER_EMAIL)
  sessionStorage.removeItem(SESSION_KEYS.USER_ROLE)
  window.dispatchEvent(new Event('auth-change'))
}

/**
 * Reads the current session from sessionStorage.
 * Returns null if no session exists.
 * @returns {{ name: string, email: string, role: string, token: string } | null}
 */
export function getSession() {
  const token = sessionStorage.getItem(SESSION_KEYS.AUTH_TOKEN)
  if (!token) return null
  return {
    name:  sessionStorage.getItem(SESSION_KEYS.USER_NAME),
    email: sessionStorage.getItem(SESSION_KEYS.USER_EMAIL),
    role:  sessionStorage.getItem(SESSION_KEYS.USER_ROLE),
    token,
  }
}

/** Returns true if a valid session token is present in sessionStorage. */
export function isLoggedIn() {
  return !!sessionStorage.getItem(SESSION_KEYS.AUTH_TOKEN)
}

// ─── API Calls ────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Authenticates the user and saves the session to sessionStorage.
 * @param {{ email: string, password: string }} credentials
 * @returns {Promise<{ token: string, user: object }>}
 */
export async function login({ email, password }) {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  saveSession(data)
  window.dispatchEvent(new Event('auth-change'))
  return data
}

/**
 * POST /api/auth/register
 * Registers a new user account.
 * @param {{ name: string, email: string, password: string, role: string }} payload
 */
export async function register(payload) {
  return apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * GET /api/auth/me
 * Returns the current authenticated user's profile.
 */
export async function getMe() {
  return apiFetch('/auth/me')
}

/**
 * PATCH /api/auth/change-password
 * @param {{ oldPassword: string, newPassword: string }} payload
 */
export async function changePassword(payload) {
  return apiFetch('/auth/change-password', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/**
 * GET /api/auth/users   (Admin only)
 * @param {{ limit?: number, offset?: number }} params
 */
export async function getAllUsers(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return apiFetch(`/auth/users${qs ? `?${qs}` : ''}`)
}

/**
 * GET /api/auth/users/:id   (Admin only)
 */
export async function getUserById(id) {
  return apiFetch(`/auth/users/${id}`)
}

/**
 * DELETE /api/auth/users/:id   (Admin only)
 */
export async function deleteUser(id) {
  return apiFetch(`/auth/users/${id}`, { method: 'DELETE' })
}

/**
 * POST /api/auth/users   (Admin only)
 * Creates a new user with a verified admin token — role can be trusted.
 * @param {{ name: string, email: string, password: string, role: string }} payload
 */
export async function adminCreateUser(payload) {
  return apiFetch('/auth/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * PATCH /api/auth/users/:id   (Admin only)
 * Updates a user's name, email, and/or role.
 * @param {string} id
 * @param {{ name?: string, email?: string, role?: string }} fields
 */
export async function updateUser(id, fields) {
  return apiFetch(`/auth/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  })
}
