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

import path         from "path";
import { fork }     from "child_process";
import { fileURLToPath } from "url";
import logger           from "../config/logger.mjs";

import DocIngestionService from "./doc_ingestion_service.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const METHOD    = (process.env.DOC_INGESTION_METHOD || "sync").toLowerCase();

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
        case "bullmq": {
            // Lazily imported — Redis is only initialised when this mode is active
            const { docIngestionQueue } = await import("../config/queue.mjs");
            const job = await docIngestionQueue.add("ingest", {
                documentId, filePath, mimeType, caseId,
            });
            logger.info({ type: "dispatch", method: "bullmq", event: "enqueued", jobId: String(job.id), docId: documentId });
            return { jobId: String(job.id), completed: false };
        }

        // ── Spawn (one-shot child process) ──────────────────────────────────────
        case "spawn": {
            const workerPath = path.resolve(__dirname, "../workers/ingest_once.mjs");
            const child = fork(workerPath, [], {
                env:      { ...process.env },
                execArgv: [], // do NOT inherit --watch or other parent flags
            });

            child.send({ documentId, filePath, mimeType });

            child.on("exit", (code) => {
                if (code !== 0) {
                    logger.warn({ type: "dispatch", method: "spawn", event: "child_exit", code, docId: documentId, pid: child.pid });
                }
            });

            child.on("error", (err) => {
                logger.error({ type: "dispatch", method: "spawn", event: "fork_error", docId: documentId, err: err.message });
            });

            const jobId = `spawn-${child.pid}`;
            logger.info({ type: "dispatch", method: "spawn", event: "forked", jobId, docId: documentId, pid: child.pid });
            return { jobId, completed: false };
        }

        // ── Sync (inline, blocking) ─────────────────────────────────────────────
        case "sync":
        default: {
            logger.info({ type: "dispatch", method: "sync", event: "start", docId: documentId });
            const job = makeJobShim(documentId, filePath, mimeType);
            await DocIngestionService.process(job); // throws on failure — caught by controller
            return { jobId: null, completed: true };
        }
    }
}
