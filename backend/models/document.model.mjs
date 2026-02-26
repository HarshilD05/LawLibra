/**
 * Document Model
 *
 * Handles all DB operations for the `documents` and `doc_chunks` tables.
 * `doc_chunks` writes are tightly coupled to document lifecycle so they live
 * here rather than a separate model.
 *
 * Processing status lifecycle:
 *   PENDING → (worker picks up) → PROCESSING → DONE
 *                                            → FAILED  (error stored in processing_error)
 */

import db from '../config/db.mjs';

// ─── Job Status Constants ──────────────────────────────────────────────────────
export const PROCESSING_STATUS = {
    PENDING:    'PENDING',
    PROCESSING: 'PROCESSING',
    DONE:       'DONE',
    FAILED:     'FAILED',
};

// ─── Document Class ────────────────────────────────────────────────────────────
class Document {
    constructor(row) {
        this.id               = row.id;
        this.caseId           = row.case_id;
        this.folderId         = row.folder_id;
        this.uploaderId       = row.uploader_id;
        this.fileName         = row.file_name;
        this.originalName     = row.original_name;
        this.storagePath      = row.storage_path;
        this.mimeType         = row.mime_type;
        this.fileSizeBytes    = row.file_size_bytes;
        this.pageCount        = row.page_count;
        this.processingStatus = row.processing_status;
        this.processingError  = row.processing_error;
        this.summary          = row.summary;
        this.docEmbedding     = row.doc_embedding;
        this.tags             = row.tags;
        this.createdAt        = row.created_at;
        this.updatedAt        = row.updated_at;
    }

    // ─── Create ─────────────────────────────────────────────────────────────────

    /**
     * Creates a new document record with status PENDING.
     * Called by the upload controller immediately after saving the file to disk.
     *
     * @param {{ caseId, folderId, uploaderId, fileName, originalName, storagePath, mimeType, fileSizeBytes }} data
     * @returns {Promise<Document>}
     */
    static async create({ caseId, folderId, uploaderId, fileName, originalName, storagePath, mimeType, fileSizeBytes }) {
        const { rows } = await db.query(
            `INSERT INTO documents
               (case_id, folder_id, uploader_id, file_name, original_name,
                storage_path, mime_type, file_size_bytes, processing_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING')
             RETURNING *`,
            [caseId, folderId ?? null, uploaderId, fileName, originalName, storagePath, mimeType, fileSizeBytes ?? null],
        );
        return new Document(rows[0]);
    }

    // ─── Read ────────────────────────────────────────────────────────────────────

    /**
     * Find a single document by its UUID. Returns null if not found.
     */
    static async findById(id) {
        const { rows } = await db.query(
            'SELECT * FROM documents WHERE id = $1',
            [id],
        );
        return rows[0] ? new Document(rows[0]) : null;
    }

    /**
     * List all documents belonging to a case with optional pagination.
     * Optionally filter to a specific folder (null = root of case).
     *
     * @param {string} caseId
     * @param {{ limit?: number, offset?: number, folderId?: string | null }} opts
     * @returns {Promise<{ documents: Document[], total: number }>}
     */
    static async findByCaseId(caseId, { limit = 20, offset = 0, folderId = undefined } = {}) {
        const conditions = ['case_id = $1'];
        const params     = [caseId];

        if (folderId !== undefined) {
            params.push(folderId);
            conditions.push(`folder_id ${folderId === null ? 'IS NULL' : `= $${params.length}`}`);
        }

        const where = conditions.join(' AND ');

        const [dataRes, countRes] = await Promise.all([
            db.query(
                `SELECT * FROM documents WHERE ${where}
                 ORDER BY created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limit, offset],
            ),
            db.query(`SELECT COUNT(*) FROM documents WHERE ${where}`, params),
        ]);

        return {
            documents: dataRes.rows.map(r => new Document(r)),
            total:     parseInt(countRes.rows[0].count, 10),
        };
    }

    // ─── Update ──────────────────────────────────────────────────────────────────

    /**
     * Update the processing status of a document.
     * Pass `error` string when status is FAILED.
     *
     * @param {string} id
     * @param {'PENDING'|'PROCESSING'|'DONE'|'FAILED'} status
     * @param {string|null} error
     */
    static async updateProcessingStatus(id, status, error = null) {
        await db.query(
            `UPDATE documents
             SET processing_status = $2,
                 processing_error  = $3,
                 updated_at        = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [id, status, error],
        );
    }

    /**
     * Store the LLM-generated summary, full-document embedding, and page count
     * after the ingestion pipeline finishes.
     *
     * @param {string}   id
     * @param {string}   summary       LLM summary text
     * @param {number[]} docEmbedding  768-dim vector for the whole document
     * @param {number}   pageCount     Total number of pages extracted
     */
    static async updateSummaryAndEmbedding(id, summary, docEmbedding, pageCount) {
        await db.query(
            `UPDATE documents
             SET summary       = $2,
                 doc_embedding = $3,
                 page_count    = $4,
                 updated_at    = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [id, summary, JSON.stringify(docEmbedding), pageCount],
        );
    }

    // ─── Chunk Operations ────────────────────────────────────────────────────────

    /**
     * Bulk-insert all embedded chunks for a document.
     * Runs in a single transaction for atomicity.
     *
     * Each chunk must have:
     *   { text, pageNo, keywords: string[], embedding: number[] }
     *
     * @param {string}   documentId
     * @param {Array}    chunks       Output of EmbeddingService.embedChunks()
     */
    static async insertChunks(documentId, chunks) {
        if (!chunks || chunks.length === 0) return;

        const client = await db.connect();
        try {
            await client.query('BEGIN');

            for (let i = 0; i < chunks.length; i++) {
                const { text, pageNo, keywords, embedding } = chunks[i];
                await client.query(
                    `INSERT INTO doc_chunks
                       (document_id, chunk_index, page_number, original_text, keywords, embedding)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        documentId,
                        i,
                        pageNo   ?? null,
                        text,
                        keywords ?? [],
                        JSON.stringify(embedding),
                    ],
                );
            }

            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    // ─── Delete ──────────────────────────────────────────────────────────────────

    /**
     * Delete a document and all its chunks (CASCADE handles chunks).
     * Also note: the calling layer should delete the file from disk separately.
     */
    static async deleteById(id) {
        const { rows } = await db.query(
            'DELETE FROM documents WHERE id = $1 RETURNING *',
            [id],
        );
        return rows[0] ? new Document(rows[0]) : null;
    }
}

export default Document;
