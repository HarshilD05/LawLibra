/* ═══════════════════════════════════════════════════════
   LawLibra – Documents API
   Mirrors: backend/routes/documents.routes.mjs
═══════════════════════════════════════════════════════ */

import { apiFetch } from './apiClient.js'

/**
 * POST /api/documents/upload
 * Uploads a document as multipart/form-data.
 * NOTE: Pass a FormData object — apiFetch will NOT set Content-Type
 * so the browser can set the correct multipart boundary automatically.
 *
 * @param {FormData} formData  Must contain a field named "document" with the File,
 *                             plus optional fields: caseId, folderId, tags
 */
export async function uploadDocument(formData) {
  return apiFetch('/documents/upload', {
    method: 'POST',
    body: formData,
  })
}

/**
 * GET /api/documents
 * Lists documents, filtered by query params.
 * @param {{ caseId?: string, folderId?: string, limit?: number, offset?: number }} params
 */
export async function getDocuments(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return apiFetch(`/documents${qs ? `?${qs}` : ''}`)
}

/**
 * GET /api/documents/:id
 * Gets a single document by ID including processing status.
 */
export async function getDocumentById(id) {
  return apiFetch(`/documents/${id}`)
}

/**
 * GET /api/documents/:id/chunks
 * Gets the text chunks extracted from a document (used for AI context).
 */
export async function getDocumentChunks(id) {
  return apiFetch(`/documents/${id}/chunks`)
}

/**
 * DELETE /api/documents/:id
 * Deletes the document record, file on disk, and all its chunks.
 */
export async function deleteDocument(id) {
  return apiFetch(`/documents/${id}`, { method: 'DELETE' })
}
