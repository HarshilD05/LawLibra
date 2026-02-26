/**
 * Multer Configuration
 *
 * Multer saves the uploaded file to a TEMP directory first (uploads/tmp).
 * The upload controller is responsible for:
 *   1. Validating caseId / folderId from req.body
 *   2. Moving the file to its final destination (data/<caseId>/<folderId>/)
 *   3. Cleaning up the temp file if anything fails after the move
 *
 * This separation keeps multer config simple and ensures the file's final
 * location is determined by the controller (which has full request context),
 * not by the multer middleware (which runs before body validation).
 *
 * File size limit: 50 MB
 * Accepted types: PDF, DOCX, DOC, TXT
 */

import multer from 'multer';
import path   from 'path';
import fs     from 'fs';
import { randomUUID } from 'crypto';

const UPLOAD_TEMP_DIR = process.env.UPLOAD_TEMP_DIR || 'uploads/tmp';

// Ensure the temp directory exists at module load time (synchronous is fine here)
fs.mkdirSync(path.resolve(UPLOAD_TEMP_DIR), { recursive: true });

// ─── Accepted MIME types ───────────────────────────────────────────────────────
const ACCEPTED_MIME_TYPES = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword',                                                       // .doc
    'text/plain',
]);

// ─── Storage engine ────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, path.resolve(UPLOAD_TEMP_DIR));
    },
    filename: (_req, file, cb) => {
        // Use a UUID filename to avoid collisions.
        // Original filename is preserved in req.file.originalname.
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${randomUUID()}${ext}`);
    },
});

// ─── Multer instance ───────────────────────────────────────────────────────────
export const documentUpload = multer({
    storage,
    limits: {
        fileSize: 200 * 1024 * 1024, // 200 MB
    },
    fileFilter: (_req, file, cb) => {
        if (ACCEPTED_MIME_TYPES.has(file.mimetype)) {
            cb(null, true);
        } else {
            // Passing an error to cb rejects the upload with a 400-friendly message
            cb(new Error(`Unsupported file type: ${file.mimetype}. Accepted: PDF, DOCX, DOC, TXT`));
        }
    },
});
