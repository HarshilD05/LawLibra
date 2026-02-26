/**
 * DocIngestionService
 *
 * Orchestrates the full document processing pipeline. Called exclusively by
 * the BullMQ worker (workers/doc_ingestion.worker.mjs) — never by the HTTP
 * server directly.
 *
 * Pipeline:
 *   1. Mark document PROCESSING in DB
 *   2. Extract page texts (pdfjs-dist / mammoth / txt)
 *   3. Clean, chunk, and extract TF-IDF keywords
 *   4. Generate 768-dim embeddings via Google text-embedding-004
 *   5. Bulk-insert chunks into doc_chunks
 *   6. Mark document DONE (+ store page count)
 *   7. Delete the raw uploaded file from disk
 *
 * On any error: marks document FAILED with the error message and re-throws
 * so BullMQ can apply its retry/backoff policy.
 */

import Document, { PROCESSING_STATUS } from '../models/document.model.mjs';
import DocumentProcessor              from './document_processor.mjs';
import DocumentUtils                  from './document_utils.mjs';
import EmbeddingService               from './embedding_service.mjs';

class DocIngestionService {
    /**
     * Main entry point called by the BullMQ worker.
     *
     * @param {import('bullmq').Job} job
     *   job.data must contain: { documentId, filePath, mimeType }
     */
    static async process(job) {
        const { documentId, filePath, mimeType } = job.data;

        // Validate job payload
        if (!documentId || !filePath || !mimeType) {
            throw new Error(`Invalid job payload: ${JSON.stringify(job.data)}`);
        }

        console.log(`[Ingestion] Starting job ${job.id} for document ${documentId}`);

        // ── Step 1: Mark as PROCESSING ──────────────────────────────────────────
        await Document.updateProcessingStatus(documentId, PROCESSING_STATUS.PROCESSING);
        await job.updateProgress(5);

        try {
            // ── Step 2: Extract page texts ────────────────────────────────────────
            console.log(`[Ingestion] Extracting text from ${filePath} (${mimeType})`);
            const pageTexts = await DocumentProcessor.extractPageTexts(filePath, mimeType);
            await job.updateProgress(30);

            if (!pageTexts || pageTexts.length === 0) {
                throw new Error('No text could be extracted from the document.');
            }

            const pageCount = pageTexts.length;

            // ── Step 3: Clean + Chunk + TF-IDF keywords ───────────────────────────
            console.log(`[Ingestion] Processing ${pageCount} pages into chunks`);
            const chunks = await DocumentUtils.processDocument(pageTexts);
            await job.updateProgress(50);

            if (!chunks || chunks.length === 0) {
                throw new Error('Document produced no chunks after processing.');
            }

            // ── Step 4: Generate embeddings ───────────────────────────────────────
            console.log(`[Ingestion] Embedding ${chunks.length} chunks`);
            const embeddingService = new EmbeddingService();
            const embeddedChunks   = await embeddingService.embedChunks(chunks);
            await job.updateProgress(80);

            // ── Step 5: Store chunks in DB ────────────────────────────────────────
            console.log(`[Ingestion] Storing ${embeddedChunks.length} chunks in DB`);
            await Document.insertChunks(documentId, embeddedChunks);
            await job.updateProgress(95);

            // ── Step 6: Mark DONE + save page count ───────────────────────────────
            await Document.updateProcessingStatus(documentId, PROCESSING_STATUS.DONE);
            await db_updatePageCount(documentId, pageCount);
            await job.updateProgress(100);

            console.log(`[Ingestion] Job ${job.id} complete. ${embeddedChunks.length} chunks stored.`);

        } catch (err) {
            // Mark failed BEFORE re-throwing so the DB reflects the failure even
            // if BullMQ is about to retry (status will flip back to PROCESSING on
            // next attempt via step 1 above).
            console.error(`[Ingestion] Job ${job.id} failed:`, err.message);
            await Document.updateProcessingStatus(
                documentId,
                PROCESSING_STATUS.FAILED,
                err.message,
            ).catch(() => {}); // don't mask the original error

            throw err; // re-throw so BullMQ applies retry/backoff

        }
        // NOTE: The file at filePath is in its FINAL destination (data/<caseId>/<folderId>/).
        // It is NOT deleted after ingestion — it stays on disk for future downloads.
        // Deletion only happens via the DELETE /api/documents/:id endpoint.
    }
}

/**
 * Small helper to update only the page_count field.
 * Avoids touching summary/embedding which aren't ready yet at this stage.
 */
async function db_updatePageCount(documentId, pageCount) {
    const db = (await import('../config/db.mjs')).default;
    await db.query(
        'UPDATE documents SET page_count = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [documentId, pageCount],
    );
}

export default DocIngestionService;
