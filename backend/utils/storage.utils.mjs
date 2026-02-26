/**
 * Storage Utilities
 *
 * Centralises all disk-path logic for the case/folder/document hierarchy.
 * All paths are derived from the DATA_DIR env var so a future migration to
 * S3 only requires changing these helpers — callers stay untouched.
 *
 * On-disk layout:
 *   <DATA_DIR>/
 *     <caseId>/
 *       root/            ← documents with no folder (folderId = null)
 *       <folderId>/      ← documents inside a specific folder
 *
 * storage_path (stored in DB, doubles as future S3 key):
 *   <caseId>/root/<uuid>.pdf
 *   <caseId>/<folderId>/<uuid>.docx
 */

import fs   from 'fs/promises';
import path from 'path';

// ─── Root directory ────────────────────────────────────────────────────────────
// Resolve once at module load. DATA_DIR may be relative (resolved from CWD)
// or absolute.
const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');

// ─── Path builders ─────────────────────────────────────────────────────────────

/**
 * Absolute path to a case's root directory.
 * Created when a case is created; deleted when a case is deleted.
 *
 * @param {string} caseId
 * @returns {string}
 */
export function getCaseDirPath(caseId) {
    return path.join(DATA_DIR, caseId);
}

/**
 * Absolute path to the directory where a document should be stored.
 * folderId = null → maps to the 'root' subdirectory of the case.
 *
 * @param {string}      caseId
 * @param {string|null} folderId
 * @returns {string}
 */
export function getDocumentDirPath(caseId, folderId) {
    const folderSegment = folderId ?? 'root';
    return path.join(DATA_DIR, caseId, folderSegment);
}

/**
 * Build the relative storage_path that gets stored in the DB.
 * Portable across local disk ↔ S3 (the key stays the same).
 *
 * @param {string}      caseId
 * @param {string|null} folderId
 * @param {string}      fileName   UUID-based file name with extension
 * @returns {string}  e.g. "abc-case-id/root/uuid.pdf"
 */
export function getStoragePath(caseId, folderId, fileName) {
    const folderSegment = folderId ?? 'root';
    return path.join(caseId, folderSegment, fileName);
}

/**
 * Resolve a DB storage_path to an absolute disk path.
 * Swap this single function when migrating to S3.
 *
 * @param {string} storagePath  Relative path from DB column
 * @returns {string}
 */
export function resolveAbsolutePath(storagePath) {
    return path.join(DATA_DIR, storagePath);
}

// ─── Filesystem helpers ────────────────────────────────────────────────────────

/**
 * Creates a directory (and all parents) if it doesn't already exist.
 */
export async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Recursively deletes a directory and all its contents.
 * Safe to call even if the directory does not exist (force: true).
 */
export async function deleteDirRecursive(dirPath) {
    await fs.rm(dirPath, { recursive: true, force: true });
}
