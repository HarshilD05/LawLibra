/**
 * Document Controller
 *
 * Handles upload, listing, retrieval, and deletion of documents.
 *
 * Upload flow:
 *   1. Multer saves the file to uploads/tmp/<uuid>.<ext>
 *   2. Controller validates caseId, folderId, and user access
 *   3. File is moved from temp → data/<caseId>/<folderId>/
 *   4. A Document DB record is created (status: PENDING)
 *   5. A BullMQ job is queued — worker handles ingestion in background
 *   6. 202 is returned immediately with documentId + jobId
 *
 * Access rules:
 *   - Upload / Delete: ADMIN or case EDIT/ADMIN assignment
 *   - List / Get:      ADMIN or any case assignment (VIEW, EDIT, ADMIN)
 */

import path from 'path';
import fs   from 'fs/promises';

import Document, { PROCESSING_STATUS } from '../models/document.model.mjs';
import { Case }                        from '../models/case.model.mjs';
import Folder                          from '../models/folder.model.mjs';
import { docIngestionQueue }           from '../config/queue.mjs';
import {
    getDocumentDirPath,
    getStoragePath,
    resolveAbsolutePath,
    ensureDir,
} from '../utils/storage.utils.mjs';

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Asserts that the requesting user has access to the given case.
 * Returns { kase, accessLevel } or null if denied.
 */
async function resolveCaseAccess(caseId, reqUser) {
    const kase = await Case.findById(caseId);
    if (!kase) return null;

    if (reqUser.role === 'ADMIN') return { kase, accessLevel: 'ADMIN' };

    const accessLevel = await Case.getLawyerAccessLevel(caseId, reqUser.id);
    if (!accessLevel) return null;

    return { kase, accessLevel };
}

// ─── Upload ────────────────────────────────────────────────────────────────────

/**
 * POST /api/documents/upload
 *
 * Multipart form fields:
 *   - document   (file, required)
 *   - caseId     (text, required)
 *   - folderId   (text, optional — omit or send empty string for case root)
 *
 * Returns 202 with documentId and jobId on success.
 */
export const uploadDocument = async (req, res) => {
    // req.file is populated by the multer middleware in the router
    const tempFilePath = req.file?.path;

    try {
        const { caseId, folderId: rawFolderId } = req.body;
        const folderId = rawFolderId?.trim() || null; // normalise empty string → null

        // ── Validation ────────────────────────────────────────────────────────
        if (!caseId?.trim()) {
            return res.status(400).json({ error: 'caseId is required.' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No file provided. Use field name "document".' });
        }

        // ── Access check — EDIT or ADMIN required to upload ───────────────────
        const access = await resolveCaseAccess(caseId, req.user);
        if (!access) {
            return res.status(404).json({ error: 'Case not found or access denied.' });
        }
        if (access.accessLevel === 'VIEW') {
            return res.status(403).json({ error: 'VIEW access is insufficient. EDIT or ADMIN required to upload documents.' });
        }

        // ── Validate folderId belongs to this case ────────────────────────────
        if (folderId) {
            const folder = await Folder.findById(folderId);
            if (!folder || folder.caseId !== caseId) {
                return res.status(400).json({ error: 'folderId does not belong to this case.' });
            }
        }

        // ── Move file from temp → final destination ───────────────────────────
        const destDir      = getDocumentDirPath(caseId, folderId);
        await ensureDir(destDir);

        const finalFileName = path.basename(req.file.filename); // uuid.ext from multer
        const finalFilePath = path.join(destDir, finalFileName);

        await fs.rename(tempFilePath, finalFilePath);
        // From this point the temp file is gone — no cleanup needed on error

        // ── Create DB record ──────────────────────────────────────────────────
        const storagePath = getStoragePath(caseId, folderId, finalFileName);

        const doc = await Document.create({
            caseId,
            folderId,
            uploaderId:    req.user.id,
            fileName:      finalFileName,
            originalName:  req.file.originalname,
            storagePath,
            mimeType:      req.file.mimetype,
            fileSizeBytes: req.file.size,
        });

        // ── Queue the BullMQ ingestion job ────────────────────────────────────
        const job = await docIngestionQueue.add('ingest', {
            documentId: doc.id,
            filePath:   finalFilePath,   // absolute path so worker can find it
            mimeType:   req.file.mimetype,
            caseId,
        });

        return res.status(202).json({
            message:    'Document uploaded successfully. Ingestion has started in the background.',
            documentId: doc.id,
            jobId:      job.id,
            status:     PROCESSING_STATUS.PENDING,
        });

    } catch (err) {
        // If the error occurred before fs.rename, the temp file may still exist
        if (tempFilePath) {
            fs.unlink(tempFilePath).catch(() => {});
        }

        // Multer file-filter errors arrive here with a non-5xx intent
        if (err.message?.startsWith('Unsupported file type')) {
            return res.status(400).json({ error: err.message });
        }

        console.error('[Documents] uploadDocument error:', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

// ─── List ──────────────────────────────────────────────────────────────────────

/**
 * GET /api/documents?caseId=&folderId=&limit=20&offset=0
 *
 * folderId=null   → documents at the root of the case
 * folderId absent → all documents in the case (all folders)
 */
export const getDocuments = async (req, res) => {
    try {
        const { caseId, folderId: rawFolderId } = req.query;

        if (!caseId) {
            return res.status(400).json({ error: 'caseId query parameter is required.' });
        }

        const access = await resolveCaseAccess(caseId, req.user);
        if (!access) {
            return res.status(404).json({ error: 'Case not found or access denied.' });
        }

        const limit  = Math.min(parseInt(req.query.limit)  || 20, 100);
        const offset = Math.max(parseInt(req.query.offset) || 0,  0);

        // 'null' string from query param → JS null (root); undefined → all folders
        const folderId = rawFolderId === 'null'
            ? null
            : rawFolderId ?? undefined;

        const { documents, total } = await Document.findByCaseId(caseId, { limit, offset, folderId });

        return res.status(200).json({ data: documents, total, limit, offset });

    } catch (err) {
        console.error('[Documents] getDocuments error:', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

// ─── Get by ID ─────────────────────────────────────────────────────────────────

/**
 * GET /api/documents/:id
 * Returns document metadata and current processing status.
 */
export const getDocumentById = async (req, res) => {
    try {
        const doc = await Document.findById(req.params.id);
        if (!doc) {
            return res.status(404).json({ error: 'Document not found.' });
        }

        const access = await resolveCaseAccess(doc.caseId, req.user);
        if (!access) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        return res.status(200).json({ document: doc });

    } catch (err) {
        console.error('[Documents] getDocumentById error:', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

// ─── Delete ────────────────────────────────────────────────────────────────────

/**
 * DELETE /api/documents/:id
 *
 * Deletes the document file from disk, the DB record, and all chunks (CASCADE).
 * Access: ADMIN or case EDIT/ADMIN.
 */
export const deleteDocument = async (req, res) => {
    try {
        const doc = await Document.findById(req.params.id);
        if (!doc) {
            return res.status(404).json({ error: 'Document not found.' });
        }

        // Access check
        const access = await resolveCaseAccess(doc.caseId, req.user);
        if (!access) {
            return res.status(403).json({ error: 'Access denied.' });
        }
        if (access.accessLevel === 'VIEW') {
            return res.status(403).json({ error: 'VIEW access is insufficient. EDIT or ADMIN required to delete documents.' });
        }

        // Delete file from disk (non-fatal if already missing)
        const absPath = resolveAbsolutePath(doc.storagePath);
        await fs.unlink(absPath).catch((e) => {
            console.warn(`[Documents] File not found on disk at ${absPath}: ${e.message}`);
        });

        // Delete DB record — doc_chunks cascade via FK
        await Document.deleteById(req.params.id);

        return res.status(200).json({ message: 'Document deleted successfully.' });

    } catch (err) {
        console.error('[Documents] deleteDocument error:', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};
