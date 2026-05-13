import { Router } from "express";
import {
    getNotifications,
    getUnreadCount,
    markRead,
    markAllRead,
    deleteNotification,
} from "../controllers/notification.controller.mjs";
import { authenticate } from "../middleware/auth.middleware.mjs";

const router = Router();

// All notification routes require a valid JWT
router.use(authenticate);

// GET    /api/notifications?entityType=&limit=&offset=  — Paginated feed (optional entity tab filter)
router.get("/", getNotifications);

// GET    /api/notifications/unread-count               — Bell-badge count
router.get("/unread-count", getUnreadCount);

// PATCH  /api/notifications/read-all                   — Mark all as read (must be before /:id routes)
router.patch("/read-all", markAllRead);

// PATCH  /api/notifications/:id/read                   — Mark single notification as read
router.patch("/:id/read", markRead);

// DELETE /api/notifications/:id                        — Delete a notification
router.delete("/:id", deleteNotification);

export default router;
