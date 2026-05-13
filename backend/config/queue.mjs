/**
 * BullMQ Queues
 *
 * doc-ingestion     — PDF/DOCX RAG processing jobs (submitted by upload controller).
 * event-reminders   — Delayed notification jobs for personal calendar reminders.
 *                     Each job is scheduled with a `delay` equal to the time
 *                     remaining until (start_time - remind_before_minutes).
 *                     The worker (workers/event_reminder.worker.mjs) is a
 *                     SEPARATE process — it does NOT import from this file.
 */

import { Queue } from "bullmq";
import { redisConnection } from "./redis.mjs";

// ─── Document Ingestion ───────────────────────────────────────────────────────

export const DOC_INGESTION_QUEUE = "doc-ingestion";

export const docIngestionQueue = new Queue(DOC_INGESTION_QUEUE, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type:  "exponential",
            delay: 5000,   // 5s → 25s → 125s between retries
        },
        removeOnComplete: { count: 100 }, // keep last 100 completed for debugging
        removeOnFail:     false,          // keep ALL failed jobs for inspection
    },
});

docIngestionQueue.on("error", (err) => {
    console.error("[Queue] doc-ingestion error:", err.message);
});

// ─── Event Reminders ─────────────────────────────────────────────────────────

export const EVENT_REMINDER_QUEUE = "event-reminders";

export const eventReminderQueue = new Queue(EVENT_REMINDER_QUEUE, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: "fixed", delay: 10_000 },
        removeOnComplete: { count: 50 },
        removeOnFail:     false,
    },
});

eventReminderQueue.on("error", (err) => {
    console.error("[Queue] event-reminders error:", err.message);
});
