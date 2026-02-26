/**
 * Document Ingestion Service
 * Orchestrates the complete RAG pipeline: Extract → Process → Embed → Store
 * Runs asynchronously for background processing
 */

import DocumentProcessor from './document_processor.mjs';
import DocumentUtils from '../utils/document_utils.mjs';
import EmbeddingService from './embedding_service.mjs';
import Document from '../models/tender_document.mjs';
import CompanyDocument from '../models/company_document.mjs';
import fs from 'fs/promises';

/**
 * DocIngestionService class
 * Handles end-to-end document ingestion pipeline
 */
class DocIngestionService {
    /**
     * Initialize the ingestion service
     */
    constructor() {
        this.embedder = null;
        this.isProcessing = false;
        this.currentJobs = new Map(); // Track active ingestion jobs
    }

    /**
     * Initialize embedding service (lazy loading)
     * @private
     */
    async _getEmbedder() {
        if (!this.embedder) {
            this.embedder = new EmbeddingService();
        }
        return this.embedder;
    }

    /**
     * Ingest a document for tender management
     * @param {Object} options - Ingestion options
     * @param {string} options.filePath - Path to the uploaded file
     * @param {string} options.fileName - Original filename
     * @param {string} options.mimeType - File MIME type
     * @param {string} options.tenderId - Tender ID to associate with
     * @param {string} options.storagePath - Path where file will be permanently stored
     * @returns {Promise<Object>} Processing result
     */
    async ingestTenderDocument(options) {
        const { filePath, fileName, mimeType, tenderId, storagePath } = options;
        
        if (!filePath || !fileName || !mimeType || !tenderId || !storagePath) {
            throw new Error('Missing required parameters for tender document ingestion');
        }

        const jobId = `tender_${tenderId}_${Date.now()}`;
        console.log(`[DocIngestion] Starting ingestion job: ${jobId}`);

        try {
            // Mark job as active
            this.currentJobs.set(jobId, { status: 'processing', startTime: Date.now() });

            // Step 1: Create document record
            const documentData = {
                tender_id: tenderId,
                file_name: fileName,
                file_type: mimeType,
                storage_path: storagePath,
                is_processed: false,
                processing_error: null
            };

            const documentId = await Document.createDocument(documentData);
            
            if (!documentId) {
                throw new Error('Failed to create document record');
            }

            console.log(`[DocIngestion] Created document record: ${documentId}`);

            // Step 2: Extract page texts from document
            const pageTexts = await DocumentProcessor.extractPageTexts(filePath, mimeType);
            console.log(`[DocIngestion] Extracted ${pageTexts.length} pages`);

            // Step 3: Process document (clean, chunk, extract keywords)
            const embedder = await this._getEmbedder();
            const processedChunks = await DocumentUtils.processDocument(pageTexts, embedder);
            console.log(`[DocIngestion] Processed ${processedChunks.length} chunks`);

            // Step 4: Generate embeddings for all chunks
            const embeddedChunks = await embedder.embedChunks(processedChunks);
            console.log(`[DocIngestion] Generated embeddings for ${embeddedChunks.length} chunks`);

            // Step 5: Store chunks in database
            const chunksStored = await Document.insertChunks(documentId, embeddedChunks);
            
            if (!chunksStored) {
                throw new Error('Failed to store chunks in database');
            }

            // Step 6: Update document processing status
            await Document.updateProcessingStatus(documentId, true, null);

            // Clean up job tracking
            this.currentJobs.delete(jobId);

            console.log(`[DocIngestion] Successfully completed job: ${jobId}`);

            return {
                success: true,
                documentId: documentId,
                fileName: fileName,
                pagesExtracted: pageTexts.length,
                chunksCreated: embeddedChunks.length,
                jobId: jobId
            };
        } catch (error) {
            console.error(`[DocIngestion] Error in job ${jobId}:`, error);

            // Update processing status with error if document was created
            if (options.documentId) {
                await Document.updateProcessingStatus(
                    options.documentId, 
                    false, 
                    error.message
                );
            }

            // Clean up job tracking
            this.currentJobs.set(jobId, { status: 'failed', error: error.message });

            return {
                success: false,
                error: error.message,
                jobId: jobId
            };
        }
    }

    /**
     * Ingest a document for company knowledge base
     * @param {Object} options - Ingestion options
     * @param {string} companySlug - Company slug identifier
     * @param {string} documentId - Pre-created document ID
     * @param {string} filePath - Path to the uploaded file
     * @returns {Promise<Object>} Processing result
     */
    async ingestCompanyDocument(companySlug, documentId, filePath) {
        if (!companySlug || !documentId || !filePath) {
            throw new Error('Missing required parameters for company document ingestion');
        }

        const jobId = `company_${companySlug}_${Date.now()}`;
        console.log(`[DocIngestion] Starting ingestion job: ${jobId}`);

        try {
            // Mark job as active
            this.currentJobs.set(jobId, { status: 'processing', startTime: Date.now() });

            // Step 1: Get document details
            const document = await CompanyDocument.getDocumentById(companySlug, documentId);
            if (!document) {
                throw new Error('Document not found');
            }

            // Determine MIME type from file extension
            const mimeType = this._getMimeTypeFromFilePath(filePath);

            // Step 2: Extract page texts from document
            const pageTexts = await DocumentProcessor.extractPageTexts(filePath, mimeType);
            console.log(`[DocIngestion] Extracted ${pageTexts.length} pages`);

            // Step 3: Process document (clean, chunk, extract keywords)
            const embedder = await this._getEmbedder();
            const processedChunks = await DocumentUtils.processDocument(pageTexts, embedder);
            console.log(`[DocIngestion] Processed ${processedChunks.length} chunks`);

            // Step 4: Generate embeddings for all chunks
            const embeddedChunks = await embedder.embedChunks(processedChunks);
            console.log(`[DocIngestion] Generated embeddings for ${embeddedChunks.length} chunks`);

            // Step 5: Store chunks in database using CompanyDocument model
            const chunksStored = await CompanyDocument.insertChunks(
                companySlug,
                documentId, 
                embeddedChunks
            );
            
            if (!chunksStored) {
                throw new Error('Failed to store chunks in database');
            }

            // Clean up job tracking
            this.currentJobs.delete(jobId);

            console.log(`[DocIngestion] Successfully completed job: ${jobId}`);

            return {
                success: true,
                documentId: documentId,
                fileName: document.title,
                pagesExtracted: pageTexts.length,
                chunksCreated: embeddedChunks.length,
                jobId: jobId
            };
        } catch (error) {
            console.error(`[DocIngestion] Error in job ${jobId}:`, error);

            // Clean up job tracking
            this.currentJobs.set(jobId, { status: 'failed', error: error.message });

            return {
                success: false,
                error: error.message,
                jobId: jobId
            };
        }
    }

    /**
     * Determine MIME type from file path
     * @param {string} filePath - File path
     * @returns {string} MIME type
     * @private
     */
    _getMimeTypeFromFilePath(filePath) {
        const ext = filePath.toLowerCase().split('.').pop();
        const mimeTypes = {
            'pdf': 'application/pdf',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'txt': 'text/plain'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }

    /**
     * Process document ingestion asynchronously (fire and forget)
     * @param {string} type - 'tender' or 'company'
     * @param {Object} options - Ingestion options
     * @returns {Promise<string>} Job ID for tracking
     */
    async processAsync(type, options) {
        const jobId = `${type}_${Date.now()}`;
        
        // Start processing in background (don't await)
        setImmediate(async () => {
            try {
                if (type === 'tender') {
                    await this.ingestTenderDocument(options);
                } else if (type === 'company') {
                    await this.ingestCompanyDocument(options);
                }
            } catch (error) {
                console.error(`[DocIngestion] Async processing error for ${jobId}:`, error);
            }
        });

        return jobId;
    }

    /**
     * Get status of an ingestion job
     * @param {string} jobId - Job ID
     * @returns {Object|null} Job status or null if not found
     */
    getJobStatus(jobId) {
        return this.currentJobs.get(jobId) || null;
    }

    /**
     * Get all active jobs
     * @returns {Map} Map of active jobs
     */
    getActiveJobs() {
        return new Map(this.currentJobs);
    }

    /**
     * Clean up temporary file after processing
     * @param {string} filePath - Path to temporary file
     * @private
     */
    async _cleanupTempFile(filePath) {
        try {
            await fs.unlink(filePath);
            console.log(`[DocIngestion] Cleaned up temporary file: ${filePath}`);
        } catch (error) {
            console.warn(`[DocIngestion] Failed to clean up temporary file: ${filePath}`, error);
        }
    }
}

export default DocIngestionService;
