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

import { redisConnection } from "../config/redis.mjs";
import { DOC_INGESTION_QUEUE } from "../config/queue.mjs";
import DocIngestionService from "../services/doc_ingestion_service.mjs";
import logger, { closeLogger } from "../config/logger.mjs";

// ── Worker Instance ────────────────────────────────────────────────────────────
const worker = new Worker(
    DOC_INGESTION_QUEUE,

    // Processor function — BullMQ calls this for every job
    async (job) => {
        await DocIngestionService.process(job);
    },

    {
        connection: redisConnection,
        concurrency: 2,         // max simultaneous ingestion jobs
        limiter: {
            max: 10,       // max 10 jobs per...
            duration: 60_000,   // ...60 seconds (rate limit against Google API quota)
        },
    },
);

// ── Event Listeners (for observability) ───────────────────────────────────────
worker.on("completed", (job) => {
    logger.info({ type: "job", queue: DOC_INGESTION_QUEUE, jobId: job.id, event: "completed", docId: job.data.documentId });
});

worker.on("failed", (job, err) => {
    logger.error({ type: "job", queue: DOC_INGESTION_QUEUE, jobId: job?.id, event: "failed", attempt: job?.attemptsMade, err: err.message });
});

worker.on("progress", (job, progress) => {
    logger.debug({ type: "job", queue: DOC_INGESTION_QUEUE, jobId: job.id, event: "progress", pct: progress });
});

worker.on("error", (err) => {
    logger.error({ type: "job", queue: DOC_INGESTION_QUEUE, event: "worker_error", err: err.message });
});

logger.info({ type: "server", event: "start", queue: DOC_INGESTION_QUEUE, concurrency: 2 });

// ── Graceful Shutdown ──────────────────────────────────────────────────────────
async function shutdown(signal) {
    logger.info({ type: "server", event: "shutdown", signal, queue: DOC_INGESTION_QUEUE });
    await worker.close();
    await closeLogger();
    process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
