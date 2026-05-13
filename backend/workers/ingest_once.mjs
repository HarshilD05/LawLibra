/**
 * One-shot Document Ingestion Worker
 *
 * Spawned as an independent child process by the ingestion dispatcher when
 * DOC_INGESTION_METHOD=spawn. Receives job data via IPC, runs the full
 * DocIngestionService pipeline, then exits cleanly — no Redis or BullMQ needed.
 *
 * Do NOT run this file directly. It is invoked via child_process.fork() only.
 */

import "dotenv/config";
import DocIngestionService from "../services/doc_ingestion_service.mjs";
import logger from "../config/logger.mjs";

// Safety net: exit if the parent never sends a message (e.g. IPC setup error)
const timeout = setTimeout(() => {
    logger.error({ type: "worker", worker: "ingest_once", event: "ipc_timeout", msg: "Timed out waiting for job data. Exiting." });
    process.exit(1);
}, 30_000);

process.on("message", async ({ documentId, filePath, mimeType }) => {
    clearTimeout(timeout);

    const job = {
        id:             `spawn-${process.pid}`,
        data:           { documentId, filePath, mimeType },
        updateProgress: async () => {}, // no-op shim for BullMQ progress calls
    };

    try {
        await DocIngestionService.process(job);
        logger.info({ type: "worker", worker: "ingest_once", event: "job_success", documentId });
        process.exit(0);
    } catch (err) {
        logger.error({ type: "worker", worker: "ingest_once", event: "job_failed", documentId, err: err.message });
        process.exit(1);
    }
});
