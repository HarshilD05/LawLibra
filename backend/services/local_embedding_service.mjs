import { Ollama } from "ollama";

const EXPECTED_DIMS = 768; // E.g., nomic-embed-text
const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_MODEL = "nomic-embed-text";

/**
 * LocalEmbeddingService
 * Connects to a locally running Ollama instance to generate embeddings.
 * Best used with models like nomic-embed-text that output 768 dimensions
 * to match the existing schema.
 */
class LocalEmbeddingService {
    constructor() {
        this.baseUrl = process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_URL;
        this.modelName = process.env.OLLAMA_EMBEDDING_MODEL || DEFAULT_MODEL;
        
        // Initialize the official Ollama JS client
        this.client = new Ollama({ host: this.baseUrl });
        
        console.log(`[LocalEmbeddingService] Initialized — Model: ${this.modelName} | URL: ${this.baseUrl}`);
    }

    /**
     * Checks if the Ollama service is reachable and running.
     * @returns {Promise<boolean>}
     */
    async isServiceRunning() {
        try {
            // ping the base URL to check if the server is running
            const response = await fetch(this.baseUrl);
            return response.ok;
        } catch (err) {
            console.error(`[LocalEmbeddingService] Failed to reach Ollama at ${this.baseUrl}:`, err.message);
            return false;
        }
    }

    /**
     * Ensures Ollama is running, throwing an error if it is not.
     */
    async checkConnection() {
        const isRunning = await this.isServiceRunning();
        if (!isRunning) {
            throw new Error(`[LocalEmbeddingService] Ollama service is not running or unreachable at ${this.baseUrl}`);
        }
    }

    /**
     * Embed an array of texts.
     * @param {string[]} texts
     * @param {boolean} isQuery - Determines task type. For local ollama models, this parameter might be ignored
     *                            or mapped later if specific models require different prompts.
     * @returns {Promise<number[][]>} Array of 768-dimensional vectors
     */
    async embed(texts, isQuery = false) {
        if (!Array.isArray(texts) || texts.length === 0) {
            throw new Error("[LocalEmbeddingService] embed: texts must be a non-empty array");
        }

        const valid = texts.filter(t => typeof t === "string" && t.trim());
        if (valid.length !== texts.length) {
            console.warn(`[LocalEmbeddingService] embed: skipped ${texts.length - valid.length} empty items`);
        }

        // Before sending the payload, aggressively check if the service is up
        await this.checkConnection();

        console.log(`[LocalEmbeddingService] Embedding batch of ${valid.length} chunks via Ollama (isQuery: ${isQuery})...`);

        try {
            // Using the official Ollama JS package
            const response = await this.client.embed({
                model: this.modelName,
                input: valid
            });

            const embeddings = response.embeddings;

            if (!embeddings || embeddings.length !== valid.length) {
                throw new Error(`Expected ${valid.length} embeddings from Ollama, but got ${embeddings?.length}`);
            }

            // Verify the dimensions
            embeddings.forEach((v, i) => this._validateDims(v, `batch[${i}]`));
            console.log(`[LocalEmbeddingService] Batch complete — ${embeddings.length} vectors generated`);

            return embeddings;

        } catch (err) {
            console.error(`[LocalEmbeddingService] embed failed:`, err.message);
            throw err;
        }
    }

    // ─── Private Helpers ─────────────────────────────────────────────────────────

    _validateDims(vector, label) {
        if (!Array.isArray(vector) || vector.length !== EXPECTED_DIMS) {
            throw new Error(
                `[LocalEmbeddingService] ${label}: expected ${EXPECTED_DIMS} dims, got ${vector?.length ?? "invalid"}`
            );
        }
    }
}

export default LocalEmbeddingService;
