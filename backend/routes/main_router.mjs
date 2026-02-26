/**
 * main_router.mjs
 * Central routing hub for the LawLibra API.
 * All feature routers are mounted here and imported into server.mjs.
 *
 * URL structure: /api/<feature>
 */

import { Router }    from 'express';
import authRouter     from './auth.routes.mjs';
import casesRouter    from './cases.routes.mjs';
import docsRouter     from './documents.routes.mjs';
import foldersRouter  from './folders.routes.mjs';
import chatRouter     from './chat.routes.mjs';

const mainRouter = Router();

// --- Auth ---
mainRouter.use('/auth', authRouter);

// --- Cases ---
mainRouter.use('/cases', casesRouter);

// --- Folders ---
mainRouter.use('/folders', foldersRouter);

// --- Documents ---
mainRouter.use('/documents', docsRouter);

// --- Chat ---
mainRouter.use('/chat/threads', chatRouter);

export default mainRouter;
