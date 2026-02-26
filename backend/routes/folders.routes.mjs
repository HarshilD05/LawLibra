/**
 * Folders Router
 *
 * All routes require a valid JWT.
 *
 * POST   /api/folders                  — Create a folder
 * GET    /api/folders/tree?caseId=     — Full nested folder tree for a case
 * GET    /api/folders/:id              — Get a single folder by ID
 * PATCH  /api/folders/:id              — Rename a folder
 * DELETE /api/folders/:id              — Delete folder + all descendants + their files
 */

import { Router }       from 'express';
import { authenticate } from '../middleware/auth.middleware.mjs';
import {
    createFolder,
    getFolderTree,
    getFolderById,
    renameFolder,
    deleteFolder,
} from '../controllers/folder.controller.mjs';

const router = Router();

router.use(authenticate);

// NOTE: /tree must be defined BEFORE /:id or Express will try to match
// the string "tree" as a folder UUID and return 404.
router.get('/tree', getFolderTree);

router.post('/',    createFolder);
router.get('/:id',  getFolderById);
router.patch('/:id', renameFolder);
router.delete('/:id', deleteFolder);

export default router;
