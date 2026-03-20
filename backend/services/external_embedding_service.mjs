/**
 * ExternalEmbeddingService
 * Connects to an external REST endpoint (e.g., HuggingFace Inference Endpoints, 
 * a hosted Colab server, or an OpenAI-compatible API) to generate embeddings.
 */
class ExternalEmbeddingService {
    constructor() {
        this.endpoint = process.env.EXTERNAL_EMBEDDING_ENDPOINT;
        this.apiKey = process.env.EXTERNAL_EMBEDDING_API_KEY;
        this.expectedDims = parseInt(process.env.EMBEDDING_DIMENSIONS || "768", 10);
        
        if (!this.endpoint) {
            throw new Error(`[ExternalEmbeddingService] EXTERNAL_EMBEDDING_ENDPOINT is not defined in .env`);
        }

        console.log(`[ExternalEmbeddingService] Initialized — Endpoint: ${this.endpoint} | Dims: ${this.expectedDims}`);
    }

    /**
     * Embed a single query/text string.
     * @param {string} text
     * @returns {Promise<number[]>}
     */
    async embedText(text) {
        if (!text?.trim()) throw new Error("[ExternalEmbeddingService] embedText: text must be a non-empty string");
        
        const vectors = await this.embedBatch([text]);
        return vectors[0];
    }

    /**
     * Embed an array of texts in one call using the external API.
     * 
     * NOTE: The payload payload formatting may vary depending on the 
     * external service (OpenAI-compatible vs HuggingFace vs custom Colab).
     * This implementation assumes a generic { inputs: [...] } or { input: [...] } structure
     * returning { embeddings: [...] } or a flat array of arrays.
     * 
     * @param {string[]} texts
     * @returns {Promise<number[][]>}
     */
    async embedBatch(texts) {
        if (!Array.isArray(texts) || texts.length === 0) {
            throw new Error("[ExternalEmbeddingService] embedBatch: texts must be a non-empty array");
        }

        const valid = texts.filter(t => typeof t === "string" && t.trim());
        if (valid.length !== texts.length) {
            console.warn(`[ExternalEmbeddingService] embedBatch: skipped ${texts.length - valid.length} empty items`);
        }

        console.log(`[ExternalEmbeddingService] Embedding batch of ${valid.length} chunks via External API...`);

        try {
            const headers = { 
                "Content-Type": "application/json",
                ...(this.apiKey && { "Authorization": `Bearer ${this.apiKey}` })
            };

            // Common payloads: HuggingFace uses { inputs }, OpenAI uses { input }
            // Feel free to modify the body structure based on your specific backend.
            const body = JSON.stringify({ inputs: valid });

            const response = await fetch(this.endpoint, {
                method: "POST",
                headers,
                body
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`External API error (${response.status}): ${errText}`);
            }

            const data = await response.json();
            
            // Extract embeddings whether response is { embeddings: [...] } or just an array
            let embeddings = data.embeddings || data.data?.map(d => d.embedding) || data;

            if (!Array.isArray(embeddings)) {
                // HuggingFace feature extraction sometimes returns a raw array of arrays
                if (Array.isArray(data) && Array.isArray(data[0])) {
                    embeddings = data;
                } else {
                    throw new Error(`[ExternalEmbeddingService] Invalid response format from external API.`);
                }
            }

            if (embeddings.length !== valid.length) {
                throw new Error(`Expected ${valid.length} embeddings, got ${embeddings.length}`);
            }

            // Verify dimensions
            embeddings.forEach((v, i) => this._validateDims(v, `batch[${i}]`));
            console.log(`[ExternalEmbeddingService] Batch complete — ${embeddings.length} vectors generated`);

            return embeddings;

        } catch (err) {
            console.error(`[ExternalEmbeddingService] embedBatch failed:`, err.message);
            throw err;
        }
    }

    /**
     * Attach embeddings to an array of chunk objects.
     * @param {Array<{text: string, [key: string]: any}>} chunks
     * @returns {Promise<Array<{embedding: number[], [key: string]: any}>>}
     */
    async embedChunks(chunks) {
        if (!Array.isArray(chunks) || chunks.length === 0) {
            throw new Error("[ExternalEmbeddingService] embedChunks: chunks must be a non-empty array");
        }

        const texts = chunks.map((c, i) => {
            if (!c.text?.trim()) throw new Error(`[ExternalEmbeddingService] chunk[${i}] has no valid text`);
            return c.text;
        });

        const vectors = await this.embedBatch(texts);

        return chunks.map((chunk, i) => ({ ...chunk, embedding: vectors[i] }));
    }

    // ─── Private Helpers ─────────────────────────────────────────────────────────

    _validateDims(vector, label) {
        if (!Array.isArray(vector) || vector.length !== this.expectedDims) {
            throw new Error(
                `[ExternalEmbeddingService] ${label}: expected ${this.expectedDims} dims, got ${vector?.length ?? "invalid"}`
            );
        }
    }
}

export default ExternalEmbeddingService;
