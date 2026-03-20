/**
 * Document Ingestion Worker — Separate Process
 *
 * Run this as an independent Node.js process:
 *   npm run worker
 *
 * It connects to the same Redis + PostgreSQL as the HTTP server but runs
 * entirely independently. A crash here NEVER affects the HTTP server.
 *
 * Concurrency is set to 2: process up to 2 documents simultaneously.
 * Raise this only after profiling memory usage on large PDFs.
 *
 * Graceful shutdown:
 *   On SIGTERM/SIGINT the worker stops accepting new jobs, waits for the
 *   currently running jobs to finish, then exits cleanly.
 */

import "dotenv/config";
import { Worker } from "bullmq";

import { redisConnection }   from "../config/redis.mjs";
import { DOC_INGESTION_QUEUE } from "../config/queue.mjs";
import DocIngestionService   from "../services/doc_ingestion_service.mjs";

// ── Worker Instance ────────────────────────────────────────────────────────────
const worker = new Worker(
    DOC_INGESTION_QUEUE,

    // Processor function — BullMQ calls this for every job
    async (job) => {
        await DocIngestionService.process(job);
    },

    {
        connection:  redisConnection,
        concurrency: 2,         // max simultaneous ingestion jobs
        limiter: {
            max:      10,       // max 10 jobs per...
            duration: 60_000,   // ...60 seconds (rate limit against Google API quota)
        },
    },
);

// ── Event Listeners (for observability) ───────────────────────────────────────
worker.on("completed", (job) => {
    console.log(`[Worker] ✓ Job ${job.id} completed (document: ${job.data.documentId})`);
});

worker.on("failed", (job, err) => {
    const attempts = job?.attemptsMade ?? "?";
    console.error(`[Worker] ✗ Job ${job?.id} failed (attempt ${attempts}): ${err.message}`);
});

worker.on("progress", (job, progress) => {
    console.log(`[Worker] Job ${job.id} progress: ${progress}%`);
});

worker.on("error", (err) => {
    // Emitted for worker-level errors (Redis disconnect, etc.), not job failures
    console.error("[Worker] Worker error:", err.message);
});

console.log(`[Worker] Started. Listening on queue "${DOC_INGESTION_QUEUE}" (concurrency: 2)`);

// ── Graceful Shutdown ──────────────────────────────────────────────────────────
async function shutdown(signal) {
    console.log(`\n[Worker] ${signal} received — shutting down gracefully...`);
    await worker.close(); // stop accepting new jobs, wait for active jobs to finish
    console.log("[Worker] All active jobs finished. Exiting.");
    process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
