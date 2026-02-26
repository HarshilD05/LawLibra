/**
 * BullMQ Queue — Document Ingestion
 *
 * This module exports the named queue used by the upload controller to submit
 * jobs and by QueueEvents listeners to monitor progress.
 *
 * The worker (workers/doc_ingestion.worker.mjs) is a SEPARATE process and
 * imports its own Worker instance — it does NOT import from this file.
 * Both sides share the same queue name so BullMQ routes jobs correctly.
 */

import { Queue } from 'bullmq';
import { redisConnection } from './redis.mjs';

export const DOC_INGESTION_QUEUE = 'doc-ingestion';

export const docIngestionQueue = new Queue(DOC_INGESTION_QUEUE, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type:  'exponential',
            delay: 5000,   // 5s → 25s → 125s between retries
        },
        removeOnComplete: { count: 100 }, // keep last 100 completed for debugging
        removeOnFail:     false,          // keep ALL failed jobs for inspection
    },
});

docIngestionQueue.on('error', (err) => {
    console.error('[Queue] doc-ingestion error:', err.message);
});
