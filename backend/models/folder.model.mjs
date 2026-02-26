/**
 * Folder Model
 *
 * Manages the virtual file system within a case. Folders are self-referencing
 * (parent_folder_id) and can nest arbitrarily deep. The tree is stored in
 * PostgreSQL and reconstructed in JS — physical files on disk always live in a
 * flat structure keyed by folderId UUID.
 *
 * Tree query strategy:
 *   A single recursive CTE fetches all folders for a case in one round-trip.
 *   The recursive CTE is handled in DB; tree nesting is assembled in JS so
 *   clients receive a ready-to-render nested structure.
 */

import db from '../config/db.mjs';

class Folder {
    constructor(row) {
        this.id             = row.id;
        this.caseId         = row.case_id;
        this.parentFolderId = row.parent_folder_id;
        this.name           = row.name;
        this.createdBy      = row.created_by;
        this.createdAt      = row.created_at;
    }

    toObject() {
        return {
            id:             this.id,
            caseId:         this.caseId,
            parentFolderId: this.parentFolderId,
            name:           this.name,
            createdBy:      this.createdBy,
            createdAt:      this.createdAt,
        };
    }

    // ─── Create ──────────────────────────────────────────────────────────────────

    /**
     * Creates a new folder inside a case.
     * parentFolderId = null → top-level folder (child of case root).
     *
     * @param {{ caseId, parentFolderId, name, createdBy }} data
     * @returns {Promise<Folder>}
     */
    static async create({ caseId, parentFolderId, name, createdBy }) {
        const { rows } = await db.query(
            `INSERT INTO folders (case_id, parent_folder_id, name, created_by)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [caseId, parentFolderId ?? null, name, createdBy],
        );
        return new Folder(rows[0]);
    }

    // ─── Read ────────────────────────────────────────────────────────────────────

    /**
     * Find a single folder by ID. Returns null if not found.
     */
    static async findById(id) {
        const { rows } = await db.query(
            'SELECT * FROM folders WHERE id = $1',
            [id],
        );
        return rows[0] ? new Folder(rows[0]) : null;
    }

    /**
     * Returns ALL folders for a case as a nested tree.
     *
     * Uses a recursive CTE to fetch the full hierarchy in one query, then
     * assembles it into a nested JS structure: each folder has a `children`
     * array containing its sub-folders.
     *
     * The tree root contains only top-level folders (parent_folder_id IS NULL).
     *
     * @param {string} caseId
     * @returns {Promise<Array>}  Nested tree of folder objects
     */
    static async getTreeByCaseId(caseId) {
        // Recursive CTE: start from roots, walk down
        const { rows } = await db.query(
            `WITH RECURSIVE folder_tree AS (
                -- Anchor: top-level folders (no parent)
                SELECT id, case_id, parent_folder_id, name, created_by, created_at, 0 AS depth
                FROM folders
                WHERE case_id = $1 AND parent_folder_id IS NULL

                UNION ALL

                -- Recursive: folders whose parent is already in the CTE result
                SELECT f.id, f.case_id, f.parent_folder_id, f.name, f.created_by, f.created_at, ft.depth + 1
                FROM folders f
                INNER JOIN folder_tree ft ON f.parent_folder_id = ft.id
            )
            SELECT * FROM folder_tree ORDER BY depth, name`,
            [caseId],
        );

        return Folder._buildTree(rows);
    }

    /**
     * Returns all folders for a case as a flat array.
     * Useful for lookups/validation without tree construction.
     *
     * @param {string} caseId
     * @returns {Promise<Folder[]>}
     */
    static async getFlatByCaseId(caseId) {
        const { rows } = await db.query(
            'SELECT * FROM folders WHERE case_id = $1 ORDER BY name',
            [caseId],
        );
        return rows.map(r => new Folder(r));
    }

    // ─── Update ──────────────────────────────────────────────────────────────────

    /**
     * Rename a folder. Only the name can change — moving folders
     * (changing parent_folder_id) is deliberately not supported to keep
     * the UX simple and avoid orphaning files on disk.
     *
     * @param {string} id
     * @param {string} name
     * @returns {Promise<Folder|null>}
     */
    static async rename(id, name) {
        const { rows } = await db.query(
            `UPDATE folders SET name = $2 WHERE id = $1 RETURNING *`,
            [id, name],
        );
        return rows[0] ? new Folder(rows[0]) : null;
    }

    // ─── Delete ──────────────────────────────────────────────────────────────────

    /**
     * Delete a folder by ID.
     *
     * DB cascade effects (defined in schema):
     *   - Sub-folders are deleted recursively (ON DELETE CASCADE via parent_folder_id FK)
     *   - Documents inside the folder and all sub-folders are deleted (ON DELETE CASCADE)
     *   - doc_chunks for those documents are also deleted
     *
     * The controller is responsible for deleting the physical files on disk
     * BEFORE calling this (since cascaded document IDs are lost after delete).
     *
     * @param {string} id
     * @returns {Promise<Folder|null>}
     */
    static async deleteById(id) {
        const { rows } = await db.query(
            'DELETE FROM folders WHERE id = $1 RETURNING *',
            [id],
        );
        return rows[0] ? new Folder(rows[0]) : null;
    }

    /**
     * Returns all document storage_paths that will be lost when this folder
     * (and all descendants) are deleted. Call this BEFORE deleteById to
     * collect the file paths that need to be removed from disk.
     *
     * @param {string} folderId
     * @returns {Promise<string[]>}  Array of storage_path strings
     */
    static async getDescendantStoragePaths(folderId) {
        // Recursively collect all descendant folder IDs (including this one),
        // then find all document storage paths within them.
        const { rows } = await db.query(
            `WITH RECURSIVE sub_folders AS (
                SELECT id FROM folders WHERE id = $1
                UNION ALL
                SELECT f.id FROM folders f
                INNER JOIN sub_folders sf ON f.parent_folder_id = sf.id
            )
            SELECT d.storage_path
            FROM documents d
            WHERE d.folder_id IN (SELECT id FROM sub_folders)`,
            [folderId],
        );
        return rows.map(r => r.storage_path);
    }

    // ─── Private Helpers ─────────────────────────────────────────────────────────

    /**
     * Converts a flat sorted array of DB rows into a nested tree.
     * Because the CTE returns rows ordered from shallowest to deepest,
     * a single pass with a Map is sufficient.
     *
     * @param {object[]} rows
     * @returns {object[]}  Top-level nodes, each with a `children` array
     */
    static _buildTree(rows) {
        const nodeMap = new Map();

        // Initialise every node with an empty children array
        for (const row of rows) {
            nodeMap.set(row.id, {
                id:             row.id,
                caseId:         row.case_id,
                parentFolderId: row.parent_folder_id,
                name:           row.name,
                createdBy:      row.created_by,
                createdAt:      row.created_at,
                depth:          row.depth,
                children:       [],
            });
        }

        const roots = [];
        for (const node of nodeMap.values()) {
            if (node.parentFolderId === null) {
                roots.push(node);
            } else {
                const parent = nodeMap.get(node.parentFolderId);
                if (parent) parent.children.push(node);
            }
        }

        return roots;
    }
}

export default Folder;
