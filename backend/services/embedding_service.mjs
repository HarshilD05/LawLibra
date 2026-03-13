/**
 * EmbeddingService
 * Wraps Google text-embedding-004 (768-dim).
 * Designed for zero-friction swap to local nomic-embed-text via Ollama —
 * both output 768 dimensions, so no schema migration is needed.
 */

import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import dotenv from 'dotenv';
dotenv.config();

const EXPECTED_DIMS = 768;

class EmbeddingService {
    constructor() {
        if (!process.env.GOOGLE_EMBEDDER_API_KEY) {
            throw new Error('[EmbeddingService] GOOGLE_EMBEDDER_API_KEY is not set in .env');
        }

        this.embedder = new GoogleGenerativeAIEmbeddings({
            apiKey: process.env.GOOGLE_EMBEDDER_API_KEY,
            modelName: 'text-embedding-004',  // 768-dim output
        });

        console.log('[EmbeddingService] Initialized — Google text-embedding-004 (768 dims)');
    }

    /**
     * Embed a single text string.
     * Used for embedding the user's query at search time.
     * @param {string} text
     * @returns {Promise<number[]>} 768-dimensional vector
     */
    async embedText(text) {
        if (!text?.trim()) throw new Error('[EmbeddingService] embedText: text must be a non-empty string');

        const vector = await this.embedder.embedQuery(text);
        this._validateDims(vector, 'embedText');
        return vector;
    }

    /**
     * Embed an array of text strings in a single batched API call.
     * Used during document ingestion to embed all chunks at once.
     * @param {string[]} texts
     * @returns {Promise<number[][]>} Array of 768-dimensional vectors
     */
    async embedBatch(texts) {
        if (!Array.isArray(texts) || texts.length === 0) {
            throw new Error('[EmbeddingService] embedBatch: texts must be a non-empty array');
        }

        const valid = texts.filter(t => typeof t === 'string' && t.trim());
        if (valid.length !== texts.length) {
            console.warn(`[EmbeddingService] embedBatch: skipped ${texts.length - valid.length} empty items`);
        }

        console.log(`[EmbeddingService] Embedding batch of ${valid.length} texts...`);
        const vectors = await this.embedder.embedDocuments(valid);

        vectors.forEach((v, i) => this._validateDims(v, `batch[${i}]`));
        console.log(`[EmbeddingService] Batch complete — ${vectors.length} vectors generated`);
        return vectors;
    }

    /**
     * Attach embeddings to an array of chunk objects.
     * Extracts the 'text' field, runs a single batch call, then merges back.
     * @param {Array<{text: string, [key: string]: any}>} chunks
     * @returns {Promise<Array<{embedding: number[], [key: string]: any}>>}
     */
    async embedChunks(chunks) {
        if (!Array.isArray(chunks) || chunks.length === 0) {
            throw new Error('[EmbeddingService] embedChunks: chunks must be a non-empty array');
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
                `[EmbeddingService] ${label}: expected ${EXPECTED_DIMS} dims, got ${vector?.length ?? 'invalid'}`
            );
        }
    }

    getModelInfo() {
        return {
            provider:   'Google Generative AI',
            model:      'text-embedding-004',
            dimensions: EXPECTED_DIMS,
        };
    }
}

export default EmbeddingService;
