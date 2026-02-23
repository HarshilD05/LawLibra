import pool from '../config/db.mjs';

/**
 * User Model
 *
 * Represents a single user in the system.
 *
 * Usage:
 *   const user = await User.findByEmail('a@b.com');
 *   if (user) console.log(user.toSafeObject());
 *
 *   const newUser = await User.create({ name, email, passwordHash, salt, role });
 */
export class User {
    /**
     * @param {object} row - A raw DB row from the `users` table
     */
    constructor(row) {
        this.id        = row.id;
        this.name      = row.name;
        this.email     = row.email;
        this.role      = row.role;
        this.createdAt = row.created_at;
        this.updatedAt = row.updated_at ?? null;

        // Sensitive: only populated when fetched via findByEmail() for auth
        this._passwordHash = row.password_hash ?? null;
        this._salt         = row.salt ?? null;
    }

    // ─── Instance Methods ────────────────────────────────────────────────────────

    /**
     * Returns a plain object safe to send in API responses.
     * Strips all sensitive credential fields.
     * @returns {{ id, name, email, role, createdAt }}
     */
    toSafeObject() {
        return {
            id:        this.id,
            name:      this.name,
            email:     this.email,
            role:      this.role,
            createdAt: this.createdAt,
        };
    }

    /**
     * Returns the raw salt.
     * Only available on instances fetched via findByEmail() (login flow).
     * @returns {string | null}
     */
    getSalt() {
        return this._salt;
    }

    /**
     * Returns the raw password hash.
     * Only available on instances fetched via findByEmail() (login flow).
     * @returns {string | null}
     */
    getPasswordHash() {
        return this._passwordHash;
    }

    // ─── Static DB Methods ───────────────────────────────────────────────────────

    /**
     * Fetches a user by email INCLUDING credential fields (password_hash, salt).
     * Use ONLY in the auth/login flow. Never send this instance directly to the client.
     * @param {string} email
     * @returns {Promise<User | null>}
     */
    static async findByEmail(email) {
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        return result.rows[0] ? new User(result.rows[0]) : null;
    }

    /**
     * Fetches a user by ID. Credentials are excluded at the SQL level.
     * Safe for general use and API responses (call .toSafeObject() before sending).
     * @param {string} id - UUID
     * @returns {Promise<User | null>}
     */
    static async findById(id) {
        const result = await pool.query(
            'SELECT id, name, email, role, created_at, updated_at FROM users WHERE id = $1',
            [id]
        );
        return result.rows[0] ? new User(result.rows[0]) : null;
    }

    /**
     * Creates and persists a new user row, returning a User instance (no credentials).
     * @param {{ name: string, email: string, passwordHash: string, salt: string, role: string }}
     * @returns {Promise<User>}
     */
    static async create({ name, email, passwordHash, salt, role }) {
        const result = await pool.query(
            `INSERT INTO users (name, email, password_hash, salt, role)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, name, email, role, created_at, updated_at`,
            [name, email, passwordHash, salt, role]
        );
        return new User(result.rows[0]);
    }

    /**
     * Returns a paginated list of users.
     * Admin-only operation.
     * @param {{ limit?: number, offset?: number }}
     * @returns {Promise<{ users: User[], total: number }>}
     */
    static async getAll({ limit = 20, offset = 0 } = {}) {
        const [dataResult, countResult] = await Promise.all([
            pool.query(
                `SELECT id, name, email, role, created_at, updated_at
                 FROM users
                 ORDER BY created_at DESC
                 LIMIT $1 OFFSET $2`,
                [limit, offset]
            ),
            pool.query('SELECT COUNT(*) FROM users'),
        ]);
        return {
            users: dataResult.rows.map((row) => new User(row)),
            total: parseInt(countResult.rows[0].count, 10),
        };
    }

    /**
     * Updates the password hash and salt for a given user.
     * @param {string} id          - UUID of the user
     * @param {string} passwordHash - New hashed password
     * @param {string} salt         - New salt
     * @returns {Promise<boolean>} true if a row was updated
     */
    static async changePassword(id, passwordHash, salt) {
        const result = await pool.query(
            `UPDATE users
             SET password_hash = $1, salt = $2, updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [passwordHash, salt, id]
        );
        return result.rowCount > 0;
    }

    /**
     * Deletes a user by ID.
     * Admin-only operation.
     * @param {string} id - UUID
     * @returns {Promise<boolean>} true if a row was deleted
     */
    static async deleteById(id) {
        const result = await pool.query(
            'DELETE FROM users WHERE id = $1',
            [id]
        );
        return result.rowCount > 0;
    }
}
