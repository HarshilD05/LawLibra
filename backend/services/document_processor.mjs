/**
 * DocumentProcessor
 * Extracts page-accurate text from PDF, DOCX, and TXT files.
 *
 * Key improvement over BidTrust:
 *   PDF uses pdfjs-dist (v5, native ESM) which renders each page individually,
 *   giving exact page numbers. BidTrust used pdf-parse which approximates pages
 *   by splitting form-feed characters or dividing total text evenly — both
 *   unreliable for legal documents where citation accuracy is critical.
 */

import fs from "fs/promises";
import path from "path";
import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import logger from "../config/logger.mjs";

// In Node.js, the legacy build disables real web workers internally and falls
// back to pdfjs"s built-in fake-worker path. Do not overwrite workerSrc here:
// setting it to an empty string breaks the internal fallback resolution.

export const SUPPORTED_MIME_TYPES = {
    PDF:  "application/pdf",
    DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    DOC:  "application/msword",
    TXT:  "text/plain",
};

class DocumentProcessor {
    /**
     * Entry point. Routes to the correct extractor based on MIME type.
     * @param {string} filePath  Absolute path to the file on disk
     * @param {string} mimeType
     * @returns {Promise<Array<{text: string, pageNo: number}>>}
     */
    static async extractPageTexts(filePath, mimeType) {
        if (!filePath || !mimeType) throw new Error("filePath and mimeType are required");

        try {
            await fs.access(filePath);
        } catch {
            throw new Error(`File not found: ${filePath}`);
        }

        switch (mimeType) {
            case SUPPORTED_MIME_TYPES.PDF:
                return this._extractFromPDF(filePath);
            case SUPPORTED_MIME_TYPES.DOCX:
            case SUPPORTED_MIME_TYPES.DOC:
                return this._extractFromDOCX(filePath);
            case SUPPORTED_MIME_TYPES.TXT:
                return this._extractFromTXT(filePath);
            default:
                throw new Error(
                    `Unsupported file type: ${mimeType}. Supported: ${this.getSupportedExtensions().join(", ")}`
                );
        }
    }

    // ─── PDF ─────────────────────────────────────────────────────────────────────

    /**
     * Extracts text page-by-page using pdfjs-dist.
     * Each page is rendered individually — page numbers are exact, not estimated.
     * @private
     */
    static async _extractFromPDF(filePath) {
        logger.debug({ type: "processor", event: "extract_start", format: "PDF", file: path.basename(filePath) });

        const dataBuffer = await fs.readFile(filePath);
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(dataBuffer) });
        const pdfDoc = await loadingTask.promise;

        const pageTexts = [];

        for (let pageNo = 1; pageNo <= pdfDoc.numPages; pageNo++) {
            const page        = await pdfDoc.getPage(pageNo);
            const textContent = await page.getTextContent();

            // Each TextItem has a "str" field. Items on the same line are
            // separate objects; we join them with a space and insert newlines
            // when the vertical position changes significantly.
            let lastY   = null;
            let lines   = [];
            let current = "";

            for (const item of textContent.items) {
                const y = item.transform[5]; // vertical position

                if (lastY !== null && Math.abs(y - lastY) > 5) {
                    // New line detected
                    if (current.trim()) lines.push(current.trim());
                    current = item.str;
                } else {
                    current += (current ? " " : "") + item.str;
                }
                lastY = y;
            }
            if (current.trim()) lines.push(current.trim());

            const pageText = lines.join("\n").trim();

            if (pageText) {
                pageTexts.push({ text: pageText, pageNo });
            }
        }

        logger.debug({ type: "processor", event: "extract_done", format: "PDF", file: path.basename(filePath), pages: pageTexts.length });
        return pageTexts;
    }

    // ─── DOCX ────────────────────────────────────────────────────────────────────

    /**
     * DOCX files have no reliable page break information in raw XML.
     * We split on multiple newlines / form-feeds; if no natural breaks
     * exist we create artificial 10-paragraph "pages".
     * @private
     */
    static async _extractFromDOCX(filePath) {
        logger.debug({ type: "processor", event: "extract_start", format: "DOCX", file: path.basename(filePath) });

        const result = await mammoth.extractRawText({ path: filePath });
        const text   = result.value;

        // Split on explicit section breaks or heavy whitespace
        const sections = text.split(/\n{3,}|\f/).filter(s => s.trim());

        let pageTexts;

        if (sections.length > 1) {
            pageTexts = sections.map((text, i) => ({ text: text.trim(), pageNo: i + 1 }));
        } else {
            // No natural breaks — group by 10 paragraphs per artificial page
            const paragraphs      = text.split(/\n\n+/);
            const PARAS_PER_PAGE  = 10;
            pageTexts             = [];

            for (let i = 0; i < paragraphs.length; i += PARAS_PER_PAGE) {
                const pageText = paragraphs.slice(i, i + PARAS_PER_PAGE).join("\n\n").trim();
                if (pageText) pageTexts.push({ text: pageText, pageNo: Math.floor(i / PARAS_PER_PAGE) + 1 });
            }
        }

        if (pageTexts.length === 0 && text.trim()) {
            pageTexts = [{ text: text.trim(), pageNo: 1 }];
        }

        logger.debug({ type: "processor", event: "extract_done", format: "DOCX", file: path.basename(filePath), sections: pageTexts.length });
        return pageTexts;
    }

    // ─── TXT ─────────────────────────────────────────────────────────────────────

    /**
     * Plain text: split on 4+ blank lines, or chunk by 3000 chars.
     * @private
     */
    static async _extractFromTXT(filePath) {
        logger.debug({ type: "processor", event: "extract_start", format: "TXT", file: path.basename(filePath) });

        const text     = await fs.readFile(filePath, "utf-8");
        const sections = text.split(/\n{4,}/).filter(s => s.trim());

        let pageTexts;

        if (sections.length > 1) {
            pageTexts = sections.map((text, i) => ({ text: text.trim(), pageNo: i + 1 }));
        } else {
            const MAX_CHARS = 3000;
            const lines     = text.split("\n");
            pageTexts       = [];
            let current     = [];
            let charCount   = 0;
            let pageNo      = 1;

            for (const line of lines) {
                current.push(line);
                charCount += line.length;
                if (charCount >= MAX_CHARS) {
                    pageTexts.push({ text: current.join("\n").trim(), pageNo: pageNo++ });
                    current   = [];
                    charCount = 0;
                }
            }
            if (current.length) pageTexts.push({ text: current.join("\n").trim(), pageNo });
        }

        if (pageTexts.length === 0 && text.trim()) {
            pageTexts = [{ text: text.trim(), pageNo: 1 }];
        }

        logger.debug({ type: "processor", event: "extract_done", format: "TXT", file: path.basename(filePath), sections: pageTexts.length });
        return pageTexts;
    }

    // ─── Utility ─────────────────────────────────────────────────────────────────

    static getMimeTypeFromFilename(filename) {
        const ext = path.extname(filename).toLowerCase();
        return {
            ".pdf":  SUPPORTED_MIME_TYPES.PDF,
            ".docx": SUPPORTED_MIME_TYPES.DOCX,
            ".doc":  SUPPORTED_MIME_TYPES.DOC,
            ".txt":  SUPPORTED_MIME_TYPES.TXT,
        }[ext] ?? null;
    }

    static isSupportedType(mimeType) {
        return Object.values(SUPPORTED_MIME_TYPES).includes(mimeType);
    }

    static getSupportedExtensions() {
        return [".pdf", ".docx", ".doc", ".txt"];
    }
}

export default DocumentProcessor;
