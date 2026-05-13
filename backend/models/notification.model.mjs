import db from "../config/db.mjs";

/**
 * Notification Model
 *
 * Manages the per-user notification feed.
 * All type-specific context lives in the `metadata` JSONB column.
 *
 * Usage:
 *   await Notification.create({ userId, notificationType, entityType, msg, metadata });
 *   const { notifications, total } = await Notification.getByUserId(userId);
 *   const count = await Notification.getUnreadCount(userId);
 *   await Notification.markRead(id, userId);
 *   await Notification.markAllRead(userId);
 */

const VALID_TYPES = [
    "CASE_ASSIGNED",
    "CASE_UNASSIGNED",
    "CASE_UPDATED",
    "HEARING_SCHEDULED",
    "DOCUMENT_PROCESSED",
    "DOCUMENT_ERROR",
    "CHAT_RESPONSE_READY",
    "CHAT_ERROR",
    "CHAT_DOCUMENT_PROCESSED",
    "CHAT_DOCUMENT_ERROR",
    "EVENT_REMINDER",
];

const VALID_ENTITY_TYPES = ["CASE", "CHAT", "EVENT"];

class Notification {
    constructor(row) {
        this.id               = row.id;
        this.userId           = row.user_id;
        this.notificationType = row.notification_type;
        this.entityType       = row.entity_type;
        this.msg              = row.msg;
        this.metadata         = row.metadata ?? {};
        this.isRead           = row.is_read;
        this.readAt           = row.read_at ?? null;
        this.createdAt        = row.created_at;
    }

    toObject() {
        return {
            id:               this.id,
            userId:           this.userId,
            notificationType: this.notificationType,
            entityType:       this.entityType,
            msg:              this.msg,
            metadata:         this.metadata,
            isRead:           this.isRead,
            readAt:           this.readAt,
            createdAt:        this.createdAt,
        };
    }

    // ─── Create ──────────────────────────────────────────────────────────────────

    /**
     * Inserts a new notification row for a single user.
     * Called by service hooks (case assignment, doc worker, etc.)
     *
     * @param {{ userId, notificationType, entityType, msg, metadata? }}
     * @returns {Promise<Notification>}
     */
    static async create({ userId, notificationType, entityType, msg, metadata = {} }) {
        const { rows } = await db.query(
            `INSERT INTO notifications
                (user_id, notification_type, entity_type, msg, metadata)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [userId, notificationType, entityType, msg, metadata],
        );
        return new Notification(rows[0]);
    }

    // ─── Read ────────────────────────────────────────────────────────────────────

    /**
     * Paginated notification feed for a user, newest first.
     * Optionally filter by entity_type tab (CASE | CHAT | EVENT).
     *
     * @param {string} userId
     * @param {{ entityType?: string, limit?: number, offset?: number }}
     * @returns {Promise<{ notifications: Notification[], total: number }>}
     */
    static async getByUserId(userId, { entityType, limit = 20, offset = 0 } = {}) {
        const conditions = ["user_id = $1"];
        const params     = [userId];

        if (entityType) {
            params.push(entityType);
            conditions.push(`entity_type = $${params.length}`);
        }

        const where = `WHERE ${conditions.join(" AND ")}`;

        const [dataResult, countResult] = await Promise.all([
            db.query(
                `SELECT * FROM notifications ${where}
                 ORDER BY created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limit, offset],
            ),
            db.query(`SELECT COUNT(*) FROM notifications ${where}`, params),
        ]);

        return {
            notifications: dataResult.rows.map((r) => new Notification(r)),
            total:         parseInt(countResult.rows[0].count, 10),
        };
    }

    /**
     * Returns the number of unread notifications for a user.
     * Covered by the composite index (user_id, is_read).
     *
     * @param {string} userId
     * @returns {Promise<number>}
     */
    static async getUnreadCount(userId) {
        const { rows } = await db.query(
            "SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE",
            [userId],
        );
        return parseInt(rows[0].count, 10);
    }

    // ─── Update ──────────────────────────────────────────────────────────────────

    /**
     * Marks a single notification as read. Ownership enforced via user_id.
     * Returns the updated row, or null if not found / wrong owner.
     *
     * @param {string} id
     * @param {string} userId
     * @returns {Promise<Notification|null>}
     */
    static async markRead(id, userId) {
        const { rows } = await db.query(
            `UPDATE notifications
             SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND user_id = $2 AND is_read = FALSE
             RETURNING *`,
            [id, userId],
        );
        return rows[0] ? new Notification(rows[0]) : null;
    }

    /**
     * Marks ALL unread notifications for a user as read in one query.
     *
     * @param {string} userId
     * @returns {Promise<number>} Count of rows updated
     */
    static async markAllRead(userId) {
        const { rowCount } = await db.query(
            `UPDATE notifications
             SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
             WHERE user_id = $1 AND is_read = FALSE`,
            [userId],
        );
        return rowCount;
    }

    // ─── Delete ──────────────────────────────────────────────────────────────────

    /**
     * Deletes a single notification by ID. Ownership enforced via user_id.
     *
     * @param {string} id
     * @param {string} userId
     * @returns {Promise<boolean>}
     */
    static async deleteById(id, userId) {
        const { rowCount } = await db.query(
            "DELETE FROM notifications WHERE id = $1 AND user_id = $2",
            [id, userId],
        );
        return rowCount > 0;
    }

    /**
     * Hard-deletes all read notifications older than `daysOld` for a user.
     * Intended for the archival cron job.
     *
     * @param {number} daysOld - e.g. 90
     * @returns {Promise<number>} Rows deleted
     */
    static async archiveRead(daysOld = 90) {
        const { rowCount } = await db.query(
            `DELETE FROM notifications
             WHERE is_read = TRUE
               AND created_at < NOW() - ($1 || ' days')::INTERVAL`,
            [daysOld],
        );
        return rowCount;
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────────

    static get VALID_TYPES()       { return VALID_TYPES; }
    static get VALID_ENTITY_TYPES(){ return VALID_ENTITY_TYPES; }
}

export default Notification;
