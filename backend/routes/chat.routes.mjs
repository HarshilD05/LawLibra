/**
 * Chat Router
 *
 * All routes require a valid JWT. Access is further gated inside each
 * controller via case assignment checks.
 *
 * POST   /api/chat/threads                      — Create a thread
 * GET    /api/chat/threads?caseId=              — List threads for a case
 * GET    /api/chat/threads/:id                  — Get a single thread
 * PATCH  /api/chat/threads/:id                  — Rename a thread (owner | Admin)
 * DELETE /api/chat/threads/:id                  — Delete thread + messages (owner | Admin)
 * GET    /api/chat/threads/:id/messages         — Get paginated messages
 * POST   /api/chat/threads/:id/messages         — Send a message + receive AI reply
 */

import { Router }       from "express";
import { authenticate } from "../middleware/auth.middleware.mjs";
import {
    createThread,
    getThreads,
    getThreadById,
    renameThread,
    deleteThread,
    getMessages,
    sendMessage,
} from "../controllers/chat.controller.mjs";

const router = Router();

router.use(authenticate);

// Thread CRUD
router.post("/",     createThread);
router.get("/",      getThreads);
router.get("/:id",   getThreadById);
router.patch("/:id", renameThread);
router.delete("/:id", deleteThread);

// Messages — nested under thread
router.get("/:id/messages",  getMessages);
router.post("/:id/messages", sendMessage);

export default router;
