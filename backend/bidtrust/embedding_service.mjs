/**
 * Embedding Service using Google's text-embedding-004 model
 * Generates 768-dimensional embeddings for text chunks
 */

import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import dotenv from 'dotenv';

dotenv.config();

/**
 * EmbeddingService class for generating text embeddings
 */
class EmbeddingService {
    /**
     * Initialize the embedding service
     */
    constructor() {
        this.apiKey = process.env.GOOGLE_TEXT_EMBEDDER_API_KEY;
        
        if (!this.apiKey) {
            throw new Error('GOOGLE_TEXT_EMBEDDER_API_KEY is not set in environment variables');
        }

        // Initialize Google Generative AI Embeddings with text-embedding-004 model
        this.embedder = new GoogleGenerativeAIEmbeddings({
            apiKey: this.apiKey,
            modelName: 'text-embedding-004'
        });

        console.log('[EmbeddingService] Initialized with Google text-embedding-004 model (768 dimensions)');
    }

    /**
     * Generate embedding for a single text string
     * @param {string} text - Text to embed
     * @returns {Promise<Array<number>>} 768-dimensional embedding vector
     */
    async embedText(text) {
        try {
            if (!text || typeof text !== 'string' || !text.trim()) {
                throw new Error('Text must be a non-empty string');
            }

            const embedding = await this.embedder.embedQuery(text);
            
            if (!Array.isArray(embedding) || embedding.length !== 768) {
                throw new Error(`Expected 768-dimensional vector, got ${embedding?.length || 'invalid'} dimensions`);
            }

            return embedding;
        } catch (error) {
            console.error('[EmbeddingService] Error generating embedding for text:', error.message);
            throw error;
        }
    }

    /**
     * Generate embeddings for multiple text strings in batch
     * @param {Array<string>} texts - Array of texts to embed
     * @returns {Promise<Array<Array<number>>>} Array of 768-dimensional embedding vectors
     */
    async embedBatch(texts) {
        try {
            if (!Array.isArray(texts) || texts.length === 0) {
                throw new Error('texts must be a non-empty array');
            }

            // Validate all texts are non-empty strings
            const validTexts = texts.filter(text => text && typeof text === 'string' && text.trim());
            
            if (validTexts.length === 0) {
                throw new Error('No valid texts to embed');
            }

            if (validTexts.length !== texts.length) {
                console.warn(`[EmbeddingService] Warning: Filtered out ${texts.length - validTexts.length} invalid texts`);
            }

            console.log(`[EmbeddingService] Generating embeddings for ${validTexts.length} texts...`);
            
            // Generate embeddings using batch method
            const embeddings = await this.embedder.embedDocuments(validTexts);
            
            // Validate dimensions
            if (!Array.isArray(embeddings)) {
                throw new Error('embedDocuments did not return an array');
            }

            embeddings.forEach((embedding, index) => {
                if (!Array.isArray(embedding) || embedding.length !== 768) {
                    throw new Error(`Embedding ${index} has invalid dimensions: ${embedding?.length || 'invalid'}`);
                }
            });

            console.log(`[EmbeddingService] Successfully generated ${embeddings.length} embeddings`);
            return embeddings;
        } catch (error) {
            console.error('[EmbeddingService] Error generating batch embeddings:', error.message);
            throw error;
        }
    }

    /**
     * Generate embeddings for document chunks
     * @param {Array<Object>} chunks - Array of chunk objects with 'text' property
     * @returns {Promise<Array<Object>>} Chunks with added 'embedding' property
     */
    async embedChunks(chunks) {
        try {
            if (!Array.isArray(chunks) || chunks.length === 0) {
                throw new Error('chunks must be a non-empty array');
            }

            // Extract text from chunks
            const texts = chunks.map(chunk => {
                if (!chunk.text || typeof chunk.text !== 'string') {
                    throw new Error('Each chunk must have a valid text property');
                }
                return chunk.text;
            });

            console.log(`[EmbeddingService] Embedding ${texts.length} chunks...`);

            // Generate embeddings in batch
            const embeddings = await this.embedBatch(texts);

            // Combine chunks with embeddings
            const embeddedChunks = chunks.map((chunk, index) => ({
                ...chunk,
                embedding: embeddings[index]
            }));

            console.log(`[EmbeddingService] Successfully embedded ${embeddedChunks.length} chunks`);
            return embeddedChunks;
        } catch (error) {
            console.error('[EmbeddingService] Error embedding chunks:', error.message);
            throw error;
        }
    }

    /**
     * Get embedding model information
     * @returns {Object} Model information
     */
    getModelInfo() {
        return {
            provider: 'Google Generative AI',
            model: 'text-embedding-004',
            dimensions: 768,
            maxTokensPerRequest: 2048, // Google's limit
            batchSize: 100 // Recommended batch size
        };
    }
}

export default EmbeddingService;
