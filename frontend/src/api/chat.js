/* ═══════════════════════════════════════════════════════
   LawLibra – Chat (AI Threads & Messages) API
   Mirrors: backend/routes/chat.routes.mjs
═══════════════════════════════════════════════════════ */

import { apiFetch } from './apiClient.js'

// ─── Threads ──────────────────────────────────────────────────────────────────

/**
 * POST /api/chat/threads
 * Creates a new chat thread, optionally linked to a case.
 * @param {{ title?: string, caseId?: string }} payload
 */
export async function createThread(payload) {
  return apiFetch('/chat/threads', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * GET /api/chat/threads?caseId=<id>
 * Lists all threads. Pass caseId to filter by case.
 * @param {{ caseId?: string }} params
 */
export async function getThreads(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return apiFetch(`/chat/threads${qs ? `?${qs}` : ''}`)
}

/**
 * GET /api/chat/threads/:id
 * Gets a single thread by ID.
 */
export async function getThreadById(id) {
  return apiFetch(`/chat/threads/${id}`)
}

/**
 * PATCH /api/chat/threads/:id
 * Renames a thread (owner or Admin only).
 * @param {string} id
 * @param {{ title: string }} patch
 */
export async function renameThread(id, patch) {
  return apiFetch(`/chat/threads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

/**
 * DELETE /api/chat/threads/:id
 * Deletes a thread and all its messages (owner or Admin only).
 */
export async function deleteThread(id) {
  return apiFetch(`/chat/threads/${id}`, { method: 'DELETE' })
}

// ─── Messages ─────────────────────────────────────────────────────────────────

/**
 * GET /api/chat/threads/:id/messages
 * Gets paginated messages for a thread.
 * @param {string} threadId
 * @param {{ limit?: number, offset?: number }} params
 */
export async function getMessages(threadId, params = {}) {
  const qs = new URLSearchParams(params).toString()
  return apiFetch(`/chat/threads/${threadId}/messages${qs ? `?${qs}` : ''}`)
}

/**
 * POST /api/chat/threads/:id/messages
 * Sends a message to a thread. The backend processes the message and
 * returns the AI reply.
 * @param {string} threadId
 * @param {{ content: string }} payload
 * @returns {Promise<{ userMessage: object, assistantMessage: object }>}
 */
export async function sendMessage(threadId, payload) {
  return apiFetch(`/chat/threads/${threadId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
