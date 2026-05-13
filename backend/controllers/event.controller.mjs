import Event from "../models/event.model.mjs";
import { eventReminderQueue } from "../config/queue.mjs";
import logger from "../config/logger.mjs";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolves an event that belongs to the requesting user.
 * Returns the Event instance, or null if not found / not owned.
 *
 * @param {string} eventId
 * @param {string} userId
 * @returns {Promise<Event|null>}
 */
const resolveOwnedEvent = async (eventId, userId) => {
    const event = await Event.findById(eventId);
    if (!event || event.userId !== userId) return null;
    return event;
};

/**
 * Schedules a delayed BullMQ job for an event reminder.
 * Cancels any previous job for the same event first.
 *
 * @param {Event} event - The saved Event instance
 */
const scheduleReminder = async (event) => {
    if (!event.remindBeforeMinutes) return;

    const fireAt  = new Date(event.startTime).getTime() - event.remindBeforeMinutes * 60 * 1000;
    const delayMs = fireAt - Date.now();

    if (delayMs <= 0) return; // reminder time already passed — skip silently

    // Use eventId as the BullMQ job ID so re-scheduling overwrites the old job
    await eventReminderQueue.add(
        "event-reminder",
        {
            userId:    event.userId,
            eventId:   event.id,
            eventName: event.name,
            eventType: event.type,
            startTime: event.startTime,
        },
        {
            jobId: `reminder:${event.id}`,  // deterministic ID — overwrites on update
            delay: delayMs,
        },
    );
};

// ─── CRUD Handlers ────────────────────────────────────────────────────────────

/**
 * POST /api/events
 * Creates a new personal calendar event for the authenticated user.
 *
 * Body: { type, name, startTime, description?, endTime?, allDay? }
 */
export const createEvent = async (req, res) => {
    try {
        const { type, name, description, startTime, endTime, allDay, remindBeforeMinutes } = req.body;

        if (!type || !name || !startTime) {
            return res.status(400).json({ error: "type, name, and startTime are required." });
        }

        if (!Event.VALID_TYPES.includes(type)) {
            return res.status(400).json({
                error: `type must be one of: ${Event.VALID_TYPES.join(", ")}.`,
            });
        }

        if (endTime && new Date(endTime) <= new Date(startTime)) {
            return res.status(400).json({ error: "endTime must be after startTime." });
        }

        if (remindBeforeMinutes !== undefined && remindBeforeMinutes !== null) {
            if (!Number.isInteger(remindBeforeMinutes) || remindBeforeMinutes <= 0) {
                return res.status(400).json({ error: "remindBeforeMinutes must be a positive integer." });
            }
        }

        const event = await Event.create({
            userId: req.user.id,
            type,
            name,
            description,
            startTime,
            endTime,
            allDay:              allDay ?? false,
            remindBeforeMinutes: remindBeforeMinutes ?? null,
        });

        // Schedule a delayed BullMQ job if a reminder was requested
        await scheduleReminder(event);

        return res.status(201).json({ event: event.toObject() });
    } catch (err) {
        logger.error({ type: "event", op: "createEvent", uid: req.user?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * GET /api/events?from=&to=&limit=&offset=
 * Returns the authenticated user's events, optionally filtered by date range.
 *
 * Query params:
 *   from   — ISO 8601 datetime (inclusive lower bound on start_time)
 *   to     — ISO 8601 datetime (exclusive upper bound on start_time)
 *   limit  — default 50, max 200
 *   offset — default 0
 */
export const getEvents = async (req, res) => {
    try {
        const limit  = Math.min(parseInt(req.query.limit)  || 50,  200);
        const offset = Math.max(parseInt(req.query.offset) || 0,   0);
        const from   = req.query.from || null;
        const to     = req.query.to   || null;

        const { events, total } = await Event.getByUserId(req.user.id, { from, to, limit, offset });

        return res.status(200).json({
            data: events.map((e) => e.toObject()),
            total,
            limit,
            offset,
        });
    } catch (err) {
        logger.error({ type: "event", op: "getEvents", uid: req.user?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * GET /api/events/:id
 * Returns a single event. Only accessible by its owner.
 */
export const getEventById = async (req, res) => {
    try {
        const event = await resolveOwnedEvent(req.params.id, req.user.id);

        if (!event) {
            return res.status(404).json({ error: "Event not found." });
        }

        return res.status(200).json({ event: event.toObject() });
    } catch (err) {
        logger.error({ type: "event", op: "getEventById", eventId: req.params?.id, uid: req.user?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * PATCH /api/events/:id
 * Updates mutable fields on an event. Only the owner can update.
 *
 * Body (all optional): { type, name, description, startTime, endTime, allDay }
 */
export const updateEvent = async (req, res) => {
    try {
        const { type, name, description, startTime, endTime, allDay, remindBeforeMinutes } = req.body;

        if (type && !Event.VALID_TYPES.includes(type)) {
            return res.status(400).json({
                error: `type must be one of: ${Event.VALID_TYPES.join(", ")}.`,
            });
        }

        if (remindBeforeMinutes !== undefined && remindBeforeMinutes !== null) {
            if (!Number.isInteger(remindBeforeMinutes) || remindBeforeMinutes <= 0) {
                return res.status(400).json({ error: "remindBeforeMinutes must be a positive integer." });
            }
        }

        // Validate the new time window if either bound is being changed.
        if (startTime || endTime) {
            const current = await resolveOwnedEvent(req.params.id, req.user.id);
            if (!current) {
                return res.status(404).json({ error: "Event not found." });
            }

            const resolvedStart = startTime ? new Date(startTime) : new Date(current.startTime);
            const resolvedEnd   = endTime   ? new Date(endTime)   : (current.endTime ? new Date(current.endTime) : null);

            if (resolvedEnd && resolvedEnd <= resolvedStart) {
                return res.status(400).json({ error: "endTime must be after startTime." });
            }
        }

        const updated = await Event.update(req.params.id, req.user.id, {
            type, name, description, startTime, endTime, allDay, remindBeforeMinutes,
        });

        if (!updated) {
            const exists = await Event.findById(req.params.id);
            if (!exists || exists.userId !== req.user.id) {
                return res.status(404).json({ error: "Event not found." });
            }
            return res.status(400).json({ error: "No valid fields provided for update." });
        }

        // Re-schedule reminder with the new parameters (overwrites the old BullMQ job)
        await scheduleReminder(updated);

        return res.status(200).json({ event: updated.toObject() });
    } catch (err) {
        logger.error({ type: "event", op: "updateEvent", eventId: req.params?.id, uid: req.user?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * DELETE /api/events/:id
 * Permanently deletes an event. Only the owner can delete.
 */
export const deleteEvent = async (req, res) => {
    try {
        const deleted = await Event.deleteById(req.params.id, req.user.id);

        if (!deleted) {
            return res.status(404).json({ error: "Event not found." });
        }

        return res.status(200).json({ message: "Event deleted successfully." });
    } catch (err) {
        logger.error({ type: "event", op: "deleteEvent", eventId: req.params?.id, uid: req.user?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
    }
};
