/**
 * Ingestion Dispatcher
 *
 * Routes document ingestion to one of three strategies based on the
 * DOC_INGESTION_METHOD environment variable:
 *
 *   bullmq  — Enqueue via BullMQ / Redis (requires Redis + a running worker process)
 *             Best for production: decoupled, retryable, rate-limited.
 *
 *   spawn   — Fork a one-shot child process per document (no Redis needed)
 *             Good for single-server setups without Redis.
 *             Non-blocking: HTTP server returns 202 immediately.
 *
 *   sync    — Run ingestion inline in the HTTP server process (no Redis, blocking)
 *             For local development / testing only. HTTP server returns 200 when done.
 *
 * Default: sync
 *
 * Redis / BullMQ are never imported unless DOC_INGESTION_METHOD=bullmq,
 * so you can run the server without Redis in all other modes.
 */

import path         from 'path';
import { fork }     from 'child_process';
import { fileURLToPath } from 'url';

import DocIngestionService from './doc_ingestion_service.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const METHOD    = (process.env.DOC_INGESTION_METHOD || 'sync').toLowerCase();

// ── Job shim ───────────────────────────────────────────────────────────────────

/**
 * Minimal BullMQ-compatible job object for non-queue modes.
 * DocIngestionService only uses job.id, job.data, and job.updateProgress().
 */
function makeJobShim(documentId, filePath, mimeType) {
    return {
        id:             `local-${Date.now()}`,
        data:           { documentId, filePath, mimeType },
        updateProgress: async () => {},
    };
}

// ── Dispatcher ─────────────────────────────────────────────────────────────────

/**
 * Dispatch a document ingestion job using the configured strategy.
 *
 * @param {{ documentId: string, filePath: string, mimeType: string, caseId: string }} payload
 * @returns {Promise<{ jobId: string | null, completed: boolean }>}
 *   - jobId:     queue / process identifier (null for sync mode)
 *   - completed: true only for sync mode, where ingestion finishes before returning
 */
export async function dispatchIngestion({ documentId, filePath, mimeType, caseId }) {
    switch (METHOD) {

        // ── BullMQ (Redis-backed queue) ─────────────────────────────────────────
        case 'bullmq': {
            // Lazily imported — Redis is only initialised when this mode is active
            const { docIngestionQueue } = await import('../config/queue.mjs');
            const job = await docIngestionQueue.add('ingest', {
                documentId, filePath, mimeType, caseId,
            });
            console.log(`[Dispatcher] Enqueued BullMQ job ${job.id} for document ${documentId}`);
            return { jobId: String(job.id), completed: false };
        }

        // ── Spawn (one-shot child process) ──────────────────────────────────────
        case 'spawn': {
            const workerPath = path.resolve(__dirname, '../workers/ingest_once.mjs');
            const child = fork(workerPath, [], {
                env:      { ...process.env },
                execArgv: [], // do NOT inherit --watch or other parent flags
            });

            child.send({ documentId, filePath, mimeType });

            child.on('exit', (code) => {
                if (code !== 0) {
                    console.error(
                        `[Dispatcher] ingest_once exited with code ${code} for document ${documentId}`,
                    );
                }
            });

            child.on('error', (err) => {
                console.error(`[Dispatcher] fork error for document ${documentId}:`, err.message);
            });

            const jobId = `spawn-${child.pid}`;
            console.log(`[Dispatcher] Forked child process ${child.pid} for document ${documentId}`);
            return { jobId, completed: false };
        }

        // ── Sync (inline, blocking) ─────────────────────────────────────────────
        case 'sync':
        default: {
            console.log(`[Dispatcher] Running sync ingestion for document ${documentId}`);
            const job = makeJobShim(documentId, filePath, mimeType);
            await DocIngestionService.process(job); // throws on failure — caught by controller
            return { jobId: null, completed: true };
        }
    }
}
