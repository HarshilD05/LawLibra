import pool from '../config/db.mjs';

/**
 * Case Model
 *
 * Represents a single legal case and its assignments.
 *
 * Usage:
 *   const c = await Case.findById(id);
 *   console.log(c.toSafeObject());
 *
 *   const { cases, total } = await Case.getAll({ limit: 20, offset: 0 });
 *   const { cases, total } = await Case.getByLawyerId(lawyerId);
 */
export class Case {
    /**
     * @param {object} row - A raw DB row from the `cases` table
     */
    constructor(row) {
        this.id         = row.id;
        this.title      = row.title;
        this.status     = row.status;
        this.clientName = row.client_name;
        this.courtName  = row.court_name;
        this.caseNumber = row.case_number;
        this.metadata   = row.metadata ?? {};
        this.createdBy  = row.created_by;
        this.createdAt  = row.created_at;
        this.updatedAt  = row.updated_at;
    }

    // ─── Instance Methods ────────────────────────────────────────────────────────

    toSafeObject() {
        return {
            id:         this.id,
            title:      this.title,
            status:     this.status,
            clientName: this.clientName,
            courtName:  this.courtName,
            caseNumber: this.caseNumber,
            metadata:   this.metadata,
            createdBy:  this.createdBy,
            createdAt:  this.createdAt,
            updatedAt:  this.updatedAt,
        };
    }

    // ─── Static DB Methods ───────────────────────────────────────────────────────

    /**
     * Creates a new case row.
     * @param {{ title, status, clientName, courtName, caseNumber, metadata, createdBy }}
     * @returns {Promise<Case>}
     */
    static async create({ title, status = 'OPEN', clientName, courtName, caseNumber, metadata = {}, createdBy }) {
        const result = await pool.query(
            `INSERT INTO cases (title, status, client_name, court_name, case_number, metadata, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [title, status, clientName, courtName, caseNumber, metadata, createdBy]
        );
        return new Case(result.rows[0]);
    }

    /**
     * Fetches a single case by ID.
     * @param {string} id - UUID
     * @returns {Promise<Case | null>}
     */
    static async findById(id) {
        const result = await pool.query(
            'SELECT * FROM cases WHERE id = $1',
            [id]
        );
        return result.rows[0] ? new Case(result.rows[0]) : null;
    }

    /**
     * Paginated list of ALL cases. Admin-only operation.
     * @param {{ limit?: number, offset?: number, status?: string }}
     * @returns {Promise<{ cases: Case[], total: number }>}
     */
    static async getAll({ limit = 20, offset = 0, status } = {}) {
        const conditions = [];
        const params     = [];

        if (status) {
            params.push(status);
            conditions.push(`status = $${params.length}`);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const [dataResult, countResult] = await Promise.all([
            pool.query(
                `SELECT * FROM cases ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limit, offset]
            ),
            pool.query(`SELECT COUNT(*) FROM cases ${where}`, params),
        ]);

        return {
            cases: dataResult.rows.map((row) => new Case(row)),
            total: parseInt(countResult.rows[0].count, 10),
        };
    }

    /**
     * Paginated list of cases assigned to a specific lawyer.
     * @param {string} lawyerId - UUID
     * @param {{ limit?: number, offset?: number, status?: string }}
     * @returns {Promise<{ cases: Case[], total: number }>}
     */
    static async getByLawyerId(lawyerId, { limit = 20, offset = 0, status } = {}) {
        const conditions = ['ca.lawyer_id = $1'];
        const params     = [lawyerId];

        if (status) {
            params.push(status);
            conditions.push(`c.status = $${params.length}`);
        }

        const where = `WHERE ${conditions.join(' AND ')}`;

        const [dataResult, countResult] = await Promise.all([
            pool.query(
                `SELECT c.*, ca.access_level
                 FROM cases c
                 JOIN case_assignments ca ON ca.case_id = c.id
                 ${where}
                 ORDER BY c.created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limit, offset]
            ),
            pool.query(
                `SELECT COUNT(*) FROM cases c
                 JOIN case_assignments ca ON ca.case_id = c.id ${where}`,
                params
            ),
        ]);

        return {
            cases: dataResult.rows.map((row) => new Case(row)),
            total: parseInt(countResult.rows[0].count, 10),
        };
    }

    /**
     * Updates allowed fields on a case row.
     * @param {string} id
     * @param {{ title?, status?, clientName?, courtName?, caseNumber?, metadata? }}
     * @returns {Promise<Case | null>}
     */
    static async update(id, { title, status, clientName, courtName, caseNumber, metadata }) {
        const fields = [];
        const params = [];

        const set = (col, val) => {
            if (val !== undefined) {
                params.push(val);
                fields.push(`${col} = $${params.length}`);
            }
        };

        set('title',       title);
        set('status',      status);
        set('client_name', clientName);
        set('court_name',  courtName);
        set('case_number', caseNumber);
        set('metadata',    metadata);

        if (fields.length === 0) return null;

        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(id);

        const result = await pool.query(
            `UPDATE cases SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
            params
        );
        return result.rows[0] ? new Case(result.rows[0]) : null;
    }

    /**
     * Deletes a case by ID. Cascades to assignments, folders, documents.
     * @param {string} id
     * @returns {Promise<boolean>}
     */
    static async deleteById(id) {
        const result = await pool.query('DELETE FROM cases WHERE id = $1', [id]);
        return result.rowCount > 0;
    }

    // ─── Assignment Static Methods ───────────────────────────────────────────────

    /**
     * Assigns a lawyer to a case with a given access level. If the lawyer is
     * already assigned, the access level is updated (upsert).
     * @param {string} caseId
     * @param {string} lawyerId
     * @param {'VIEW'|'EDIT'|'ADMIN'} accessLevel
     * @returns {Promise<object>} The assignment row
     */
    static async assignLawyer(caseId, lawyerId, accessLevel) {
        const result = await pool.query(
            `INSERT INTO case_assignments (case_id, lawyer_id, access_level)
             VALUES ($1, $2, $3)
             ON CONFLICT (lawyer_id, case_id)
             DO UPDATE SET access_level = EXCLUDED.access_level
             RETURNING *`,
            [caseId, lawyerId, accessLevel]
        );
        return result.rows[0];
    }

    /**
     * Removes a lawyer's assignment from a case.
     * @param {string} caseId
     * @param {string} lawyerId
     * @returns {Promise<boolean>}
     */
    static async removeAssignment(caseId, lawyerId) {
        const result = await pool.query(
            'DELETE FROM case_assignments WHERE case_id = $1 AND lawyer_id = $2',
            [caseId, lawyerId]
        );
        return result.rowCount > 0;
    }

    /**
     * Lists all lawyers assigned to a case with their access level.
     * @param {string} caseId
     * @returns {Promise<Array<{ lawyerId, name, email, accessLevel, assignedAt }>>}
     */
    static async getAssignments(caseId) {
        const result = await pool.query(
            `SELECT u.id AS "lawyerId", u.name, u.email, ca.access_level AS "accessLevel", ca.assigned_at AS "assignedAt"
             FROM case_assignments ca
             JOIN users u ON u.id = ca.lawyer_id
             WHERE ca.case_id = $1
             ORDER BY ca.assigned_at ASC`,
            [caseId]
        );
        return result.rows;
    }

    /**
     * Returns the access level of a specific lawyer on a case, or null if not assigned.
     * @param {string} caseId
     * @param {string} lawyerId
     * @returns {Promise<'VIEW'|'EDIT'|'ADMIN'|null>}
     */
    static async getLawyerAccessLevel(caseId, lawyerId) {
        const result = await pool.query(
            'SELECT access_level FROM case_assignments WHERE case_id = $1 AND lawyer_id = $2',
            [caseId, lawyerId]
        );
        return result.rows[0]?.access_level ?? null;
    }
}
