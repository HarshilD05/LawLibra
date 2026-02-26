/**
 * Company Document Controller
 * Business logic layer for company document operations
 */

import CompanyDocument from '../models/company_document.mjs';
import DocIngestionService from '../services/doc_ingestion_service.mjs';
import path from 'node:path';

class CompanyDocumentController {
    /**
     * Upload and process a company document
     * Note: Requires multer middleware for file upload
     */
    static async uploadDocument(req, res) {
        try {
            const { companySlug } = req.tenant;
            const { title, category, valid_until, created_by } = req.body;
            
            // Check if file was uploaded
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No file uploaded'
                });
            }
            
            // Validation
            if (!title) {
                return res.status(400).json({
                    success: false,
                    message: 'Document title is required'
                });
            }
            
            // Validate category
            const validCategories = ['CERTIFICATION', 'FINANCIAL', 'CASE_STUDY', 'RESUME', 'OTHER'];
            if (category && !validCategories.includes(category)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid category. Must be one of: ${validCategories.join(', ')}`
                });
            }
            
            // Validate file type
            const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
            if (!allowedTypes.includes(req.file.mimetype)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid file type. Only PDF, DOCX, and TXT files are allowed'
                });
            }
            
            const file_path = req.file.path;
            const file_type = path.extname(req.file.originalname).substring(1).toUpperCase();
            
            // Create document record
            const document = await CompanyDocument.createDocument(companySlug, {
                title,
                category,
                file_path,
                file_type,
                valid_until,
                created_by
            });
            
            // Process document asynchronously (RAG pipeline)
            const jobId = await DocIngestionService.processAsync(async () => {
                await DocIngestionService.ingestCompanyDocument(
                    companySlug,
                    document.id,
                    file_path
                );
            });
            
            res.status(201).json({
                success: true,
                data: document,
                processing: {
                    jobId,
                    message: 'Document is being processed in the background'
                }
            });
        } catch (error) {
            console.error('[CompanyDocumentController] Error uploading document:', error);
            res.status(500).json({
                success: false,
                message: 'Error uploading document'
            });
        }
    }

    /**
     * Get document by ID
     */
    static async getDocumentById(req, res) {
        try {
            const { companySlug } = req.tenant;
            const { documentId } = req.params;
            
            const document = await CompanyDocument.getDocumentById(companySlug, documentId);
            
            if (!document) {
                return res.status(404).json({
                    success: false,
                    message: 'Document not found'
                });
            }
            
            res.status(200).json({
                success: true,
                data: document
            });
        } catch (error) {
            console.error('[CompanyDocumentController] Error getting document:', error);
            res.status(500).json({
                success: false,
                message: 'Error getting document'
            });
        }
    }

    /**
     * Get all documents with filtering
     */
    static async getAllDocuments(req, res) {
        try {
            const { companySlug } = req.tenant;
            const { category, created_by, expired, limit, offset } = req.query;
            
            const parsedLimit = limit ? Math.min(parseInt(limit), 100) : 50;
            const parsedOffset = offset ? parseInt(offset) : 0;
            
            if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid limit or offset'
                });
            }
            
            const parsedExpired = expired === 'true';
            
            const documents = await CompanyDocument.getAllDocuments(companySlug, {
                category,
                created_by,
                expired: parsedExpired,
                limit: parsedLimit,
                offset: parsedOffset
            });
            
            res.status(200).json({
                success: true,
                data: documents,
                pagination: {
                    limit: parsedLimit,
                    offset: parsedOffset
                }
            });
        } catch (error) {
            console.error('[CompanyDocumentController] Error getting documents:', error);
            res.status(500).json({
                success: false,
                message: 'Error getting documents'
            });
        }
    }

    /**
     * Get expiring documents
     */
    static async getExpiringDocuments(req, res) {
        try {
            const { companySlug } = req.tenant;
            const { days } = req.query;
            
            const parsedDays = days ? parseInt(days) : 30;
            
            if (isNaN(parsedDays) || parsedDays < 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid days parameter'
                });
            }
            
            const documents = await CompanyDocument.getExpiringDocuments(companySlug, parsedDays);
            
            res.status(200).json({
                success: true,
                data: documents
            });
        } catch (error) {
            console.error('[CompanyDocumentController] Error getting expiring documents:', error);
            res.status(500).json({
                success: false,
                message: 'Error getting expiring documents'
            });
        }
    }

    /**
     * Get document statistics
     */
    static async getDocumentStats(req, res) {
        try {
            const { companySlug } = req.tenant;
            
            const countByCategory = await CompanyDocument.getDocumentCountByCategory(companySlug);
            
            res.status(200).json({
                success: true,
                data: {
                    byCategory: countByCategory
                }
            });
        } catch (error) {
            console.error('[CompanyDocumentController] Error getting document stats:', error);
            res.status(500).json({
                success: false,
                message: 'Error getting document statistics'
            });
        }
    }

    /**
     * Get document chunks (RAG data)
     */
    static async getDocumentChunks(req, res) {
        try {
            const { companySlug } = req.tenant;
            const { documentId } = req.params;
            
            const chunks = await CompanyDocument.getChunksByDocumentId(companySlug, documentId);
            
            res.status(200).json({
                success: true,
                data: chunks
            });
        } catch (error) {
            console.error('[CompanyDocumentController] Error getting document chunks:', error);
            res.status(500).json({
                success: false,
                message: 'Error getting document chunks'
            });
        }
    }

    /**
     * Update document
     */
    static async updateDocument(req, res) {
        try {
            const { companySlug } = req.tenant;
            const { documentId } = req.params;
            const updates = req.body;
            
            // Validate category if provided
            if (updates.category) {
                const validCategories = ['CERTIFICATION', 'FINANCIAL', 'CASE_STUDY', 'RESUME', 'OTHER'];
                if (!validCategories.includes(updates.category)) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid category. Must be one of: ${validCategories.join(', ')}`
                    });
                }
            }
            
            const document = await CompanyDocument.updateDocument(companySlug, documentId, updates);
            
            res.status(200).json({
                success: true,
                data: document
            });
        } catch (error) {
            console.error('[CompanyDocumentController] Error updating document:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating document'
            });
        }
    }

    /**
     * Delete document
     */
    static async deleteDocument(req, res) {
        try {
            const { companySlug } = req.tenant;
            const { documentId } = req.params;
            
            await CompanyDocument.deleteDocument(companySlug, documentId);
            
            res.status(200).json({
                success: true,
                message: 'Document deleted successfully'
            });
        } catch (error) {
            console.error('[CompanyDocumentController] Error deleting document:', error);
            res.status(500).json({
                success: false,
                message: 'Error deleting document'
            });
        }
    }
}

export default CompanyDocumentController;
