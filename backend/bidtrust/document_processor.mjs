/**
 * Document Processor Service
 * Handles extraction of text from various document formats (PDF, DOCX, TXT)
 * Returns page-wise text data for further processing
 */

import fs from 'fs/promises';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

/**
 * Supported document MIME types
 */
const SUPPORTED_MIME_TYPES = {
    PDF: 'application/pdf',
    DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    DOC: 'application/msword',
    TXT: 'text/plain'
};

/**
 * DocumentProcessor class for extracting text from various file formats
 */
class DocumentProcessor {
    /**
     * Process a document and extract page-wise text
     * @param {string} filePath - Path to the document file
     * @param {string} mimeType - MIME type of the document
     * @returns {Promise<Array<Object>>} Array of {text: string, pageNo: number}
     */
    static async extractPageTexts(filePath, mimeType) {
        if (!filePath || !mimeType) {
            throw new Error('filePath and mimeType are required');
        }

        // Verify file exists
        try {
            await fs.access(filePath);
        } catch (error) {
            throw new Error(`File not found: ${filePath}`);
        }

        // Route to appropriate handler based on MIME type
        switch (mimeType) {
            case SUPPORTED_MIME_TYPES.PDF:
                return await this._extractFromPDF(filePath);
            
            case SUPPORTED_MIME_TYPES.DOCX:
            case SUPPORTED_MIME_TYPES.DOC:
                return await this._extractFromDOCX(filePath);
            
            case SUPPORTED_MIME_TYPES.TXT:
                return await this._extractFromText(filePath);
            
            default:
                throw new Error(`Unsupported file type: ${mimeType}`);
        }
    }

    /**
     * Extract text from PDF file with page information
     * @param {string} filePath - Path to PDF file
     * @returns {Promise<Array<Object>>} Page texts
     * @private
     */
    static async _extractFromPDF(filePath) {
        try {
            console.log(`[DocumentProcessor] Extracting text from PDF: ${path.basename(filePath)}`);
            
            // Read PDF file
            const dataBuffer = await fs.readFile(filePath);
            
            // Parse PDF
            const pdfData = await pdfParse(dataBuffer, {
                // Preserve page structure
                max: 0 // No page limit
            });

            const pageTexts = [];
            
            // pdf-parse doesn't provide direct page-by-page text
            // We'll split the text by page breaks (form feed character)
            // For more accurate page extraction, we'd need pdf.js or similar
            
            // Approximate page detection using text length and form feeds
            const fullText = pdfData.text;
            const numPages = pdfData.numpages;
            
            if (numPages === 1) {
                // Single page document
                pageTexts.push({
                    text: fullText,
                    pageNo: 1
                });
            } else {
                // Multi-page: split by estimated page length
                const avgCharsPerPage = Math.ceil(fullText.length / numPages);
                let currentPageText = '';
                let currentPageNo = 1;
                let charCount = 0;

                // Split by form feed if present, otherwise by estimated length
                const pages = fullText.split('\f');
                
                if (pages.length > 1 && pages.length <= numPages + 2) {
                    // Form feed separation worked
                    pages.forEach((pageText, index) => {
                        if (pageText.trim()) {
                            pageTexts.push({
                                text: pageText.trim(),
                                pageNo: index + 1
                            });
                        }
                    });
                } else {
                    // Fallback: divide text into equal-ish pages
                    const lines = fullText.split('\n');
                    const linesPerPage = Math.ceil(lines.length / numPages);
                    
                    for (let i = 0; i < numPages; i++) {
                        const pageLines = lines.slice(i * linesPerPage, (i + 1) * linesPerPage);
                        const pageText = pageLines.join('\n').trim();
                        
                        if (pageText) {
                            pageTexts.push({
                                text: pageText,
                                pageNo: i + 1
                            });
                        }
                    }
                }
            }

            console.log(`[DocumentProcessor] Extracted ${pageTexts.length} pages from PDF`);
            return pageTexts;
        } catch (error) {
            console.error('[DocumentProcessor] Error extracting from PDF:', error);
            throw new Error(`Failed to extract text from PDF: ${error.message}`);
        }
    }

    /**
     * Extract text from DOCX/DOC file
     * @param {string} filePath - Path to DOCX file
     * @returns {Promise<Array<Object>>} Page texts (DOCX doesn't have clear page breaks)
     * @private
     */
    static async _extractFromDOCX(filePath) {
        try {
            console.log(`[DocumentProcessor] Extracting text from DOCX: ${path.basename(filePath)}`);
            
            // Read DOCX file
            const result = await mammoth.extractRawText({ path: filePath });
            const text = result.value;
            
            // DOCX doesn't have explicit page breaks in the extracted text
            // We'll split by section breaks or create artificial pages
            const pageTexts = [];
            
            // Split by page break markers if present (mammoth may preserve some)
            const sections = text.split(/\n{3,}|\f/); // Split by multiple newlines or form feed
            
            if (sections.length > 1) {
                // Multiple sections found
                sections.forEach((sectionText, index) => {
                    if (sectionText.trim()) {
                        pageTexts.push({
                            text: sectionText.trim(),
                            pageNo: index + 1
                        });
                    }
                });
            } else {
                // Single continuous text - create artificial pages by paragraph count
                const paragraphs = text.split(/\n\n+/);
                const paragraphsPerPage = 10; // Arbitrary: ~10 paragraphs per "page"
                
                for (let i = 0; i < paragraphs.length; i += paragraphsPerPage) {
                    const pageParagraphs = paragraphs.slice(i, i + paragraphsPerPage);
                    const pageText = pageParagraphs.join('\n\n').trim();
                    
                    if (pageText) {
                        pageTexts.push({
                            text: pageText,
                            pageNo: Math.floor(i / paragraphsPerPage) + 1
                        });
                    }
                }
            }

            // Fallback: if no pages created, treat entire document as single page
            if (pageTexts.length === 0 && text.trim()) {
                pageTexts.push({
                    text: text.trim(),
                    pageNo: 1
                });
            }

            console.log(`[DocumentProcessor] Extracted ${pageTexts.length} sections from DOCX`);
            return pageTexts;
        } catch (error) {
            console.error('[DocumentProcessor] Error extracting from DOCX:', error);
            throw new Error(`Failed to extract text from DOCX: ${error.message}`);
        }
    }

    /**
     * Extract text from plain text file
     * @param {string} filePath - Path to text file
     * @returns {Promise<Array<Object>>} Page texts (split by blank lines or size)
     * @private
     */
    static async _extractFromText(filePath) {
        try {
            console.log(`[DocumentProcessor] Extracting text from TXT: ${path.basename(filePath)}`);
            
            // Read text file
            const text = await fs.readFile(filePath, 'utf-8');
            
            const pageTexts = [];
            
            // Split by multiple newlines (section breaks)
            const sections = text.split(/\n{4,}/); // 4+ newlines = page break
            
            if (sections.length > 1) {
                // Multiple sections found
                sections.forEach((sectionText, index) => {
                    if (sectionText.trim()) {
                        pageTexts.push({
                            text: sectionText.trim(),
                            pageNo: index + 1
                        });
                    }
                });
            } else {
                // Single continuous text - split by character count
                const maxCharsPerPage = 3000; // ~1 page of text
                const lines = text.split('\n');
                let currentPage = [];
                let currentCharCount = 0;
                let pageNo = 1;

                lines.forEach(line => {
                    currentPage.push(line);
                    currentCharCount += line.length;

                    if (currentCharCount >= maxCharsPerPage) {
                        pageTexts.push({
                            text: currentPage.join('\n').trim(),
                            pageNo: pageNo++
                        });
                        currentPage = [];
                        currentCharCount = 0;
                    }
                });

                // Add remaining lines
                if (currentPage.length > 0) {
                    pageTexts.push({
                        text: currentPage.join('\n').trim(),
                        pageNo: pageNo
                    });
                }
            }

            // Fallback: if no pages created, treat entire file as single page
            if (pageTexts.length === 0 && text.trim()) {
                pageTexts.push({
                    text: text.trim(),
                    pageNo: 1
                });
            }

            console.log(`[DocumentProcessor] Extracted ${pageTexts.length} sections from TXT`);
            return pageTexts;
        } catch (error) {
            console.error('[DocumentProcessor] Error extracting from TXT:', error);
            throw new Error(`Failed to extract text from TXT: ${error.message}`);
        }
    }

    /**
     * Get file MIME type from extension
     * @param {string} filename - Filename or path
     * @returns {string} MIME type
     */
    static getMimeTypeFromFilename(filename) {
        const ext = path.extname(filename).toLowerCase();
        
        const mimeMap = {
            '.pdf': SUPPORTED_MIME_TYPES.PDF,
            '.docx': SUPPORTED_MIME_TYPES.DOCX,
            '.doc': SUPPORTED_MIME_TYPES.DOC,
            '.txt': SUPPORTED_MIME_TYPES.TXT
        };

        return mimeMap[ext] || null;
    }

    /**
     * Check if file type is supported
     * @param {string} mimeType - MIME type to check
     * @returns {boolean} True if supported
     */
    static isSupportedType(mimeType) {
        return Object.values(SUPPORTED_MIME_TYPES).includes(mimeType);
    }

    /**
     * Get list of supported file extensions
     * @returns {Array<string>} Supported extensions
     */
    static getSupportedExtensions() {
        return ['.pdf', '.docx', '.doc', '.txt'];
    }
}

export default DocumentProcessor;
export { SUPPORTED_MIME_TYPES };
