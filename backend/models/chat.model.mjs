/**
 * Chat Model — ChatThread + ChatMessage
 *
 * Two tightly coupled classes in one file since messages only exist within
 * threads and the two are never used independently.
 *
 * position_index convention (UNIQUE per thread):
 *   0, 2, 4 ... = USER messages
 *   1, 3, 5 ... = AI   messages
 *
 * Inserting a pair (user + AI) is always done in a single transaction so the
 * index sequence stays consistent even under concurrent requests.
 */

import db from "../config/db.mjs";

// ─── ChatThread ───────────────────────────────────────────────────────────────

export class ChatThread {
    constructor(row) {
        this.id        = row.id;
        this.caseId    = row.case_id;
        this.userId    = row.user_id;
        this.title     = row.title;
        this.createdAt = row.created_at;
        // Populated by findByCaseId join — not present on all queries
        this.messageCount = row.message_count !== undefined
            ? parseInt(row.message_count, 10)
            : undefined;
    }

    toObject() {
        const obj = {
            id:        this.id,
            caseId:    this.caseId,
            userId:    this.userId,
            title:     this.title,
            createdAt: this.createdAt,
        };
        if (this.messageCount !== undefined) obj.messageCount = this.messageCount;
        return obj;
    }

    // ─── Create ───────────────────────────────────────────────────────────────

    /**
     * Creates a new chat thread for a case.
     * Title defaults to "New Thread" if not provided.
     *
     * @param {{ caseId, userId, title? }} data
     * @returns {Promise<ChatThread>}
     */
    static async create({ caseId, userId, title }) {
        const { rows } = await db.query(
            `INSERT INTO chat_threads (case_id, user_id, title)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [caseId, userId, title?.trim() || "New Thread"],
        );
        return new ChatThread(rows[0]);
    }

    // ─── Read ─────────────────────────────────────────────────────────────────

    /**
     * Find a single thread by ID. Returns null if not found.
     */
    static async findById(id) {
        const { rows } = await db.query(
            "SELECT * FROM chat_threads WHERE id = $1",
            [id],
        );
        return rows[0] ? new ChatThread(rows[0]) : null;
    }

    /**
     * List all threads for a case, newest first.
     * Includes a message_count for each thread so the client can show
     * a preview without fetching full message history.
     *
     * @param {string} caseId
     * @param {{ limit?: number, offset?: number }} opts
     * @returns {Promise<{ threads: ChatThread[], total: number }>}
     */
    static async findByCaseId(caseId, { limit = 20, offset = 0 } = {}) {
        const [dataRes, countRes] = await Promise.all([
            db.query(
                `SELECT t.*,
                        COUNT(m.id) AS message_count
                 FROM chat_threads t
                 LEFT JOIN chat_messages m ON m.thread_id = t.id
                 WHERE t.case_id = $1
                 GROUP BY t.id
                 ORDER BY t.created_at DESC
                 LIMIT $2 OFFSET $3`,
                [caseId, limit, offset],
            ),
            db.query(
                "SELECT COUNT(*) FROM chat_threads WHERE case_id = $1",
                [caseId],
            ),
        ]);

        return {
            threads: dataRes.rows.map(r => new ChatThread(r)),
            total:   parseInt(countRes.rows[0].count, 10),
        };
    }

    // ─── Update ───────────────────────────────────────────────────────────────

    /**
     * Rename a thread.
     *
     * @param {string} id
     * @param {string} title
     * @returns {Promise<ChatThread|null>}
     */
    static async updateTitle(id, title) {
        const { rows } = await db.query(
            `UPDATE chat_threads SET title = $2 WHERE id = $1 RETURNING *`,
            [id, title],
        );
        return rows[0] ? new ChatThread(rows[0]) : null;
    }

    // ─── Delete ───────────────────────────────────────────────────────────────

    /**
     * Delete a thread. chat_messages cascade via FK (ON DELETE CASCADE).
     *
     * @param {string} id
     * @returns {Promise<ChatThread|null>}
     */
    static async deleteById(id) {
        const { rows } = await db.query(
            "DELETE FROM chat_threads WHERE id = $1 RETURNING *",
            [id],
        );
        return rows[0] ? new ChatThread(rows[0]) : null;
    }
}

// ─── ChatMessage ──────────────────────────────────────────────────────────────

export class ChatMessage {
    constructor(row) {
        this.id            = row.id;
        this.threadId      = row.thread_id;
        this.positionIndex = row.position_index;
        this.senderType    = row.sender_type;
        this.content       = row.content;
        this.citations     = row.citations ?? null;
        this.createdAt     = row.created_at;
    }

    toObject() {
        return {
            id:            this.id,
            threadId:      this.threadId,
            positionIndex: this.positionIndex,
            senderType:    this.senderType,
            content:       this.content,
            citations:     this.citations,
            createdAt:     this.createdAt,
        };
    }

    // ─── Read ─────────────────────────────────────────────────────────────────

    /**
     * Returns all messages in a thread ordered by position_index, with
     * optional pagination.
     *
     * @param {string} threadId
     * @param {{ limit?: number, offset?: number }} opts
     * @returns {Promise<{ messages: ChatMessage[], total: number }>}
     */
    static async findByThreadId(threadId, { limit = 50, offset = 0 } = {}) {
        const [dataRes, countRes] = await Promise.all([
            db.query(
                `SELECT * FROM chat_messages
                 WHERE thread_id = $1
                 ORDER BY position_index ASC
                 LIMIT $2 OFFSET $3`,
                [threadId, limit, offset],
            ),
            db.query(
                "SELECT COUNT(*) FROM chat_messages WHERE thread_id = $1",
                [threadId],
            ),
        ]);

        return {
            messages: dataRes.rows.map(r => new ChatMessage(r)),
            total:    parseInt(countRes.rows[0].count, 10),
        };
    }

    /**
     * Returns the N most recent messages in a thread.
     * Used to build the conversation history context for the LLM prompt.
     *
     * @param {string} threadId
     * @param {number} limit     Number of most recent messages
     * @returns {Promise<ChatMessage[]>}  Ordered oldest → newest
     */
    static async getRecentHistory(threadId, limit = 10) {
        const { rows } = await db.query(
            `SELECT * FROM (
                SELECT * FROM chat_messages
                WHERE thread_id = $1
                ORDER BY position_index DESC
                LIMIT $2
             ) sub
             ORDER BY position_index ASC`,
            [threadId, limit],
        );
        return rows.map(r => new ChatMessage(r));
    }

    // ─── Write ────────────────────────────────────────────────────────────────

    /**
     * Atomically inserts a USER message and its AI response as a pair.
     *
     * Uses SELECT FOR UPDATE to lock the thread row, preventing race conditions
     * on position_index when concurrent requests hit the same thread.
     *
     * @param {string}   threadId
     * @param {string}   userContent    The user"s question
     * @param {string}   aiContent      The AI"s response
     * @param {object[]|null} citations Array of citation objects to attach to AI message
     * @returns {Promise<{ userMessage: ChatMessage, aiMessage: ChatMessage }>}
     */
    static async addExchange(threadId, userContent, aiContent, citations = null) {
        const client = await db.connect();
        try {
            await client.query("BEGIN");

            // Lock the thread row to serialise concurrent inserts
            await client.query(
                "SELECT id FROM chat_threads WHERE id = $1 FOR UPDATE",
                [threadId],
            );

            // Determine next position_index
            const { rows: maxRows } = await client.query(
                "SELECT COALESCE(MAX(position_index), -1) AS max_idx FROM chat_messages WHERE thread_id = $1",
                [threadId],
            );
            const nextIdx = parseInt(maxRows[0].max_idx, 10) + 1;

            // Insert USER message (even index)
            const { rows: userRows } = await client.query(
                `INSERT INTO chat_messages (thread_id, position_index, sender_type, content)
                 VALUES ($1, $2, 'USER', $3)
                 RETURNING *`,
                [threadId, nextIdx, userContent],
            );

            // Insert AI message (odd index = nextIdx + 1)
            const { rows: aiRows } = await client.query(
                `INSERT INTO chat_messages (thread_id, position_index, sender_type, content, citations)
                 VALUES ($1, $2, 'AI', $3, $4)
                 RETURNING *`,
                [threadId, nextIdx + 1, aiContent, citations ? JSON.stringify(citations) : null],
            );

            await client.query("COMMIT");

            return {
                userMessage: new ChatMessage(userRows[0]),
                aiMessage:   new ChatMessage(aiRows[0]),
            };
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
    }
}
