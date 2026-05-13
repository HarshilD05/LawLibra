/**
 * EmbeddingService
 * Wraps Google text-embedding-004 (768-dim) with correct task types per use case.
 *
 * Google"s embedding API optimises vector geometry depending on task type.
 * For a RAG pipeline two different task types are required:
 *
 *   RETRIEVAL_DOCUMENT — chunks stored in the vector DB during ingestion.
 *                        Optimised so stored vectors are retrievable by queries.
 *
 *   QUESTION_ANSWERING — the user"s chat / Q&A query at runtime.
 *                        Optimised for finding documents that answer the question.
 *
 * These task types MUST match at both index and query time or recall degrades.
 * LangChain"s GoogleGenerativeAIEmbeddings bakes taskType into the instance, so
 * we keep two separate instances rather than one shared one.
 *
 * Designed for zero-friction swap to local nomic-embed-text via Ollama —
 * both output 768 dimensions, so no schema migration is needed.
 */

import { GoogleGenAI } from "@google/genai";
import logger from "../config/logger.mjs";

const EXPECTED_DIMS = 768;
const EMBEDDING_BATCH_SIZE = parseInt(process.env.EMBEDDING_BATCH_SIZE || "100", 10);
const MODEL_NAME    = "gemini-embedding-2-preview";

// Task type string constants as defined by the Google Gemini Embeddings API.
// See: https://ai.google.dev/gemini-api/docs/embeddings#supported-task-types
const TASK_RETRIEVAL_DOCUMENT = "RETRIEVAL_DOCUMENT";
const TASK_QUESTION_ANSWERING = "QUESTION_ANSWERING";

class EmbeddingService {
    constructor() {
        if (!process.env.GOOGLE_EMBEDDING_API_KEY) {
            throw new Error("[EmbeddingService] GOOGLE_EMBEDDING_API_KEY is not set in .env");
        }

        // Initialize the new Google GenAI client
        this.ai = new GoogleGenAI({
            apiKey: process.env.GOOGLE_EMBEDDING_API_KEY,
        });

        logger.info({ type: "embed", event: "init", provider: "google", model: MODEL_NAME, dims: EXPECTED_DIMS });
    }

    /**
     * Embed an array of texts.
     * @param {string[]} texts
     * @param {boolean} isQuery - Determines taskType: true -> QUESTION_ANSWERING, false -> RETRIEVAL_DOCUMENT
     * @returns {Promise<number[][]>} Array of 768-dimensional vectors
     */
    async embed(texts, isQuery = false) {
        if (!Array.isArray(texts) || texts.length === 0) {
            throw new Error("[EmbeddingService] embed: texts must be a non-empty array");
        }

        const valid = texts.filter(t => typeof t === "string" && t.trim());
        if (valid.length !== texts.length) {
            logger.warn({ type: "embed", event: "skipped_empty", provider: "google", skipped: texts.length - valid.length });
        }

        const taskType = isQuery ? TASK_QUESTION_ANSWERING : TASK_RETRIEVAL_DOCUMENT;
        logger.debug({ type: "embed", event: "batch_start", provider: "google", count: valid.length, taskType });

        try {
            // Google"s batchEmbedContents typically limits requests to 100 chunks at a time.
            // We batch the chunks to avoid hitting payload or batch size limits.
            const vectors = [];
            
            for (let i = 0; i < valid.length; i += EMBEDDING_BATCH_SIZE) {
                const batch = valid.slice(i, i + EMBEDDING_BATCH_SIZE);
                logger.debug({ type: "embed", event: "sub_batch", provider: "google", batch: Math.floor(i / EMBEDDING_BATCH_SIZE) + 1, size: batch.length });
                
                let attempt = 0;
                let response = null;
                while (attempt < 2) {
                    try {
                        response = await this.ai.models.embedContent({
                            model: MODEL_NAME,
                            contents: batch,
                            config: {
                                taskType: taskType,
                                outputDimensionality: EXPECTED_DIMS
                            }
                        });
                        break; // Success, exit retry loop
                    } catch (err) {
                        const isRateLimit = err.status === 429 || (err.message && err.message.includes('429'));
                        if (isRateLimit && attempt === 0) {
                            attempt++;
                            const retryDelay = parseInt(process.env.EMBEDDING_RETRY_DELAY_MS || "65000", 10);
                            logger.warn({ type: "embed", event: "rate_limit", provider: "google", retryDelayMs: retryDelay });
                            await new Promise(resolve => setTimeout(resolve, retryDelay));
                        } else {
                            throw err;
                        }
                    }
                }
                
                const batchVectors = response.embeddings?.map(e => e.values) || [];
                
                const batchLooksInvalid =
                    !Array.isArray(batchVectors) ||
                    batchVectors.length !== batch.length ||
                    batchVectors.some((v) => !Array.isArray(v) || v.length === 0);

                if (batchLooksInvalid) {
                    throw new Error(`Sub-batch ${Math.floor(i / EMBEDDING_BATCH_SIZE) + 1} returned invalid/empty vectors`);
                }
                
                vectors.push(...batchVectors);
            }

            vectors.forEach((v, i) => this._validateDims(v, `batch[${i}]`));
            logger.debug({ type: "embed", event: "batch_done", provider: "google", count: vectors.length });
            return vectors;

        } catch (err) {
            logger.warn({ type: "embed", event: "batch_fallback", provider: "google", err: err.message });
            return await this._embedOneByOne(valid, taskType, err);
        }
    }

    // ─── Private Helpers ─────────────────────────────────────────────────────────

    _validateDims(vector, label) {
        if (!Array.isArray(vector) || vector.length !== EXPECTED_DIMS) {
            throw new Error(
                `[EmbeddingService] ${label}: expected ${EXPECTED_DIMS} dims, got ${vector?.length ?? "invalid"}`,
            );
        }
    }

    /**
     * Fallback: embed documents one-by-one using single embedContent calls
     * when the batch API fails or returns empty vectors.
     */
    async _embedOneByOne(texts, taskType, batchError = null) {
        try {
            const vectors = [];
            for (let i = 0; i < texts.length; i++) {
                const response = await this.ai.models.embedContent({
                    model: MODEL_NAME,
                    contents: texts[i],
                    config: {
                        taskType: taskType,
                        outputDimensionality: EXPECTED_DIMS
                    }
                });
                const v = response.embeddings[0].values;
                this._validateDims(v, `fallback[${i}]`);
                vectors.push(v);
            }

            logger.debug({ type: "embed", event: "fallback_done", provider: "google", count: vectors.length });
            return vectors;

        } catch (fallbackErr) {
            throw new Error(
                `[EmbeddingService] Embedding failed completely. ` +
                `Batch error: ${batchError?.message || "none"}. ` +
                `Fallback error: ${fallbackErr.message}. ` +
                `Check GOOGLE_EMBEDDING_API_KEY, model availability, API restrictions, and quota in Google AI Studio.`,
            );
        }
    }

    getModelInfo() {
        return {
            provider:        "Google Generative AI",
            model:           MODEL_NAME,
            dimensions:      EXPECTED_DIMS,
            docTaskType:     TASK_RETRIEVAL_DOCUMENT,
            queryTaskType:   TASK_QUESTION_ANSWERING,
        };
    }
}

export default EmbeddingService;
