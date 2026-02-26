/**
 * Document Utilities for Text Cleaning and Chunking
 * Used in RAG pipeline for processing tender documents
 */

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

/**
 * Configuration for text chunking
 */
const CHUNK_CONFIG = {
    chunkSize: 1500,
    chunkOverlap: 200,
    separators: ['\n\n', '\n', '. ', ' ', '']
};

/**
 * DocumentUtils class for processing documents
 */
class DocumentUtils {
    /**
     * Clean text by removing noise while preserving numerical values
     * @param {string} text - Raw text to clean
     * @returns {string} Cleaned text
     */
    static cleanText(text) {
        if (!text || typeof text !== 'string') {
            return '';
        }

        let cleaned = text;

        // Remove lines with only dots, dashes, or underscores (5 or more)
        cleaned = cleaned.replace(/\n[\.\-_ ]{5,}\n/g, '\n');

        // Remove long runs of dots, dashes, underscores (2+ consecutive)
        // BUT preserve digit.digit patterns (e.g., "3.14", "100.25")
        // First, protect digit.digit patterns temporarily
        const numericPatterns = [];
        cleaned = cleaned.replace(/\d+\.\d+/g, (match) => {
            const index = numericPatterns.length;
            numericPatterns.push(match);
            return `__NUMERIC_${index}__`;
        });

        // Now remove repetitive punctuation
        cleaned = cleaned.replace(/[\.\-_]{2,}/g, ' ');

        // Restore numeric patterns
        numericPatterns.forEach((pattern, index) => {
            cleaned = cleaned.replace(`__NUMERIC_${index}__`, pattern);
        });

        // Replace multiple newlines with a single newline
        cleaned = cleaned.replace(/\n+/g, '\n');

        // Replace multiple spaces with a single space
        cleaned = cleaned.replace(/ +/g, ' ');

        // Trim leading/trailing whitespace
        return cleaned.trim();
    }

    /**
     * Chunk text while preserving page number metadata
     * @param {Array<Object>} pageTexts - Array of {text: string, pageNo: number}
     * @param {number} chunkSize - Size of each chunk (default: 500)
     * @param {number} chunkOverlap - Overlap between chunks (default: 50)
     * @returns {Promise<Array<Object>>} Array of {text: string, pageNo: number, chunkIndex: number}
     */
    static async chunkTextWithMetadata(pageTexts, chunkSize = CHUNK_CONFIG.chunkSize, chunkOverlap = CHUNK_CONFIG.chunkOverlap) {
        if (!Array.isArray(pageTexts) || pageTexts.length === 0) {
            throw new Error('pageTexts must be a non-empty array');
        }

        const allChunks = [];

        // Initialize text splitter with RecursiveCharacterTextSplitter
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: chunkSize,
            chunkOverlap: chunkOverlap,
            separators: CHUNK_CONFIG.separators,
            keepSeparator: false
        });

        for (const pageData of pageTexts) {
            const { text, pageNo } = pageData;

            if (!text || !text.trim()) {
                continue; // Skip empty pages
            }

            // Normalize whitespace before chunking:
            // 1. Replace multiple newlines (more than 2) with exactly 2 newlines
            // 2. Replace multiple spaces with single space
            let normalizedText = text.replace(/\n{3,}/g, '\n\n');
            normalizedText = normalizedText.replace(/ {2,}/g, ' ');

            // Split the page text into chunks
            const chunks = await splitter.splitText(normalizedText);

            // Add metadata to each chunk
            chunks.forEach((chunk, index) => {
                if (chunk.trim()) { // Only include non-empty chunks
                    allChunks.push({
                        text: chunk.trim(),
                        pageNo: pageNo,
                        chunkInPage: index + 1
                    });
                }
            });
        }

        return allChunks;
    }

    /**
     * Extract keywords from text using semantic similarity (KeyBERT-style approach)
     * Uses embedding-based cosine similarity to find semantically important keywords
     * @param {string} text - Text to extract keywords from
     * @param {Object} embedder - EmbeddingService instance for generating embeddings
     * @param {number} maxKeywords - Maximum number of keywords to return (default: 10)
     * @param {number} ngramRange - N-gram range [min, max] (default: [1, 2])
     * @returns {Promise<Array<string>>} Array of semantically relevant keywords
     */
    static async extractKeywordsSemantic(text, embedder, maxKeywords = 10, ngramRange = [1, 2]) {
        if (!text || typeof text !== 'string') {
            return [];
        }

        if (!embedder || typeof embedder.embedText !== 'function') {
            throw new Error('Valid embedder instance required');
        }

        try {
            // Step 1: Generate candidate keywords (n-grams)
            const candidates = this._generateCandidateKeywords(text, ngramRange);
            
            if (candidates.length === 0) {
                return [];
            }

            // Limit candidates to avoid excessive API calls (max 50 candidates)
            const limitedCandidates = candidates.slice(0, 50);

            // Step 2: Generate embedding for the full text
            const textEmbedding = await embedder.embedText(text);

            // Step 3: Generate embeddings for all candidates in batch
            const candidateEmbeddings = await embedder.embedBatch(limitedCandidates);

            // Step 4: Calculate cosine similarity between text and each candidate
            const similarities = candidateEmbeddings.map((candidateEmb, index) => ({
                keyword: limitedCandidates[index],
                similarity: this._cosineSimilarity(textEmbedding, candidateEmb)
            }));

            // Step 5: Sort by similarity (descending) and return top-K
            const topKeywords = similarities
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, maxKeywords)
                .map(item => item.keyword);

            return topKeywords;
        } catch (error) {
            console.error('[DocumentUtils] Error in semantic keyword extraction:', error.message);
            // Fallback to simple frequency-based extraction
            console.warn('[DocumentUtils] Falling back to frequency-based keyword extraction');
            return this._extractKeywordsFrequency(text, maxKeywords);
        }
    }

    /**
     * Generate candidate keywords using n-grams
     * @param {string} text - Text to extract candidates from
     * @param {Array<number>} ngramRange - [min, max] n-gram range
     * @returns {Array<string>} Candidate keywords
     * @private
     */
    static _generateCandidateKeywords(text, ngramRange = [1, 2]) {
        // Clean and tokenize
        const cleanedText = text.replace(/[^\w\s]/g, ' ').toLowerCase();
        const words = cleanedText.split(/\s+/).filter(word => 
            word.length >= 3 && !this._isStopWord(word)
        );

        const candidates = new Set();
        const [minN, maxN] = ngramRange;

        // Generate n-grams
        for (let n = minN; n <= maxN; n++) {
            for (let i = 0; i <= words.length - n; i++) {
                const ngram = words.slice(i, i + n).join(' ');
                if (ngram.length >= 3) { // Minimum phrase length
                    candidates.add(ngram);
                }
            }
        }

        return Array.from(candidates);
    }

    /**
     * Calculate cosine similarity between two vectors
     * @param {Array<number>} vecA - First vector
     * @param {Array<number>} vecB - Second vector
     * @returns {number} Cosine similarity (-1 to 1)
     * @private
     */
    static _cosineSimilarity(vecA, vecB) {
        if (vecA.length !== vecB.length) {
            throw new Error('Vectors must have the same length');
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }

        const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
        
        if (magnitude === 0) {
            return 0;
        }

        return dotProduct / magnitude;
    }

    /**
     * Fallback frequency-based keyword extraction
     * @param {string} text - Text to extract keywords from
     * @param {number} maxKeywords - Maximum number of keywords
     * @returns {Array<string>} Keywords
     * @private
     */
    static _extractKeywordsFrequency(text, maxKeywords = 10) {
        const cleanedText = text.replace(/[^\w\s]/g, ' ');
        const words = cleanedText
            .toLowerCase()
            .split(/\s+/)
            .filter(word => word.length >= 3 && !this._isStopWord(word));

        const uniqueWords = [...new Set(words)];
        const wordFrequency = {};
        words.forEach(word => {
            wordFrequency[word] = (wordFrequency[word] || 0) + 1;
        });

        return uniqueWords
            .sort((a, b) => (wordFrequency[b] || 0) - (wordFrequency[a] || 0))
            .slice(0, maxKeywords);
    }

    /**
     * Check if word is a common stop word
     * @param {string} word - Word to check
     * @returns {boolean} True if stop word
     * @private
     */
    static _isStopWord(word) {
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
            'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
            'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this',
            'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their'
        ]);
        return stopWords.has(word);
    }

    /**
     * Process a complete document (all pages) into chunks ready for embedding
     * @param {Array<Object>} pageTexts - Array of {text: string, pageNo: number}
     * @param {Object} embedder - Optional EmbeddingService instance for semantic keyword extraction
     * @returns {Promise<Array<Object>>} Array of processed chunks with metadata
     */
    static async processDocument(pageTexts, embedder = null) {
        if (!Array.isArray(pageTexts) || pageTexts.length === 0) {
            throw new Error('pageTexts must be a non-empty array');
        }

        // Step 1: Clean all page texts
        const cleanedPages = pageTexts.map(page => ({
            text: this.cleanText(page.text),
            pageNo: page.pageNo
        }));

        // Step 2: Chunk the cleaned text
        const chunks = await this.chunkTextWithMetadata(cleanedPages);

        // Step 3: Extract keywords for each chunk
        const processedChunks = [];
        
        for (let index = 0; index < chunks.length; index++) {
            const chunk = chunks[index];
            
            // Use semantic keyword extraction if embedder is provided
            let keywords;
            if (embedder) {
                keywords = await this.extractKeywordsSemantic(chunk.text, embedder);
            } else {
                keywords = this._extractKeywordsFrequency(chunk.text);
            }
            
            processedChunks.push({
                chunkIndex: index,
                text: chunk.text,
                keywords: keywords,
                metadata: {
                    pageNo: chunk.pageNo,
                    chunkInPage: chunk.chunkInPage
                }
            });
        }

        return processedChunks;
    }
}

export default DocumentUtils;
