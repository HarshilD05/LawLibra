/**
 * main_router.mjs
 * Central routing hub for the LawLibra API.
 * All feature routers are mounted here and imported into server.mjs.
 *
 * URL structure: /api/<feature>
 */

import { Router } from 'express';
import authRouter  from './auth.routes.mjs';
import casesRouter from './cases.routes.mjs';

const mainRouter = Router();

// --- Auth ---
mainRouter.use('/auth', authRouter);

// --- Cases ---
mainRouter.use('/cases', casesRouter);


export default mainRouter;
