/* ═══════════════════════════════════════════════════════
   LawLibra – Folders API
   Mirrors: backend/routes/folders.routes.mjs
═══════════════════════════════════════════════════════ */

import { apiFetch } from './apiClient.js'

/**
 * POST /api/folders
 * Creates a new folder.
 * @param {{ name: string, caseId: string, parentId?: string }} payload
 */
export async function createFolder(payload) {
  return apiFetch('/folders', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * GET /api/folders/tree?caseId=<id>
 * Returns the full nested folder tree for a given case.
 * NOTE: This endpoint MUST be called before /folders/:id or Express
 * would try to match the string "tree" as a folder ID.
 * @param {string} caseId
 */
export async function getFolderTree(caseId) {
  return apiFetch(`/folders/tree?caseId=${caseId}`)
}

/**
 * GET /api/folders/:id
 * Gets a single folder by ID.
 */
export async function getFolderById(id) {
  return apiFetch(`/folders/${id}`)
}

/**
 * PATCH /api/folders/:id
 * Renames a folder.
 * @param {string} id
 * @param {{ name: string }} patch
 */
export async function renameFolder(id, patch) {
  return apiFetch(`/folders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

/**
 * DELETE /api/folders/:id
 * Deletes a folder and all its descendants and their files.
 */
export async function deleteFolder(id) {
  return apiFetch(`/folders/${id}`, { method: 'DELETE' })
}
