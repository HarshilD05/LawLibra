/**
 * Event Reminder Worker — Separate Process
 *
 * Run alongside the HTTP server:
 *   npm run worker:reminders
 *
 * Each job is a delayed BullMQ job scheduled by the event controller when an
 * event with `remind_before_minutes` is created or updated. The job fires at:
 *
 *   fire_at = start_time - remind_before_minutes * 60 * 1000
 *
 * When the delay elapses, this worker inserts an EVENT_REMINDER notification
 * for the event owner.
 *
 * Job payload shape:
 *   {
 *     userId:    string,  // notification recipient
 *     eventId:   string,
 *     eventName: string,
 *     eventType: string,  // HEARING | DEADLINE | MEETING | REMINDER
 *     startTime: string,  // ISO 8601
 *   }
 */

import "dotenv/config";
import { Worker } from "bullmq";

import { redisConnection }    from "../config/redis.mjs";
import { EVENT_REMINDER_QUEUE } from "../config/queue.mjs";
import Notification           from "../models/notification.model.mjs";

const worker = new Worker(
    EVENT_REMINDER_QUEUE,

    async (job) => {
        const { userId, eventId, eventName, eventType, startTime } = job.data;

        await Notification.create({
            userId,
            notificationType: "EVENT_REMINDER",
            entityType:       "EVENT",
            msg:              `Reminder: "${eventName}" starts at ${new Date(startTime).toLocaleString()}.`,
            metadata: {
                event_id:   eventId,
                event_name: eventName,
                event_type: eventType,
                start_time: startTime,
                action_url: `/events/${eventId}`,
            },
        });
    },

    {
        connection: redisConnection,
        concurrency: 5,
    },
);

// ── Event Listeners ────────────────────────────────────────────────────────────

worker.on("completed", (job) => {
    console.log(`[ReminderWorker] ✓ Reminder sent for event ${job.data.eventId} (job: ${job.id})`);
});

worker.on("failed", (job, err) => {
    console.error(`[ReminderWorker] ✗ Job ${job?.id} failed: ${err.message}`);
});

worker.on("error", (err) => {
    console.error("[ReminderWorker] Worker error:", err.message);
});

console.log(`[ReminderWorker] Started. Listening on queue "${EVENT_REMINDER_QUEUE}"`);

// ── Graceful Shutdown ──────────────────────────────────────────────────────────
async function shutdown(signal) {
    console.log(`\n[ReminderWorker] ${signal} received — shutting down gracefully...`);
    await worker.close();
    console.log("[ReminderWorker] Done. Exiting.");
    process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
