import db from "../config/db.mjs";

/**
 * Event Model
 *
 * Represents a personal calendar event owned by a single user (lawyer).
 * Events are independent of cases — the user opts to add them manually.
 *
 * Usage:
 *   const event = await Event.create({ userId, type, name, startTime, ... });
 *   const { events, total } = await Event.getByUserId(userId, { from, to });
 *   const updated = await Event.update(id, userId, { name, description });
 *   const deleted = await Event.deleteById(id, userId);
 */

const VALID_TYPES = ["HEARING", "DEADLINE", "MEETING", "REMINDER"];

class Event {
    constructor(row) {
        this.id                  = row.id;
        this.userId              = row.user_id;
        this.type                = row.type;
        this.name                = row.name;
        this.description         = row.description ?? null;
        this.startTime           = row.start_time;
        this.endTime             = row.end_time   ?? null;
        this.allDay              = row.all_day;
        this.remindBeforeMinutes = row.remind_before_minutes ?? null;
        this.createdAt           = row.created_at;
        this.updatedAt           = row.updated_at;
    }

    toObject() {
        return {
            id:                  this.id,
            userId:              this.userId,
            type:                this.type,
            name:                this.name,
            description:         this.description,
            startTime:           this.startTime,
            endTime:             this.endTime,
            allDay:              this.allDay,
            remindBeforeMinutes: this.remindBeforeMinutes,
            createdAt:           this.createdAt,
            updatedAt:           this.updatedAt,
        };
    }

    // ─── Create ──────────────────────────────────────────────────────────────────

    /**
     * Creates a new personal calendar event for a user.
     *
     * @param {{ userId, type, name, description?, startTime, endTime?, allDay? }}
     * @returns {Promise<Event>}
     */
    static async create({ userId, type, name, description, startTime, endTime, allDay = false, remindBeforeMinutes = null }) {
        const { rows } = await db.query(
            `INSERT INTO events (user_id, type, name, description, start_time, end_time, all_day, remind_before_minutes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [userId, type, name, description ?? null, startTime, endTime ?? null, allDay, remindBeforeMinutes ?? null],
        );
        return new Event(rows[0]);
    }

    // ─── Read ────────────────────────────────────────────────────────────────────

    /**
     * Fetches a single event by ID. Does NOT enforce ownership — the caller
     * (controller) must verify that event.userId === req.user.id.
     *
     * @param {string} id - UUID
     * @returns {Promise<Event|null>}
     */
    static async findById(id) {
        const { rows } = await db.query(
            "SELECT * FROM events WHERE id = $1",
            [id],
        );
        return rows[0] ? new Event(rows[0]) : null;
    }

    /**
     * Returns a paginated list of events for a user, optionally filtered by a
     * date range. Uses the composite index (user_id, start_time) for range
     * queries.
     *
     * @param {string} userId
     * @param {{ from?: Date|string, to?: Date|string, limit?: number, offset?: number }}
     * @returns {Promise<{ events: Event[], total: number }>}
     */
    static async getByUserId(userId, { from, to, limit = 50, offset = 0 } = {}) {
        const conditions = ["user_id = $1"];
        const params     = [userId];

        if (from) {
            params.push(from);
            conditions.push(`start_time >= $${params.length}`);
        }
        if (to) {
            params.push(to);
            conditions.push(`start_time < $${params.length}`);
        }

        const where = `WHERE ${conditions.join(" AND ")}`;

        const [dataResult, countResult] = await Promise.all([
            db.query(
                `SELECT * FROM events ${where}
                 ORDER BY start_time ASC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limit, offset],
            ),
            db.query(`SELECT COUNT(*) FROM events ${where}`, params),
        ]);

        return {
            events: dataResult.rows.map((r) => new Event(r)),
            total:  parseInt(countResult.rows[0].count, 10),
        };
    }

    // ─── Update ──────────────────────────────────────────────────────────────────

    /**
     * Updates mutable fields on an event. Ownership is verified at the DB level
     * via the `user_id = $N` clause — returns null if the event does not exist
     * or belongs to another user.
     *
     * @param {string} id
     * @param {string} userId - Must match event.user_id
     * @param {{ type?, name?, description?, startTime?, endTime?, allDay? }}
     * @returns {Promise<Event|null>}
     */
    static async update(id, userId, { type, name, description, startTime, endTime, allDay, remindBeforeMinutes }) {
        const fields = [];
        const params = [];

        const set = (col, val) => {
            if (val !== undefined) {
                params.push(val);
                fields.push(`${col} = $${params.length}`);
            }
        };

        set("type",                  type);
        set("name",                  name);
        set("description",           description);
        set("start_time",            startTime);
        set("end_time",              endTime);
        set("all_day",               allDay);
        set("remind_before_minutes", remindBeforeMinutes);

        if (fields.length === 0) return null;

        fields.push("updated_at = CURRENT_TIMESTAMP");

        // Append ownership guard and PK
        params.push(userId);
        const ownerParam = params.length;
        params.push(id);
        const idParam = params.length;

        const { rows } = await db.query(
            `UPDATE events
             SET ${fields.join(", ")}
             WHERE user_id = $${ownerParam} AND id = $${idParam}
             RETURNING *`,
            params,
        );
        return rows[0] ? new Event(rows[0]) : null;
    }

    // ─── Delete ──────────────────────────────────────────────────────────────────

    /**
     * Deletes an event by ID, scoped to the owning user.
     * Returns the deleted row so the controller can confirm what was removed,
     * or null if the event was not found / did not belong to the user.
     *
     * @param {string} id
     * @param {string} userId
     * @returns {Promise<Event|null>}
     */
    static async deleteById(id, userId) {
        const { rows } = await db.query(
            "DELETE FROM events WHERE id = $1 AND user_id = $2 RETURNING *",
            [id, userId],
        );
        return rows[0] ? new Event(rows[0]) : null;
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────────

    static get VALID_TYPES() {
        return VALID_TYPES;
    }
}

export default Event;
