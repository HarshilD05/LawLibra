import Notification from "../models/notification.model.mjs";

// ─── CRUD Handlers ────────────────────────────────────────────────────────────

/**
 * GET /api/notifications?entityType=&limit=&offset=
 *
 * Returns the authenticated user's notification feed, newest first.
 * Optionally filter by entity tab: CASE | CHAT | EVENT
 */
export const getNotifications = async (req, res) => {
    try {
        const limit      = Math.min(parseInt(req.query.limit)  || 20, 100);
        const offset     = Math.max(parseInt(req.query.offset) || 0,  0);
        const entityType = req.query.entityType?.toUpperCase() || null;

        if (entityType && !Notification.VALID_ENTITY_TYPES.includes(entityType)) {
            return res.status(400).json({
                error: `entityType must be one of: ${Notification.VALID_ENTITY_TYPES.join(", ")}.`,
            });
        }

        const { notifications, total } = await Notification.getByUserId(req.user.id, {
            entityType,
            limit,
            offset,
        });

        return res.status(200).json({
            data: notifications.map((n) => n.toObject()),
            total,
            limit,
            offset,
        });
    } catch (err) {
        console.error("[Notifications] getNotifications error:", err.message);
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * GET /api/notifications/unread-count
 *
 * Returns the count of unread notifications for the bell-icon badge.
 */
export const getUnreadCount = async (req, res) => {
    try {
        const count = await Notification.getUnreadCount(req.user.id);
        return res.status(200).json({ unreadCount: count });
    } catch (err) {
        console.error("[Notifications] getUnreadCount error:", err.message);
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * PATCH /api/notifications/:id/read
 *
 * Marks a single notification as read. Idempotent — re-marking an already-read
 * notification returns 200 with the existing data unchanged.
 */
export const markRead = async (req, res) => {
    try {
        const updated = await Notification.markRead(req.params.id, req.user.id);

        if (!updated) {
            // Could be wrong owner OR already read — fetch to distinguish
            const { notifications } = await Notification.getByUserId(req.user.id, { limit: 1 });
            const exists = await (async () => {
                const { rows } = await import("../config/db.mjs").then(
                    (m) => m.default.query("SELECT id FROM notifications WHERE id = $1", [req.params.id])
                );
                return rows[0];
            })();

            if (!exists) return res.status(404).json({ error: "Notification not found." });
            // If it exists but markRead returned null it was already read — treat as success
            return res.status(200).json({ message: "Notification already marked as read." });
        }

        return res.status(200).json({ notification: updated.toObject() });
    } catch (err) {
        console.error("[Notifications] markRead error:", err.message);
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * PATCH /api/notifications/read-all
 *
 * Marks ALL unread notifications for the user as read in one query.
 */
export const markAllRead = async (req, res) => {
    try {
        const count = await Notification.markAllRead(req.user.id);
        return res.status(200).json({ message: `${count} notification(s) marked as read.` });
    } catch (err) {
        console.error("[Notifications] markAllRead error:", err.message);
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * DELETE /api/notifications/:id
 *
 * Permanently deletes a single notification. Only the owner can delete.
 */
export const deleteNotification = async (req, res) => {
    try {
        const deleted = await Notification.deleteById(req.params.id, req.user.id);

        if (!deleted) {
            return res.status(404).json({ error: "Notification not found." });
        }

        return res.status(200).json({ message: "Notification deleted." });
    } catch (err) {
        console.error("[Notifications] deleteNotification error:", err.message);
        return res.status(500).json({ error: "Internal server error." });
    }
};
