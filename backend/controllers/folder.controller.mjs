/**
 * Folder Controller
 *
 * Manages the virtual folder hierarchy within a case.
 *
 * Access rules (mirrors document upload access):
 *   - Create / Rename / Delete : ADMIN or case assignment with EDIT or ADMIN level
 *   - Get tree / Get single    : ADMIN or any case assignment (VIEW, EDIT, ADMIN)
 *
 * Physical storage note:
 *   Folders are purely virtual in the DB. Each folder maps to a flat directory
 *   on disk keyed by its UUID (data/<caseId>/<folderId>/). Sub-folder nesting
 *   exists only in the DB tree — physically files are always one level deep.
 *
 * Delete cascade:
 *   Deleting a folder collects all descendant file paths first, removes them
 *   from disk, then deletes the DB record which cascades to sub-folders and
 *   their documents automatically.
 */

import Folder                    from "../models/folder.model.mjs";
import { Case }                  from "../models/case.model.mjs";
import {
    getDocumentDirPath,
    resolveAbsolutePath,
    ensureDir,
    deleteDirRecursive,
} from "../utils/storage.utils.mjs";
import fs from "fs/promises";
import logger from "../config/logger.mjs";

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Resolves case access for the requesting user.
 * Returns { kase, accessLevel } or null if not found / not assigned.
 */
async function resolveCaseAccess(caseId, reqUser) {
    const kase = await Case.findById(caseId);
    if (!kase) return null;

    if (reqUser.role === "ADMIN") return { kase, accessLevel: "ADMIN" };

    const accessLevel = await Case.getLawyerAccessLevel(caseId, reqUser.id);
    if (!accessLevel) return null;

    return { kase, accessLevel };
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * POST /api/folders
 * Body: { caseId, name, parentFolderId? }
 *
 * Creates a new folder. If parentFolderId is provided it must belong to the
 * same case. Creates the corresponding directory on disk immediately so the
 * upload controller can move files into it without a separate mkdir step.
 */
export const createFolder = async (req, res) => {
    try {
        const { caseId, name, parentFolderId: rawParent } = req.body;
        const parentFolderId = rawParent?.trim() || null;

        if (!caseId?.trim()) return res.status(400).json({ error: "caseId is required." });
        if (!name?.trim())   return res.status(400).json({ error: "Folder name is required." });

        // Access: need EDIT or ADMIN
        const access = await resolveCaseAccess(caseId, req.user);
        if (!access) return res.status(404).json({ error: "Case not found or access denied." });
        if (access.accessLevel === "VIEW") {
            return res.status(403).json({ error: "VIEW access is insufficient to create folders." });
        }

        // Validate parentFolderId belongs to the same case
        if (parentFolderId) {
            const parent = await Folder.findById(parentFolderId);
            if (!parent || parent.caseId !== caseId) {
                return res.status(400).json({ error: "parentFolderId does not belong to this case." });
            }
        }

        const folder = await Folder.create({
            caseId,
            parentFolderId,
            name:      name.trim(),
            createdBy: req.user.id,
        });

        // Create the physical directory so uploads can target it immediately
        await ensureDir(getDocumentDirPath(caseId, folder.id));

        return res.status(201).json({ folder: folder.toObject() });

    } catch (err) {
        logger.error({ type: "folder", op: "createFolder", caseId: req.body?.caseId, uid: req.user?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
    }
};

// ─── Get Tree ─────────────────────────────────────────────────────────────────

/**
 * GET /api/folders/tree?caseId=
 *
 * Returns the full nested folder tree for a case. The "root" level (documents
 * with folderId = null) is not represented here — it is implicit. Clients
 * should render it as a fixed "Root" node alongside this tree.
 */
export const getFolderTree = async (req, res) => {
    try {
        const { caseId } = req.query;
        if (!caseId) return res.status(400).json({ error: "caseId query parameter is required." });

        const access = await resolveCaseAccess(caseId, req.user);
        if (!access) return res.status(404).json({ error: "Case not found or access denied." });

        const tree = await Folder.getTreeByCaseId(caseId);
        return res.status(200).json({ tree });

    } catch (err) {
        logger.error({ type: "folder", op: "getFolderTree", caseId: req.query?.caseId, uid: req.user?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
    }
};

// ─── Get Single ───────────────────────────────────────────────────────────────

/**
 * GET /api/folders/:id
 */
export const getFolderById = async (req, res) => {
    try {
        const folder = await Folder.findById(req.params.id);
        if (!folder) return res.status(404).json({ error: "Folder not found." });

        const access = await resolveCaseAccess(folder.caseId, req.user);
        if (!access) return res.status(403).json({ error: "Access denied." });

        return res.status(200).json({ folder: folder.toObject() });

    } catch (err) {
        logger.error({ type: "folder", op: "getFolderById", folderId: req.params?.id, uid: req.user?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
    }
};

// ─── Rename ───────────────────────────────────────────────────────────────────

/**
 * PATCH /api/folders/:id
 * Body: { name }
 *
 * Renames a folder. Moving (re-parenting) is not supported.
 */
export const renameFolder = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: "New folder name is required." });

        const folder = await Folder.findById(req.params.id);
        if (!folder) return res.status(404).json({ error: "Folder not found." });

        const access = await resolveCaseAccess(folder.caseId, req.user);
        if (!access) return res.status(403).json({ error: "Access denied." });
        if (access.accessLevel === "VIEW") {
            return res.status(403).json({ error: "VIEW access is insufficient to rename folders." });
        }

        const updated = await Folder.rename(req.params.id, name.trim());
        return res.status(200).json({ folder: updated.toObject() });

    } catch (err) {
        logger.error({ type: "folder", op: "renameFolder", folderId: req.params?.id, uid: req.user?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
    }
};

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * DELETE /api/folders/:id
 *
 * Deletes the folder, all descendant folders, and all their documents.
 *
 * Order of operations:
 *   1. Collect storage paths of all files that will be deleted (before DB delete)
 *   2. Delete the DB record (CASCADE removes sub-folders + documents + chunks)
 *   3. Remove physical files from disk
 *   4. Remove physical directories for this folder and all sub-folders
 */
export const deleteFolder = async (req, res) => {
    try {
        const folder = await Folder.findById(req.params.id);
        if (!folder) return res.status(404).json({ error: "Folder not found." });

        const access = await resolveCaseAccess(folder.caseId, req.user);
        if (!access) return res.status(403).json({ error: "Access denied." });
        if (access.accessLevel === "VIEW") {
            return res.status(403).json({ error: "VIEW access is insufficient to delete folders." });
        }

        // ── Step 1: Collect all file paths before the cascade wipes the DB rows ──
        const storagePaths = await Folder.getDescendantStoragePaths(req.params.id);

        // Also collect all descendant folder IDs for directory cleanup
        const allFolders   = await Folder.getFlatByCaseId(folder.caseId);
        const descendantIds = collectDescendantIds(req.params.id, allFolders);

        // ── Step 2: Delete DB record (CASCADE) ────────────────────────────────────
        await Folder.deleteById(req.params.id);

        // ── Steps 3 & 4: Clean up disk (non-fatal — DB is source of truth) ────────
        const diskCleanup = [
            // Delete individual files
            ...storagePaths.map(sp =>
                fs.unlink(resolveAbsolutePath(sp)).catch(e =>
                    logger.warn({ type: "folder", op: "deleteFolder", event: "file_cleanup_failed", path: sp, err: e.message })
                )
            ),
            ...descendantIds.map(fid =>
                deleteDirRecursive(getDocumentDirPath(folder.caseId, fid)).catch(e =>
                    logger.warn({ type: "folder", op: "deleteFolder", event: "dir_cleanup_failed", folderId: fid, err: e.message })
                )
            ),
        ];
        await Promise.allSettled(diskCleanup);

        return res.status(200).json({
            message:          "Folder deleted successfully.",
            filesRemoved:     storagePaths.length,
            foldersRemoved:   descendantIds.length,
        });

    } catch (err) {
        logger.error({ type: "folder", op: "deleteFolder", folderId: req.params?.id, uid: req.user?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
    }
};

// ─── Private helper ───────────────────────────────────────────────────────────

/**
 * Iteratively collects the IDs of a folder and all its descendants
 * from the flat folder list. Used to know which disk directories to remove.
 *
 * @param {string}   rootId
 * @param {Folder[]} allFolders   All folders for the case (flat)
 * @returns {string[]}
 */
function collectDescendantIds(rootId, allFolders) {
    const result  = [rootId];
    const queue   = [rootId];

    while (queue.length) {
        const current = queue.shift();
        for (const f of allFolders) {
            if (f.parentFolderId === current) {
                result.push(f.id);
                queue.push(f.id);
            }
        }
    }

    return result;
}
