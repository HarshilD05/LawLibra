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

// Safety net: exit if the parent never sends a message (e.g. IPC setup error)
const timeout = setTimeout(() => {
    console.error("[IngestOnce] Timed out waiting for job data. Exiting.");
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
        console.log(`[IngestOnce] Document ${documentId} processed successfully.`);
        process.exit(0);
    } catch (err) {
        console.error(`[IngestOnce] Failed for document ${documentId}:`, err.message);
        process.exit(1);
    }
});
