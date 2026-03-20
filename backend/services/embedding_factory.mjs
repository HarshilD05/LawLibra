/**
 * Embedding Factory
 *
 * Creates the appropriate embedding service instance based on the .env configuration.
 *
 * ─── Required .env vars ────────────────────────────────────────────────────────
 *   EMBEDDING_METHOD    google | external | local
 *                       Default: google
 *
 *   EMBEDDING_DIMENSIONS Expected dimensions (default 768)
 *
 * ─── Provider configurations ───────────────────────────────────────────────────
 *   Method      File                             Required Env
 *   ─────────── ──────────────────────────────── ────────────────────────────────
 *   google      embedding_service.mjs            GOOGLE_EMBEDDER_API_KEY
 *   local       local_embedding_service.mjs      OLLAMA_BASE_URL (optional)
 *   external    external_embedding_service.mjs   EXTERNAL_EMBEDDING_ENDPOINT
 */

const EMBEDDING_METHOD = (process.env.EMBEDDING_METHOD || 'google').toLowerCase();

/**
 * Creates and returns the configured Embedding Service instance.
 * Dynamic imports are used so that unconfigured dependencies or missing files
 * do not block or crash the application if unnecessary.
 *
 * @returns {Promise<Object>} An instance of the chosen EmbeddingService.
 */
export async function createEmbeddingService() {
    console.log(`[EmbeddingFactory] Resolving embedding method: ${EMBEDDING_METHOD}`);

    try {
        switch (EMBEDDING_METHOD) {
            case 'local': {
                const { default: LocalEmbeddingService } = await import('./local_embedding_service.mjs');
                return new LocalEmbeddingService();
            }

            case 'external': {
                const { default: ExternalEmbeddingService } = await import('./external_embedding_service.mjs');
                return new ExternalEmbeddingService();
            }

            case 'google':
            default: {
                // Currently resides in embedding_service.mjs
                // NOTE: If you rename it to google_embedding_service.mjs later, update this import!
                const { default: GoogleEmbeddingService } = await import('./embedding_service.mjs');
                return new GoogleEmbeddingService();
            }
        }
    } catch (err) {
        throw new Error(
            `[EmbeddingFactory] Failed to initialize embedding service for method "${EMBEDDING_METHOD}": ${err.message}`
        );
    }
}
