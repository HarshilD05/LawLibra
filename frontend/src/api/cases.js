/* ═══════════════════════════════════════════════════════
   LawLibra – Cases API
   Mirrors: backend/routes/cases.routes.mjs
═══════════════════════════════════════════════════════ */

import { apiFetch } from './apiClient.js'

/**
 * GET /api/cases
 * Lists cases. Admins see all; Lawyers see only their assigned cases.
 * @param {{ limit?: number, offset?: number, status?: string }} params
 */
export async function getCases(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return apiFetch(`/cases${qs ? `?${qs}` : ''}`)
}

/**
 * GET /api/cases/:id
 * Gets a single case by ID.
 */
export async function getCaseById(id) {
  return apiFetch(`/cases/${id}`)
}

/**
 * POST /api/cases   (Admin only)
 * Creates a new case.
 * @param {object} payload
 */
export async function createCase(payload) {
  return apiFetch('/cases', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * PATCH /api/cases/:id
 * Updates a case (Admin or assigned Lawyer).
 * @param {string} id
 * @param {object} patch
 */
export async function updateCase(id, patch) {
  return apiFetch(`/cases/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

/**
 * DELETE /api/cases/:id   (Admin only)
 */
export async function deleteCase(id) {
  return apiFetch(`/cases/${id}`, { method: 'DELETE' })
}

/**
 * POST /api/cases/:id/assignments   (Admin only)
 * Assigns a lawyer to a case.
 * @param {string} caseId
 * @param {string} lawyerId
 */
export async function assignLawyer(caseId, lawyerId) {
  return apiFetch(`/cases/${caseId}/assignments`, {
    method: 'POST',
    body: JSON.stringify({ lawyerId }),
  })
}

/**
 * DELETE /api/cases/:id/assignments/:lawyerId   (Admin only)
 * Removes a lawyer from a case.
 */
export async function removeAssignment(caseId, lawyerId) {
  return apiFetch(`/cases/${caseId}/assignments/${lawyerId}`, { method: 'DELETE' })
}

/**
 * GET /api/cases/:id/assignments   (Admin only)
 * Lists all lawyers assigned to a case.
 */
export async function getAssignments(caseId) {
  return apiFetch(`/cases/${caseId}/assignments`)
}
