/* ═══════════════════════════════════════════════════════
   LawLibra – Notifications API
   Mirrors: backend/routes/notifications.routes.mjs

   GET    /api/notifications?entityType=&limit=&offset=  — Paginated feed
   GET    /api/notifications/unread-count                — Bell-badge count
   PATCH  /api/notifications/read-all                   — Mark all as read
   PATCH  /api/notifications/:id/read                   — Mark single as read
   DELETE /api/notifications/:id                        — Delete a notification
═══════════════════════════════════════════════════════ */

import { apiFetch } from './apiClient.js'

/**
 * GET /api/notifications
 * Returns the paginated notification feed for the authenticated user.
 * @param {{
 *   entityType?: string,  // optional tab filter e.g. "case" | "document" | "hearing"
 *   limit?:      number,
 *   offset?:     number,
 * }} params
 */
export async function getNotifications(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return apiFetch(`/notifications${qs ? `?${qs}` : ''}`)
}

/**
 * GET /api/notifications/unread-count
 * Returns the unread notification count — used for the bell badge in the nav.
 * @returns {Promise<{ count: number }>}
 */
export async function getUnreadCount() {
  return apiFetch('/notifications/unread-count')
}

/**
 * PATCH /api/notifications/read-all
 * Marks all of the authenticated user's notifications as read.
 */
export async function markAllRead() {
  return apiFetch('/notifications/read-all', { method: 'PATCH' })
}

/**
 * PATCH /api/notifications/:id/read
 * Marks a single notification as read.
 * @param {string} id
 */
export async function markRead(id) {
  return apiFetch(`/notifications/${id}/read`, { method: 'PATCH' })
}

/**
 * DELETE /api/notifications/:id
 * Permanently deletes a single notification.
 * @param {string} id
 */
export async function deleteNotification(id) {
  return apiFetch(`/notifications/${id}`, { method: 'DELETE' })
}
