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
     * Embed an array of texts.
     * @param {string[]} texts
     * @param {boolean} isQuery - Query flag. Can be mapped to specific prompt variables depending on external service.
     * @returns {Promise<number[][]>}
     */
    async embed(texts, isQuery = false) {
        if (!Array.isArray(texts) || texts.length === 0) {
            throw new Error("[ExternalEmbeddingService] embed: texts must be a non-empty array");
        }

        const valid = texts.filter(t => typeof t === "string" && t.trim());
        if (valid.length !== texts.length) {
            console.warn(`[ExternalEmbeddingService] embed: skipped ${texts.length - valid.length} empty items`);
        }

        console.log(`[ExternalEmbeddingService] Embedding batch of ${valid.length} chunks via External API (isQuery: ${isQuery})...`);

        try {
            const headers = { 
                "Content-Type": "application/json",
                ...(this.apiKey && { "Authorization": `Bearer ${this.apiKey}` })
            };

            // Common payloads: HuggingFace uses { inputs }, OpenAI uses { input }
            // Modify if external backend handles isQuery or taskType specifics
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
            console.error(`[ExternalEmbeddingService] embed failed:`, err.message);
            throw err;
        }
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
