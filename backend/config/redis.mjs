/**
 * Shared ioredis connection for BullMQ.
 *
 * BullMQ requires `maxRetriesPerRequest: null` — without it, ioredis will
 * throw when a command times out instead of letting BullMQ manage retries.
 *
 * Import this singleton in both the queue producer (config/queue.mjs) and
 * the worker process (workers/doc_ingestion.worker.mjs) so they share the
 * same connection config, but each process gets its own TCP connection.
 */

import { Redis } from "ioredis";
import "dotenv/config";

export const redisConnection = new Redis({
    host:     process.env.REDIS_HOST     || "localhost",
    port:     parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // required by BullMQ — do NOT remove
});

redisConnection.on("error", (err) => {
    console.error("[Redis] Connection error:", err.message);
});

redisConnection.on("connect", () => {
    console.log(`[Redis] Connected to ${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || 6379}`);
});
