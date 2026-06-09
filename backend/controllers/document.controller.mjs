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

import path from "path";
import fs   from "fs/promises";

import Document, { PROCESSING_STATUS } from "../models/document.model.mjs";
import { Case }                        from "../models/case.model.mjs";
import Folder                          from "../models/folder.model.mjs";
import { dispatchIngestion }            from "../services/ingestion_dispatcher.mjs";
import { createEmbeddingService }       from "../services/embedding_factory.mjs";
import {
    getDocumentDirPath,
    getStoragePath,
    resolveAbsolutePath,
    ensureDir,
} from "../utils/storage.utils.mjs";
import logger from "../config/logger.mjs";

// ─── Embedding singleton (shared across embedText calls) ───────────────────────
let _embeddingService = null;

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Asserts that the requesting user has access to the given case.
 * Returns { kase, accessLevel } or null if denied.
 */
async function resolveCaseAccess(caseId, reqUser) {
    const kase = await Case.findById(caseId);
    if (!kase) return null;

    if (reqUser.role === "ADMIN") return { kase, accessLevel: "ADMIN" };

    const accessLevel = await Case.getLawyerAccessLevel(caseId, reqUser.id);
    if (!accessLevel) return null;

    return { kase, accessLevel };
}

// ─── Embed Text ────────────────────────────────────────────────────────────────

/**
 * POST /api/documents/embed
 * Body: { texts, mode? }
 *
 * Computes embedding vectors for a list of text strings using the configured
 * embedding service. No case or document scoping — pure computation.
 *
 * Fields:
 *   texts  {string[]}  Required. Array of strings to embed (1–100 items).
 *   mode   {string}    Optional. "RETRIEVAL_DOCUMENT" | "QUESTION_ANSWERING"
 *                      RETRIEVAL_DOCUMENT — for content being indexed (default).
 *                      QUESTION_ANSWERING — for search / query inputs.
 *
 * Response 200:
 *   {
 *     embeddings: number[][],   // one vector per input string, same order
 *     count:      number,       // number of embeddings returned
 *     dimensions: number,       // vector length (e.g. 768)
 *     mode:       string
 *   }
 */
export const embedText = async (req, res) => {
    try {
        const { texts, mode = "RETRIEVAL_DOCUMENT" } = req.body;

        // Validate input is a non-empty array of strings
        if (!Array.isArray(texts) || texts.length === 0) {
            return res.status(400).json({ error: "texts must be a non-empty array of strings." });
        }
        if (texts.length > 100) {
            return res.status(400).json({ error: "texts array must not exceed 100 items per request." });
        }

        const trimmed = texts.map((t, i) => {
            if (typeof t !== "string" || !t.trim()) {
                throw Object.assign(new Error(`texts[${i}] is empty or not a string.`), { status: 400 });
            }
            return t.trim();
        });

        const validModes = ["RETRIEVAL_DOCUMENT", "QUESTION_ANSWERING"];
        const resolvedMode = validModes.includes(mode) ? mode : "RETRIEVAL_DOCUMENT";
        // embed() second arg: true = QUESTION_ANSWERING, false = RETRIEVAL_DOCUMENT
        const isQuery = resolvedMode === "QUESTION_ANSWERING";

        // Lazy-init the shared embedding singleton
        if (!_embeddingService) {
            _embeddingService = await createEmbeddingService();
        }

        const vectors = await _embeddingService.embed(trimmed, isQuery);

        logger.debug({
            type: "doc", op: "embedText",
            uid: req.user?.id, count: vectors.length,
            dims: vectors[0]?.length, mode: resolvedMode,
        });

        return res.status(200).json({
            embeddings: vectors,
            count:      vectors.length,
            dimensions: vectors[0]?.length ?? 0,
            mode:       resolvedMode,
        });

    } catch (err) {
        if (err.status === 400) {
            return res.status(400).json({ error: err.message });
        }
        logger.error({ type: "doc", op: "embedText", uid: req.user?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
    }
};


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
            return res.status(400).json({ error: "caseId is required." });
        }

        if (!req.file) {
            return res.status(400).json({ error: "No file provided. Use field name \"document\"." });
        }

        // ── Access check — EDIT or ADMIN required to upload ───────────────────
        const access = await resolveCaseAccess(caseId, req.user);
        if (!access) {
            return res.status(404).json({ error: "Case not found or access denied." });
        }
        if (access.accessLevel === "VIEW") {
            return res.status(403).json({ error: "VIEW access is insufficient. EDIT or ADMIN required to upload documents." });
        }

        // ── Validate folderId belongs to this case ────────────────────────────
        if (folderId) {
            const folder = await Folder.findById(folderId);
            if (!folder || folder.caseId !== caseId) {
                return res.status(400).json({ error: "folderId does not belong to this case." });
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

        // ── Dispatch ingestion job (method controlled by DOC_INGESTION_METHOD) ──
        const { jobId, completed } = await dispatchIngestion({
            documentId: doc.id,
            filePath:   finalFilePath,
            mimeType:   req.file.mimetype,
            caseId,
        });

        const httpStatus     = completed ? 200 : 202;
        const statusResponse = completed ? PROCESSING_STATUS.DONE : PROCESSING_STATUS.PENDING;
        const message        = completed
            ? "Document uploaded and ingested successfully."
            : "Document uploaded successfully. Ingestion has started in the background.";

        return res.status(httpStatus).json({
            message,
            documentId: doc.id,
            ...(jobId && { jobId }),
            status: statusResponse,
        });

    } catch (err) {
        // If the error occurred before fs.rename, the temp file may still exist
        if (tempFilePath) {
            fs.unlink(tempFilePath).catch(() => {});
        }

        // Multer file-filter errors arrive here with a non-5xx intent
        if (err.message?.startsWith("Unsupported file type")) {
            return res.status(400).json({ error: err.message });
        }

        logger.error({ type: "doc", op: "uploadDocument", uid: req.user?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
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
            return res.status(400).json({ error: "caseId query parameter is required." });
        }

        const access = await resolveCaseAccess(caseId, req.user);
        if (!access) {
            return res.status(404).json({ error: "Case not found or access denied." });
        }

        const limit  = Math.min(parseInt(req.query.limit)  || 20, 100);
        const offset = Math.max(parseInt(req.query.offset) || 0,  0);

        // "null" string from query param → JS null (root); undefined → all folders
        const folderId = rawFolderId === "null"
            ? null
            : rawFolderId ?? undefined;

        const { documents, total } = await Document.findByCaseId(caseId, { limit, offset, folderId });

        return res.status(200).json({ data: documents, total, limit, offset });

    } catch (err) {
        logger.error({ type: "doc", op: "getDocuments", caseId: req.query?.caseId, uid: req.user?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
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
            return res.status(404).json({ error: "Document not found." });
        }

        const access = await resolveCaseAccess(doc.caseId, req.user);
        if (!access) {
            return res.status(403).json({ error: "Access denied." });
        }

        return res.status(200).json({ document: doc });

    } catch (err) {
        logger.error({ type: "doc", op: "getDocumentById", docId: req.params?.id, uid: req.user?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * GET /api/documents/:id/chunks
 * Returns all extracted chunks for a given document.
 */
export const getDocumentChunks = async (req, res) => {
    try {
        const doc = await Document.findById(req.params.id);
        if (!doc) {
            return res.status(404).json({ error: "Document not found." });
        }

        const access = await resolveCaseAccess(doc.caseId, req.user);
        if (!access) {
            return res.status(403).json({ error: "Access denied." });
        }

        const chunks = await Document.getChunksByDocumentId(doc.id);
        return res.status(200).json({ chunks });

    } catch (err) {
        logger.error({ type: "doc", op: "getDocumentChunks", docId: req.params?.id, uid: req.user?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
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
            return res.status(404).json({ error: "Document not found." });
        }

        // Access check
        const access = await resolveCaseAccess(doc.caseId, req.user);
        if (!access) {
            return res.status(403).json({ error: "Access denied." });
        }
        if (access.accessLevel === "VIEW") {
            return res.status(403).json({ error: "VIEW access is insufficient. EDIT or ADMIN required to delete documents." });
        }

        // Delete file from disk (non-fatal if already missing)
        const absPath = resolveAbsolutePath(doc.storagePath);
        await fs.unlink(absPath).catch((e) => {
            logger.warn({ type: "doc", op: "deleteDocument", event: "disk_cleanup_failed", docId: req.params?.id, path: absPath, err: e.message });
        });

        // Delete DB record — doc_chunks cascade via FK
        await Document.deleteById(req.params.id);

        return res.status(200).json({ message: "Document deleted successfully." });

    } catch (err) {
        logger.error({ type: "doc", op: "deleteDocument", docId: req.params?.id, uid: req.user?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
    }
};
