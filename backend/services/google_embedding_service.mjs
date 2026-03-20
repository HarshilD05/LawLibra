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

const EXPECTED_DIMS = 768;
const EMBEDDING_BATCH_SIZE = 100;
const MODEL_NAME    = "gemini-embedding-2-preview";

// Task type string constants as defined by the Google Gemini Embeddings API.
// See: https://ai.google.dev/gemini-api/docs/embeddings#supported-task-types
const TASK_RETRIEVAL_DOCUMENT = "RETRIEVAL_DOCUMENT";
const TASK_QUESTION_ANSWERING = "QUESTION_ANSWERING";

class EmbeddingService {
    constructor() {
        if (!process.env.GOOGLE_EMBEDDER_API_KEY) {
            throw new Error("[EmbeddingService] GOOGLE_EMBEDDER_API_KEY is not set in .env");
        }

        // Initialize the new Google GenAI client
        this.ai = new GoogleGenAI({
            apiKey: process.env.GOOGLE_EMBEDDER_API_KEY,
        });

        console.log(
            `[EmbeddingService] Initialized — ${MODEL_NAME} (${EXPECTED_DIMS} dims) ` +
            `| doc task: ${TASK_RETRIEVAL_DOCUMENT} | query task: ${TASK_QUESTION_ANSWERING}`,
        );
    }

    /**
     * Embed a single chat / Q&A query.
     * Uses QUESTION_ANSWERING task type — optimised for finding documents that answer the question.
     * @param {string} text
     * @returns {Promise<number[]>} 768-dimensional vector
     */
    async embedText(text) {
        if (!text?.trim()) throw new Error("[EmbeddingService] embedText: text must be a non-empty string");

        const response = await this.ai.models.embedContent({
            model: MODEL_NAME,
            contents: text,
            config: {
                taskType: TASK_QUESTION_ANSWERING,
                outputDimensionality: EXPECTED_DIMS
            }
        });
        
        const vector = response.embeddings[0].values;
        this._validateDims(vector, "embedText");
        return vector;
    }

    /**
     * Embed an array of document chunk texts in a single batched API call.
     * Uses RETRIEVAL_DOCUMENT task type — optimised for indexing into the vector DB.
     * @param {string[]} texts
     * @returns {Promise<number[][]>} Array of 768-dimensional vectors
     */
    async embedBatch(texts) {
        if (!Array.isArray(texts) || texts.length === 0) {
            throw new Error("[EmbeddingService] embedBatch: texts must be a non-empty array");
        }

        const valid = texts.filter(t => typeof t === "string" && t.trim());
        if (valid.length !== texts.length) {
            console.warn(`[EmbeddingService] embedBatch: skipped ${texts.length - valid.length} empty items`);
        }

        console.log(`[EmbeddingService] Embedding batch of ${valid.length} document chunks (${TASK_RETRIEVAL_DOCUMENT})...`);

        try {
            // Google"s batchEmbedContents typically limits requests to 100 chunks at a time.
            // We batch the chunks to avoid hitting payload or batch size limits.
            const vectors = [];
            
            for (let i = 0; i < valid.length; i += EMBEDDING_BATCH_SIZE) {
                const batch = valid.slice(i, i + EMBEDDING_BATCH_SIZE);
                console.log(`[EmbeddingService] Processing sub-batch ${Math.floor(i / EMBEDDING_BATCH_SIZE) + 1} (${batch.length} chunks)...`);
                
                const response = await this.ai.models.embedContent({
                    model: MODEL_NAME,
                    contents: batch,
                    config: {
                        taskType: TASK_RETRIEVAL_DOCUMENT,
                        outputDimensionality: EXPECTED_DIMS
                    }
                });
                
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
            console.log(`[EmbeddingService] Batch complete — ${vectors.length} vectors generated`);
            return vectors;

        } catch (err) {
            console.warn(
                `[EmbeddingService] embedDocuments failed (${err.message}). Falling back to per-text calls.`,
            );
            return await this._embedOneByOne(valid, err);
        }
    }

    /**
     * Attach embeddings to an array of chunk objects.
     * Extracts the "text" field, runs a single batch call, then merges back.
     * @param {Array<{text: string, [key: string]: any}>} chunks
     * @returns {Promise<Array<{embedding: number[], [key: string]: any}>>}
     */
    async embedChunks(chunks) {
        if (!Array.isArray(chunks) || chunks.length === 0) {
            throw new Error("[EmbeddingService] embedChunks: chunks must be a non-empty array");
        }

        const texts = chunks.map((c, i) => {
            if (!c.text?.trim()) throw new Error(`[EmbeddingService] chunk[${i}] has no valid text`);
            return c.text;
        });

        const vectors = await this.embedBatch(texts);

        return chunks.map((chunk, i) => ({ ...chunk, embedding: vectors[i] }));
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
     * Still uses RETRIEVAL_DOCUMENT task type (docEmbedder).
     */
    async _embedOneByOne(texts, batchError = null) {
        try {
            const vectors = [];
            for (let i = 0; i < texts.length; i++) {
                // embedContent still uses RETRIEVAL_DOCUMENT task type for fallback
                const response = await this.ai.models.embedContent({
                    model: MODEL_NAME,
                    contents: texts[i],
                    config: {
                        taskType: TASK_RETRIEVAL_DOCUMENT,
                        outputDimensionality: EXPECTED_DIMS
                    }
                });
                const v = response.embeddings[0].values;
                this._validateDims(v, `fallback[${i}]`);
                vectors.push(v);
            }

            console.log(`[EmbeddingService] Fallback complete — ${vectors.length} vectors generated`);
            return vectors;

        } catch (fallbackErr) {
            throw new Error(
                `[EmbeddingService] Embedding failed completely. ` +
                `Batch error: ${batchError?.message || "none"}. ` +
                `Fallback error: ${fallbackErr.message}. ` +
                `Check GOOGLE_EMBEDDER_API_KEY, model availability, API restrictions, and quota in Google AI Studio.`,
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
