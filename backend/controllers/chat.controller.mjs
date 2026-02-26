/**
 * Chat Controller
 *
 * Manages chat threads and messages within a case.
 *
 * Access rules:
 *   - Create thread / Send message : any case assignment (VIEW, EDIT, ADMIN)
 *     (Lawyers with VIEW access can still ask questions — they just can't upload)
 *   - List / Get thread / Get messages : any case assignment
 *   - Rename thread : thread owner OR Admin
 *   - Delete thread : thread owner OR Admin
 *
 * RAG Query (sendMessage):
 *   The AI response generation is isolated in _generateAIResponse().
 *   Currently returns a placeholder stub. When the RAG pipeline is ready,
 *   only that function needs to change — the surrounding transaction,
 *   message storage, and response shape all stay the same.
 */

import { ChatThread, ChatMessage } from '../models/chat.model.mjs';
import { Case }                    from '../models/case.model.mjs';

// ─── Helper ───────────────────────────────────────────────────────────────────

async function resolveCaseAccess(caseId, reqUser) {
    const kase = await Case.findById(caseId);
    if (!kase) return null;
    if (reqUser.role === 'ADMIN') return { kase, accessLevel: 'ADMIN' };
    const accessLevel = await Case.getLawyerAccessLevel(caseId, reqUser.id);
    if (!accessLevel) return null;
    return { kase, accessLevel };
}

// ─── RAG stub ─────────────────────────────────────────────────────────────────

/**
 * Generates the AI response for a user message.
 *
 * TODO: Replace this stub with the actual RAG pipeline:
 *   1. Embed userContent → 768-dim query vector
 *   2. Hybrid search: pgvector cosine on doc_chunks (case-scoped) + keyword filter
 *   3. Retrieve top-K chunks with page numbers and document names
 *   4. Build LLM prompt: system prompt + retrieved chunks + conversationHistory + userContent
 *   5. Call Gemini API (streaming optional)
 *   6. Return { aiContent, citations }
 *
 * @param {string}        userContent
 * @param {string}        caseId
 * @param {ChatMessage[]} conversationHistory  Recent messages for multi-turn context
 * @returns {Promise<{ aiContent: string, citations: object[]|null }>}
 */
async function _generateAIResponse(userContent, caseId, conversationHistory) {
    // ── STUB: replace this block entirely when RAG is implemented ─────────────
    return {
        aiContent:  `[RAG not yet implemented] Your question was: "${userContent}"`,
        citations:  null,
    };
    // ─────────────────────────────────────────────────────────────────────────
}

// ─── Thread CRUD ──────────────────────────────────────────────────────────────

/**
 * POST /api/chat/threads
 * Body: { caseId, title? }
 * Any assigned user. Creates a new thread for the case.
 */
export const createThread = async (req, res) => {
    try {
        const { caseId, title } = req.body;
        if (!caseId?.trim()) return res.status(400).json({ error: 'caseId is required.' });

        const access = await resolveCaseAccess(caseId, req.user);
        if (!access) return res.status(404).json({ error: 'Case not found or access denied.' });

        const thread = await ChatThread.create({ caseId, userId: req.user.id, title });
        return res.status(201).json({ thread: thread.toObject() });

    } catch (err) {
        console.error('[Chat] createThread error:', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

/**
 * GET /api/chat/threads?caseId=&limit=20&offset=0
 * Any assigned user. Lists all threads for a case, newest first.
 * Includes messageCount per thread.
 */
export const getThreads = async (req, res) => {
    try {
        const { caseId } = req.query;
        if (!caseId) return res.status(400).json({ error: 'caseId query parameter is required.' });

        const access = await resolveCaseAccess(caseId, req.user);
        if (!access) return res.status(404).json({ error: 'Case not found or access denied.' });

        const limit  = Math.min(parseInt(req.query.limit)  || 20, 100);
        const offset = Math.max(parseInt(req.query.offset) || 0,  0);

        const { threads, total } = await ChatThread.findByCaseId(caseId, { limit, offset });

        return res.status(200).json({
            data: threads.map(t => t.toObject()),
            total, limit, offset,
        });

    } catch (err) {
        console.error('[Chat] getThreads error:', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

/**
 * GET /api/chat/threads/:id
 * Any assigned user.
 */
export const getThreadById = async (req, res) => {
    try {
        const thread = await ChatThread.findById(req.params.id);
        if (!thread) return res.status(404).json({ error: 'Thread not found.' });

        const access = await resolveCaseAccess(thread.caseId, req.user);
        if (!access) return res.status(403).json({ error: 'Access denied.' });

        return res.status(200).json({ thread: thread.toObject() });

    } catch (err) {
        console.error('[Chat] getThreadById error:', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

/**
 * PATCH /api/chat/threads/:id
 * Body: { title }
 * Thread owner or Admin.
 */
export const renameThread = async (req, res) => {
    try {
        const { title } = req.body;
        if (!title?.trim()) return res.status(400).json({ error: 'title is required.' });

        const thread = await ChatThread.findById(req.params.id);
        if (!thread) return res.status(404).json({ error: 'Thread not found.' });

        const access = await resolveCaseAccess(thread.caseId, req.user);
        if (!access) return res.status(403).json({ error: 'Access denied.' });

        // Only the thread's creator or an Admin may rename it
        if (req.user.role !== 'ADMIN' && thread.userId !== req.user.id) {
            return res.status(403).json({ error: 'Only the thread owner or an Admin can rename this thread.' });
        }

        const updated = await ChatThread.updateTitle(req.params.id, title.trim());
        return res.status(200).json({ thread: updated.toObject() });

    } catch (err) {
        console.error('[Chat] renameThread error:', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

/**
 * DELETE /api/chat/threads/:id
 * Thread owner or Admin. Cascades to all messages.
 */
export const deleteThread = async (req, res) => {
    try {
        const thread = await ChatThread.findById(req.params.id);
        if (!thread) return res.status(404).json({ error: 'Thread not found.' });

        const access = await resolveCaseAccess(thread.caseId, req.user);
        if (!access) return res.status(403).json({ error: 'Access denied.' });

        if (req.user.role !== 'ADMIN' && thread.userId !== req.user.id) {
            return res.status(403).json({ error: 'Only the thread owner or an Admin can delete this thread.' });
        }

        await ChatThread.deleteById(req.params.id);
        return res.status(200).json({ message: 'Thread deleted successfully.' });

    } catch (err) {
        console.error('[Chat] deleteThread error:', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

// ─── Messages ─────────────────────────────────────────────────────────────────

/**
 * GET /api/chat/threads/:id/messages?limit=50&offset=0
 * Any assigned user. Returns messages ordered by position_index ascending.
 */
export const getMessages = async (req, res) => {
    try {
        const thread = await ChatThread.findById(req.params.id);
        if (!thread) return res.status(404).json({ error: 'Thread not found.' });

        const access = await resolveCaseAccess(thread.caseId, req.user);
        if (!access) return res.status(403).json({ error: 'Access denied.' });

        const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
        const offset = Math.max(parseInt(req.query.offset) || 0,  0);

        const { messages, total } = await ChatMessage.findByThreadId(req.params.id, { limit, offset });

        return res.status(200).json({
            data: messages.map(m => m.toObject()),
            total, limit, offset,
        });

    } catch (err) {
        console.error('[Chat] getMessages error:', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

/**
 * POST /api/chat/threads/:id/messages
 * Body: { content }
 * Any assigned user.
 *
 * Stores the user's message, calls _generateAIResponse(), stores the AI reply,
 * and returns both in one response. The entire exchange is atomic — both
 * messages are written in a single DB transaction.
 *
 * When the RAG pipeline is ready, only _generateAIResponse() changes.
 */
export const sendMessage = async (req, res) => {
    try {
        const { content } = req.body;
        if (!content?.trim()) return res.status(400).json({ error: 'Message content is required.' });

        const thread = await ChatThread.findById(req.params.id);
        if (!thread) return res.status(404).json({ error: 'Thread not found.' });

        const access = await resolveCaseAccess(thread.caseId, req.user);
        if (!access) return res.status(403).json({ error: 'Access denied.' });

        // Fetch recent history for multi-turn LLM context (last 10 messages)
        const history = await ChatMessage.getRecentHistory(req.params.id, 10);

        // Generate AI response (stub → RAG pipeline later)
        const { aiContent, citations } = await _generateAIResponse(
            content.trim(),
            thread.caseId,
            history,
        );

        // Atomically write both messages with locked position_index
        const { userMessage, aiMessage } = await ChatMessage.addExchange(
            req.params.id,
            content.trim(),
            aiContent,
            citations,
        );

        return res.status(201).json({
            userMessage: userMessage.toObject(),
            aiMessage:   aiMessage.toObject(),
        });

    } catch (err) {
        console.error('[Chat] sendMessage error:', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};
