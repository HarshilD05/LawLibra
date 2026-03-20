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
 *   Full RAG pipeline: embed query → similarity-thresholded pgvector search
 *   (case-scoped, up to 10 sources) → LLM via LLMFactory → citations stored
 *   in DB. Surrounding transaction and response shape are unchanged.
 */

import { ChatThread, ChatMessage }                    from '../models/chat.model.mjs';
import { Case }                                        from '../models/case.model.mjs';
import { HumanMessage, AIMessage, SystemMessage }      from '@langchain/core/messages';
import db                                              from '../config/db.mjs';
import { createEmbeddingService }                      from '../services/embedding_factory.mjs';
import { createLLM }                                   from '../services/llm_factory.mjs';

// ─── RAG singletons (lazy-initialized on first chat request) ─────────────────
// _llm is created lazily so the HTTP server starts even if the API key is
// missing — the error surfaces only when a message is actually sent.
let _llm                = null;
let _embeddingService   = null;

// ─── Helper ───────────────────────────────────────────────────────────────────

async function resolveCaseAccess(caseId, reqUser) {
    const kase = await Case.findById(caseId);
    if (!kase) return null;
    if (reqUser.role === 'ADMIN') return { kase, accessLevel: 'ADMIN' };
    const accessLevel = await Case.getLawyerAccessLevel(caseId, reqUser.id);
    if (!accessLevel) return null;
    return { kase, accessLevel };
}

// ─── RAG pipeline ─────────────────────────────────────────────────────────────

/**
 * Generates the AI response for a user message using the full RAG pipeline.
 *
 * Steps:
 *   1. Lazy-init the LLM singleton via LLMFactory (provider from .env)
 *   2. Embed userContent → 768-dim query vector
 *   3. Similarity-thresholded pgvector search on doc_chunks (case-scoped, top 10)
 *   4. Guard: return graceful message if no chunks meet the threshold
 *   5. Build LangChain messages: SystemMessage + history + numbered sources + question
 *   6. Invoke LLM
 *   7. Return { aiContent, citations }
 *
 * .env tunables:
 *   LLM_PROVIDER              gemini | groq | openai | anthropic | ollama  (default: gemini)
 *   LLM_MODEL                 optional model override
 *   RAG_SIMILARITY_THRESHOLD  cosine similarity floor, 0–1  (default: 0.65)
 *
 * @param {string}        userContent
 * @param {string}        caseId
 * @param {ChatMessage[]} conversationHistory  Recent messages for multi-turn context
 * @returns {Promise<{ aiContent: string, citations: object[]|null }>}
 */
async function _generateAIResponse(userContent, caseId, conversationHistory) {
    // ── 1. Lazy-init LLM singleton ────────────────────────────────────────────
    if (!_llm) {
        _llm = await createLLM();
    }

    // ── 2. Embed the user query ───────────────────────────────────────────────
    if (!_embeddingService) {
        _embeddingService = await createEmbeddingService();
    }
    const queryVector = await _embeddingService.embedText(userContent);
    const pgVector    = `[${queryVector.join(',')}]`;

    // ── 3. Similarity-thresholded vector search — case-scoped, max 10 ─────────
    // RAG_SIMILARITY_THRESHOLD: cosine similarity floor (0–1).
    // Only chunks with similarity >= threshold are returned, capped at 10.
    // Legal RAG benefits from broad, high-quality context — 10 sources at 0.65
    // strikes the right balance between precision and recall.
    const threshold = parseFloat(process.env.RAG_SIMILARITY_THRESHOLD ?? '0.65');

    const { rows: chunks } = await db.query(
        `SELECT
             dc.id,
             dc.original_text,
             dc.page_number,
             d.original_name,
             d.id                                       AS document_id,
             1 - (dc.embedding <=> $1::vector)          AS similarity
         FROM doc_chunks dc
         JOIN documents  d ON d.id = dc.document_id
         WHERE d.case_id           = $2
           AND d.processing_status = 'DONE'
           AND 1 - (dc.embedding <=> $1::vector) >= $3
         ORDER BY dc.embedding <=> $1::vector
         LIMIT 10`,
        [pgVector, caseId, threshold],
    );

    console.log(`[Chat RAG] Query matched ${chunks.length} chunks (threshold: ${threshold}, caseId: ${caseId})`);

    // ── 4. Guard — no chunks above threshold ─────────────────────────────────
    if (chunks.length === 0) {
        return {
            aiContent:
                'No sufficiently relevant documents were found in this case to answer your question. ' +
                'Please ensure the relevant documents have been uploaded and fully processed, ' +
                'or try rephrasing your query with different keywords.',
            citations: null,
        };
    }

    // ── 5. Build LangChain messages array ─────────────────────────────────────
    const systemPrompt =
        'You are a precise legal AI assistant for a law firm.\n' +
        'Your answers must be based ONLY on the numbered source excerpts provided in the user message.\n\n' +
        'Rules:\n' +
        '- Answer strictly from the provided sources. Do NOT use external knowledge or assumptions.\n' +
        '- Every factual claim MUST be cited as [Doc: <document name>, Page <page number>].\n' +
        '- If the sources do not contain enough information to fully answer, state that explicitly — do NOT guess or infer.\n' +
        '- Be concise, professional, and precise. Legal accuracy is critical.';

    // Map stored conversation history to LangChain message types
    const historyMessages = conversationHistory.map(msg =>
        msg.senderType === 'USER'
            ? new HumanMessage(msg.content)
            : new AIMessage(msg.content)
    );

    // Format all retrieved chunks as a numbered source list
    const sourcesBlock = chunks
        .map((c, i) =>
            `[${i + 1}] "${c.original_name}" — Page ${c.page_number} ` +
            `(similarity: ${parseFloat(c.similarity).toFixed(2)})\n${c.original_text}`
        )
        .join('\n\n---\n\n');

    const finalUserMessage = new HumanMessage(
        `SOURCES:\n${sourcesBlock}\n\nQUESTION: ${userContent}`
    );

    const messages = [
        new SystemMessage(systemPrompt),
        ...historyMessages,
        finalUserMessage,
    ];

    // ── 6. Invoke LLM ─────────────────────────────────────────────────────────
    const response  = await _llm.invoke(messages);

    // Normalize content — some providers return structured parts instead of a plain string
    const aiContent = typeof response.content === 'string'
        ? response.content
        : response.content
            .map(part => (typeof part === 'string' ? part : (part.text ?? '')))
            .join('');

    // ── 7. Build citations array (stored in chat_messages.citations JSONB) ────
    const citations = chunks.map(c => ({
        chunkId:      c.id,
        documentId:   c.document_id,
        documentName: c.original_name,
        pageNumber:   c.page_number,
        similarity:   parseFloat(parseFloat(c.similarity).toFixed(4)),
    }));

    return { aiContent, citations };
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
