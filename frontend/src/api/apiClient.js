/* ═══════════════════════════════════════════════════════
   LawLibra – Base API Client
   Reads AUTH_TOKEN from sessionStorage and attaches it
   as a Bearer token to every outgoing request.
═══════════════════════════════════════════════════════ */

const BASE_URL = '/api'

/**
 * Thin wrapper around fetch that:
 *  1. Reads AUTH_TOKEN from sessionStorage
 *  2. Attaches it as Authorization: Bearer <token>
 *  3. Parses JSON response
 *  4. Throws a descriptive Error on non-2xx responses
 *
 * @param {string} path      - e.g. '/cases' or '/cases/123'
 * @param {RequestInit} opts - standard fetch options (method, body, etc.)
 * @returns {Promise<any>}   - parsed JSON body
 */
export async function apiFetch(path, opts = {}) {
  const token = sessionStorage.getItem('AUTH_TOKEN')

  const headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // For FormData bodies we must NOT set Content-Type so the browser adds
  // the correct multipart boundary automatically.
  if (opts.body instanceof FormData) {
    delete headers['Content-Type']
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...opts, headers })

  // Handle 401 – session expired or invalid token
  if (res.status === 401) {
    sessionStorage.clear()
    window.dispatchEvent(new Event('auth-change'))
    throw new Error('Your session has expired. Please log in again.')
  }

  // Try to parse JSON regardless of status so we can extract the server's
  // error message when the response is not OK.
  let data
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    data = await res.json()
  } else {
    data = await res.text()
  }

  if (!res.ok) {
    // Backend typically returns { message: '...' } or { error: '...' }
    const msg =
      (typeof data === 'object' && (data.message || data.error)) ||
      `Request failed with status ${res.status}`
    throw new Error(msg)
  }

  return data
}
