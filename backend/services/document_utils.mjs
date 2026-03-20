/**
 * DocumentUtils
 * Cleans, chunks, and extracts keywords from raw page text.
 *
 * Changes from BidTrust:
 *   - Chunk size reduced to 900 chars (was 1500) to prevent context bleed
 *     across unrelated legal facts within a single paragraph.
 *   - Keyword extraction uses TF-IDF across all chunks of a document
 *     (was per-chunk semantic embedding calls — too expensive locally).
 *     IDF naturally demotes words that recur in every chunk ("court",
 *     "section") and promotes terms unique to each chunk.
 *   - Legal-specific stop word expansion added to the base English list.
 */

import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { createRequire } from "module";

// natural"s TfIdf is CJS; load via createRequire inside ESM
const require     = createRequire(import.meta.url);
const { TfIdf }   = require("natural");

// ─── Config ───────────────────────────────────────────────────────────────────

const CHUNK_CONFIG = {
    chunkSize:    900,
    chunkOverlap: 150,
    separators:   ["\n\n", "\n", ". ", " ", ""],
};

const MAX_KEYWORDS = 8;

// ─── Stop Words ───────────────────────────────────────────────────────────────

// Base English + legal boilerplate that appears in virtually every legal doc
const STOP_WORDS = new Set([
    // Common English
    "the","a","an","and","or","but","in","on","at","to","for","of","with",
    "by","from","as","is","was","are","were","be","been","being","have",
    "has","had","do","does","did","will","would","should","could","may",
    "might","must","can","this","that","these","those","it","its","they",
    "them","their","there","here","all","any","each","some","such","than",
    "then","when","where","which","who","whom","not","also","into","over",
    "after","before","about","between","through","during","within","under",
    "above","below","both","own","other","same","more","most","very",
    // Legal boilerplate
    "whereas","hereinafter","herein","hereby","hereto","hereof",
    "aforesaid","aforementioned","pursuant","thereto","therein","thereof",
    "whereby","notwithstanding","provided","shall","upon","said",
    "above","below","order","court","matter","case","dated","date",
    "petition","petitioner","respondent","applicant","plaintiff",
    "defendant","counsel","section","clause","article","para","page",
    "annexure","exhibit","schedule","appendix","statement","per",
    "ref","regard","subject","kind","dear","sir","madam",
]);

// ─── DocumentUtils ────────────────────────────────────────────────────────────

class DocumentUtils {
    /**
     * Remove visual noise from extracted PDF/DOCX text while preserving
     * numbers, decimals, and section references (e.g. "3.14", "S.302").
     * @param {string} text
     * @returns {string}
     */
    static cleanText(text) {
        if (!text || typeof text !== "string") return "";

        let cleaned = text;

        // Protect digit.digit patterns (e.g. "3.14", "100.50", "S.302")
        const numericCache = [];
        cleaned = cleaned.replace(/[\w\d]+\.[\w\d]+/g, match => {
            const idx = numericCache.length;
            numericCache.push(match);
            return `__NUM_${idx}__`;
        });

        // Remove separator lines (rows of dots, dashes, underscores)
        cleaned = cleaned.replace(/\n[\.\-_ ]{5,}\n/g, "\n");

        // Collapse repetitive punctuation (table borders, separators)
        cleaned = cleaned.replace(/[\.\-_]{2,}/g, " ");

        // Restore protected patterns
        numericCache.forEach((val, idx) => {
            cleaned = cleaned.replaceAll(`__NUM_${idx}__`, val);
        });

        // Normalize whitespace
        cleaned = cleaned.replace(/\n+/g, "\n").replace(/ +/g, " ").trim();

        return cleaned;
    }

    /**
     * Splits cleaned page texts into overlapping chunks using
     * RecursiveCharacterTextSplitter, preserving source page number.
     *
     * @param {Array<{text: string, pageNo: number}>} pageTexts
     * @returns {Promise<Array<{text: string, pageNo: number, chunkIndex: number}>>}
     */
    static async chunkTextWithMetadata(pageTexts) {
        if (!Array.isArray(pageTexts) || pageTexts.length === 0) {
            throw new Error("chunkTextWithMetadata: pageTexts must be a non-empty array");
        }

        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize:    CHUNK_CONFIG.chunkSize,
            chunkOverlap: CHUNK_CONFIG.chunkOverlap,
            separators:   CHUNK_CONFIG.separators,
            keepSeparator: false,
        });

        const allChunks = [];

        for (const { text, pageNo } of pageTexts) {
            if (!text?.trim()) continue;

            // Normalise whitespace before splitting
            const normalised = text.replace(/\n{3,}/g, "\n\n").replace(/ {2,}/g, " ");
            const parts      = await splitter.splitText(normalised);

            for (const part of parts) {
                if (part.trim()) {
                    allChunks.push({
                        text:       part.trim(),
                        pageNo,
                        chunkIndex: allChunks.length,
                    });
                }
            }
        }

        return allChunks;
    }

    /**
     * Runs TF-IDF across ALL chunks of a document in a single pass.
     * Returns the same chunks array with a "keywords" field added.
     *
     * Why bulk TF-IDF is correct here:
     *   IDF is calculated across all chunks of this document. A word like
     *   "accused" appearing in every chunk gets penalised (low IDF) while
     *   "fingerprint" appearing in only 3 chunks ranks highly in those chunks.
     *   This mirrors how legal search actually works — unique evidentiary
     *   terms are more searchable than procedural boilerplate.
     *
     * @param {Array<{text: string, [key: string]: any}>} chunks
     * @returns {Array<{keywords: string[], [key: string]: any}>}
     */
    static extractKeywordsTFIDF(chunks) {
        const tfidf = new TfIdf();
        chunks.forEach(c => tfidf.addDocument(c.text));

        return chunks.map((chunk, docIndex) => {
            const terms = tfidf
                .listTerms(docIndex)
                .filter(item =>
                    item.term.length >= 3 &&
                    !STOP_WORDS.has(item.term.toLowerCase()) &&
                    /^[a-z]/i.test(item.term)      // skip tokens starting with digits/symbols
                )
                .slice(0, MAX_KEYWORDS)
                .map(item => item.term);

            return { ...chunk, keywords: terms };
        });
    }

    /**
     * Master pipeline: clean → chunk → TF-IDF keywords.
     * Returns chunks ready to be passed to EmbeddingService.embedChunks().
     *
     * @param {Array<{text: string, pageNo: number}>} pageTexts
     *   Raw output from DocumentProcessor.extractPageTexts()
     * @returns {Promise<Array<{
     *   text:       string,
     *   pageNo:     number,
     *   chunkIndex: number,
     *   keywords:   string[],
     * }>>}
     */
    static async processDocument(pageTexts) {
        if (!Array.isArray(pageTexts) || pageTexts.length === 0) {
            throw new Error("processDocument: pageTexts must be a non-empty array");
        }

        // Step 1 — clean each page
        const cleanedPages = pageTexts.map(({ text, pageNo }) => ({
            text: this.cleanText(text),
            pageNo,
        }));

        // Step 2 — chunk across all pages
        const chunks = await this.chunkTextWithMetadata(cleanedPages);
        console.log(`[DocumentUtils] ${chunks.length} chunks created from ${pageTexts.length} pages`);

        // Step 3 — bulk TF-IDF keywords (no API calls needed)
        const chunksWithKeywords = this.extractKeywordsTFIDF(chunks);
        console.log(`[DocumentUtils] TF-IDF keywords extracted for all chunks`);

        return chunksWithKeywords;
    }
}

export default DocumentUtils;
