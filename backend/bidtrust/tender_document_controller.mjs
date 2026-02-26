/**
 * Tender Document Controller
 * Handles document upload, processing, and retrieval for tenders
 */

import Tender from '../models/tender.mjs';
import Document from '../models/document.mjs';
import DocIngestionService from '../services/doc_ingestion_service.mjs';
import DocumentProcessor, { SUPPORTED_MIME_TYPES } from '../services/document_processor.mjs';
import path from 'path';

/**
 * TenderDocumentController class
 */
class TenderDocumentController {
    /**
     * Initialize controller with ingestion service
     */
    constructor() {
        this.ingestionService = new DocIngestionService();
    }

    /**
     * Upload and process a document for a tender
     * @param {string} tenderId - Tender ID
     * @param {Object} fileData - Uploaded file data
     * @returns {Promise<Object>} Response object with data and status code
     */
    async uploadDocument(tenderId, fileData) {
        try {
            // Validate tender exists
            const tender = await Tender.getTenderById(tenderId);
            if (!tender) {
                return { data: { error: 'Tender not found' }, statusCode: 404 };
            }

            // Validate file data
            if (!fileData || !fileData.path || !fileData.originalname) {
                return { data: { error: 'No file uploaded' }, statusCode: 400 };
            }

            // Determine MIME type
            const mimeType = fileData.mimetype || 
                           DocumentProcessor.getMimeTypeFromFilename(fileData.originalname);

            if (!mimeType || !DocumentProcessor.isSupportedType(mimeType)) {
                return { 
                    data: { 
                        error: `Unsupported file type. Supported: ${DocumentProcessor.getSupportedExtensions().join(', ')}` 
                    }, 
                    statusCode: 400 
                };
            }

            // Prepare storage path (in production, this would be S3/cloud storage)
            const storagePath = `/storage/tenders/${tenderId}/${fileData.originalname}`;

            // Start document ingestion (asynchronous)
            const result = await this.ingestionService.ingestTenderDocument({
                filePath: fileData.path,
                fileName: fileData.originalname,
                mimeType: mimeType,
                tenderId: tenderId,
                storagePath: storagePath
            });

            if (result.success) {
                return {
                    data: {
                        message: 'Document uploaded and processing started',
                        document_id: result.documentId,
                        file_name: result.fileName,
                        pages_extracted: result.pagesExtracted,
                        chunks_created: result.chunksCreated,
                        tender_id: tenderId
                    },
                    statusCode: 201
                };
            } else {
                return { 
                    data: { 
                        error: 'Document processing failed', 
                        details: result.error 
                    }, 
                    statusCode: 500 
                };
            }
        } catch (error) {
            console.error('[TenderDocumentController] Error uploading document:', error);
            return { data: { error: 'Internal server error' }, statusCode: 500 };
        }
    }

    /**
     * Get all documents for a tender
     * @param {string} tenderId - Tender ID
     * @returns {Promise<Object>} Response object with data and status code
     */
    static async getDocumentsByTenderId(tenderId) {
        try {
            // Validate tender exists
            const tender = await Tender.getTenderById(tenderId);
            if (!tender) {
                return { data: { error: 'Tender not found' }, statusCode: 404 };
            }

            // Query documents
            const pool = await import('../config/postgresql.mjs').then(m => m.getPostgreSQLPool());
            const query = `
                SELECT id, tender_id, file_name, file_type, storage_path, 
                       is_processed, processing_error, created_at
                FROM tender_management.tender_documents
                WHERE tender_id = $1
                ORDER BY created_at DESC
            `;
            
            const result = await pool.query(query, [tenderId]);
            
            const documents = result.rows.map(doc => ({
                id: doc.id,
                tender_id: doc.tender_id,
                file_name: doc.file_name,
                file_type: doc.file_type,
                storage_path: doc.storage_path,
                is_processed: doc.is_processed,
                processing_error: doc.processing_error,
                created_at: doc.created_at.toISOString()
            }));

            return {
                data: {
                    message: 'Documents retrieved successfully',
                    tender_id: tenderId,
                    documents,
                    count: documents.length
                },
                statusCode: 200
            };
        } catch (error) {
            console.error('[TenderDocumentController] Error getting documents:', error);
            return { data: { error: 'Internal server error' }, statusCode: 500 };
        }
    }

    /**
     * Get a specific document by ID
     * @param {string} documentId - Document ID
     * @param {string} tenderId - Tender ID (for validation)
     * @returns {Promise<Object>} Response object with data and status code
     */
    static async getDocumentById(documentId, tenderId = null) {
        try {
            const document = await Document.getDocumentById(documentId, 'tender');

            if (!document) {
                return { data: { error: 'Document not found' }, statusCode: 404 };
            }

            // Validate tender_id if provided
            if (tenderId && document.tender_id !== tenderId) {
                return { data: { error: 'Document does not belong to this tender' }, statusCode: 403 };
            }

            return {
                data: {
                    message: 'Document retrieved successfully',
                    document
                },
                statusCode: 200
            };
        } catch (error) {
            console.error('[TenderDocumentController] Error getting document:', error);
            return { data: { error: 'Internal server error' }, statusCode: 500 };
        }
    }

    /**
     * Delete a document
     * @param {string} documentId - Document ID
     * @param {string} tenderId - Tender ID (for validation)
     * @returns {Promise<Object>} Response object with data and status code
     */
    static async deleteDocument(documentId, tenderId = null) {
        try {
            // Get document to verify it exists and belongs to tender
            const document = await Document.getDocumentById(documentId, 'tender');

            if (!document) {
                return { data: { error: 'Document not found' }, statusCode: 404 };
            }

            // Validate tender_id if provided
            if (tenderId && document.tender_id !== tenderId) {
                return { data: { error: 'Document does not belong to this tender' }, statusCode: 403 };
            }

            // Delete document (cascades to chunks)
            const success = await Document.deleteDocument(documentId, 'tender');

            if (success) {
                return {
                    data: {
                        message: 'Document and associated chunks deleted successfully',
                        document_id: documentId
                    },
                    statusCode: 200
                };
            } else {
                return { data: { error: 'Failed to delete document' }, statusCode: 500 };
            }
        } catch (error) {
            console.error('[TenderDocumentController] Error deleting document:', error);
            return { data: { error: 'Internal server error' }, statusCode: 500 };
        }
    }

    /**
     * Get chunks for a document
     * @param {string} documentId - Document ID
     * @returns {Promise<Object>} Response object with data and status code
     */
    static async getDocumentChunks(documentId) {
        try {
            // Verify document exists
            const document = await Document.getDocumentById(documentId, 'tender');

            if (!document) {
                return { data: { error: 'Document not found' }, statusCode: 404 };
            }

            // Get chunks
            const chunks = await Document.getChunksByDocumentId(documentId, 'tender');

            return {
                data: {
                    message: 'Document chunks retrieved successfully',
                    document_id: documentId,
                    chunks,
                    count: chunks.length
                },
                statusCode: 200
            };
        } catch (error) {
            console.error('[TenderDocumentController] Error getting document chunks:', error);
            return { data: { error: 'Internal server error' }, statusCode: 500 };
        }
    }
}

export default TenderDocumentController;
