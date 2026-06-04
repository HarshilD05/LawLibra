/* ═══════════════════════════════════════════════════════
   LawLibra – Events API
   Mirrors: backend/routes/events.routes.mjs

   POST   /api/events              — Create a new personal event
   GET    /api/events?from&to&...  — List own events (optional date-range filter)
   GET    /api/events/:id          — Get a single event (owner only)
   PATCH  /api/events/:id          — Update an event (owner only)
   DELETE /api/events/:id          — Delete an event (owner only)
═══════════════════════════════════════════════════════ */

import { apiFetch } from './apiClient.js'

/**
 * POST /api/events
 * Creates a new personal calendar event.
 * @param {{
 *   title:    string,
 *   date:     string,       // ISO date string e.g. "2025-12-01"
 *   time?:    string,       // e.g. "10:00 AM"
 *   type?:    string,       // "HEARING" | "MEETING" | "REMINDER" | "DEADLINE"
 *   caseId?:  string,
 *   location?:string,
 *   duration?:number,       // minutes
 *   notes?:   string,
 * }} payload
 */
export async function createEvent(payload) {
  return apiFetch('/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * GET /api/events
 * Lists the authenticated user's own events.
 * @param {{
 *   from?:   string,   // ISO date — lower bound filter
 *   to?:     string,   // ISO date — upper bound filter
 *   limit?:  number,
 *   offset?: number,
 * }} params
 */
export async function getEvents(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return apiFetch(`/events${qs ? `?${qs}` : ''}`)
}

/**
 * GET /api/events/:id
 * Gets a single event by ID (owner only).
 * @param {string} id
 */
export async function getEventById(id) {
  return apiFetch(`/events/${id}`)
}

/**
 * PATCH /api/events/:id
 * Updates an event (owner only).
 * @param {string} id
 * @param {Partial<{title,date,time,type,caseId,location,duration,notes}>} patch
 */
export async function updateEvent(id, patch) {
  return apiFetch(`/events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

/**
 * DELETE /api/events/:id
 * Deletes an event (owner only).
 * @param {string} id
 */
export async function deleteEvent(id) {
  return apiFetch(`/events/${id}`, { method: 'DELETE' })
}
