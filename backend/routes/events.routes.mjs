import { Router } from "express";
import {
    createEvent,
    getEvents,
    getEventById,
    updateEvent,
    deleteEvent,
} from "../controllers/event.controller.mjs";
import { authenticate } from "../middleware/auth.middleware.mjs";

const router = Router();

// All event routes require a valid JWT — events are strictly personal
router.use(authenticate);

// POST   /api/events              — Create a new personal event
router.post("/", createEvent);

// GET    /api/events?from&to&limit&offset  — List own events (optionally filtered by date range)
router.get("/", getEvents);

// GET    /api/events/:id          — Get a single event (owner only)
router.get("/:id", getEventById);

// PATCH  /api/events/:id          — Update an event (owner only)
router.patch("/:id", updateEvent);

// DELETE /api/events/:id          — Delete an event (owner only)
router.delete("/:id", deleteEvent);

export default router;
