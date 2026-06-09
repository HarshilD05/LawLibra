/**
 * Documents Router
 *
 * All routes require a valid JWT (authenticate middleware applied globally).
 *
 * POST   /api/documents/embed           — Compute embedding vector for arbitrary text
 * POST   /api/documents/upload          — Upload a document (multipart/form-data)
 * GET    /api/documents?caseId=&...     — List documents for a case
 * GET    /api/documents/:id             — Get a single document + processing status
 * GET    /api/documents/:id/chunks      — Get all extracted chunks for a document
 * DELETE /api/documents/:id             — Delete document (file + DB + chunks)
 */

import { Router }         from "express";
import { authenticate }   from "../middleware/auth.middleware.mjs";
import { documentUpload } from "../config/multer.mjs";
import {
    uploadDocument,
    getDocuments,
    getDocumentById,
    getDocumentChunks,
    deleteDocument,
    embedText,
} from "../controllers/document.controller.mjs";

const router = Router();

// All document routes require authentication
router.use(authenticate);

// ── Embedding utility (declared before /:id to avoid param collision)
router.post("/embed", embedText);

// POST /api/documents/upload
// "document" is the expected multipart field name for the file
router.post("/upload", documentUpload.single("document"), uploadDocument);

// GET /api/documents?caseId=<id>&folderId=<id|null>&limit=&offset=
router.get("/", getDocuments);

// GET /api/documents/:id
router.get("/:id", getDocumentById);

// GET /api/documents/:id/chunks
router.get("/:id/chunks", getDocumentChunks);

// DELETE /api/documents/:id
router.delete("/:id", deleteDocument);

export default router;
