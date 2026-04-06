import { Case } from "../models/case.model.mjs";
import { getCaseDirPath, getDocumentDirPath, ensureDir, deleteDirRecursive } from "../utils/storage.utils.mjs";

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Resolves access for the requesting user to a specific case.
 * Admins always pass. Lawyers must be assigned.
 *
 * @param {string} caseId
 * @param {{ id: string, role: string }} reqUser
 * @param {string[]} [requiredLevels] - If provided, lawyer must have one of these access levels
 * @returns {Promise<{ kase: Case, accessLevel: string|null }|null>}
 *          Returns null if access is denied.
 */
const resolveAccess = async (caseId, reqUser, requiredLevels = []) => {
    const kase = await Case.findById(caseId);
    if (!kase) return null;

    if (reqUser.role === "ADMIN") return { kase, accessLevel: "ADMIN" };

    const accessLevel = await Case.getLawyerAccessLevel(caseId, reqUser.id);
    if (!accessLevel) return null;
    if (requiredLevels.length && !requiredLevels.includes(accessLevel)) return null;

    return { kase, accessLevel };
};

// ─── Case CRUD ────────────────────────────────────────────────────────────────

/**
 * POST /api/cases
 * Admin-only. Creates a new case.
 */
export const createCase = async (req, res) => {
    try {
        const { title, status, clientName, courtName, caseNumber, metadata } = req.body;

        if (!title) {
            return res.status(400).json({ error: "Case title is required." });
        }

        const newCase = await Case.create({
            title, status, clientName, courtName, caseNumber, metadata,
            createdBy: req.user.id,
        });

        // Create the root folder in the data directory for this case
        // Subfolders are created on-demand when documents are uploaded
        await ensureDir(getDocumentDirPath(newCase.id, null)); // data/<caseId>/root/

        return res.status(201).json({ case: newCase.toSafeObject() });
    } catch (err) {
        console.error("[Cases] createCase error:", err.message);
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * GET /api/cases?limit=20&offset=0&status=OPEN
 * Admin: returns all cases.
 * Lawyer: returns only their assigned cases.
 */
export const getCases = async (req, res) => {
    try {
        const limit  = Math.min(parseInt(req.query.limit)  || 20, 100);
        const offset = Math.max(parseInt(req.query.offset) || 0,  0);
        const status = req.query.status;

        let cases, total;

        if (req.user.role === "ADMIN") {
            ({ cases, total } = await Case.getAll({ limit, offset, status }));
        } else {
            ({ cases, total } = await Case.getByLawyerId(req.user.id, { limit, offset, status }));
        }

        // Hide the Global Case from the standard dashboard cases list
        const GLOBAL_CASE_ID = "00000000-0000-0000-0000-000000000000";
        const isGlobalIncluded = cases.some(c => c.id === GLOBAL_CASE_ID);
        if (isGlobalIncluded) {
            cases = cases.filter(c => c.id !== GLOBAL_CASE_ID);
            total = total - 1;
        }

        return res.status(200).json({
            data: cases.map((c) => c.toSafeObject()),
            total, limit, offset,
        });
    } catch (err) {
        console.error("[Cases] getCases error:", err.message);
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * GET /api/cases/:id
 * Admin or any assigned Lawyer.
 */
export const getCaseById = async (req, res) => {
    try {
        const access = await resolveAccess(req.params.id, req.user);

        if (!access) {
            return res.status(404).json({ error: "Case not found or access denied." });
        }

        return res.status(200).json({ case: access.kase.toSafeObject() });
    } catch (err) {
        console.error("[Cases] getCaseById error:", err.message);
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * PATCH /api/cases/:id
 * Admin or lawyer with EDIT / ADMIN access level.
 */
export const updateCase = async (req, res) => {
    try {
        const GLOBAL_CASE_ID = "00000000-0000-0000-0000-000000000000";
        if (req.params.id === GLOBAL_CASE_ID) {
            return res.status(403).json({ error: "The Global Legal Repository cannot be modified." });
        }

        const access = await resolveAccess(req.params.id, req.user, ["EDIT", "ADMIN"]);

        if (!access) {
            return res.status(403).json({ error: "Case not found or insufficient access." });
        }

        const { title, status, clientName, courtName, caseNumber, metadata } = req.body;
        const updated = await Case.update(req.params.id, { title, status, clientName, courtName, caseNumber, metadata });

        if (!updated) {
            return res.status(400).json({ error: "No valid fields provided for update." });
        }

        return res.status(200).json({ case: updated.toSafeObject() });
    } catch (err) {
        console.error("[Cases] updateCase error:", err.message);
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * DELETE /api/cases/:id
 * Admin-only. Permanently deletes a case and all related data (cascade).
 */
export const deleteCase = async (req, res) => {
    try {
        const GLOBAL_CASE_ID = "00000000-0000-0000-0000-000000000000";
        if (req.params.id === GLOBAL_CASE_ID) {
            return res.status(403).json({ error: "The Global Legal Repository cannot be deleted." });
        }

        const deleted = await Case.deleteById(req.params.id);

        if (!deleted) {
            return res.status(404).json({ error: "Case not found." });
        }

        // Delete all case files from disk (non-fatal — DB is the source of truth)
        await deleteDirRecursive(getCaseDirPath(req.params.id)).catch((e) => {
            console.warn(`[Cases] Could not delete data directory for case ${deleted.id}: ${e.message}`);
        });

        return res.status(200).json({ message: "Case deleted successfully." });
    } catch (err) {
        console.error("[Cases] deleteCase error:", err.message);
        return res.status(500).json({ error: "Internal server error." });
    }
};

// ─── Assignment Management ────────────────────────────────────────────────────

/**
 * POST /api/cases/:id/assignments
 * Admin-only. Assigns a lawyer to a case (upserts access level if already assigned).
 * Body: { lawyerId, accessLevel }
 */
export const assignLawyer = async (req, res) => {
    try {
        const { lawyerId, accessLevel } = req.body;

        if (!lawyerId || !accessLevel) {
            return res.status(400).json({ error: "lawyerId and accessLevel are required." });
        }

        const validLevels = ["VIEW", "EDIT", "ADMIN"];
        if (!validLevels.includes(accessLevel)) {
            return res.status(400).json({ error: `accessLevel must be one of: ${validLevels.join(", ")}.` });
        }

        const caseExists = await Case.findById(req.params.id);
        if (!caseExists) {
            return res.status(404).json({ error: "Case not found." });
        }

        const assignment = await Case.assignLawyer(req.params.id, lawyerId, accessLevel);
        return res.status(200).json({ assignment });
    } catch (err) {
        console.error("[Cases] assignLawyer error:", err.message);
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * DELETE /api/cases/:id/assignments/:lawyerId
 * Admin-only. Removes a lawyer from a case.
 */
export const removeAssignment = async (req, res) => {
    try {
        const removed = await Case.removeAssignment(req.params.id, req.params.lawyerId);

        if (!removed) {
            return res.status(404).json({ error: "Assignment not found." });
        }

        return res.status(200).json({ message: "Lawyer removed from case successfully." });
    } catch (err) {
        console.error("[Cases] removeAssignment error:", err.message);
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * GET /api/cases/:id/assignments
 * Admin-only. Lists all lawyers assigned to a case.
 */
export const getAssignments = async (req, res) => {
    try {
        const caseExists = await Case.findById(req.params.id);
        if (!caseExists) {
            return res.status(404).json({ error: "Case not found." });
        }

        const assignments = await Case.getAssignments(req.params.id);
        return res.status(200).json({ assignments });
    } catch (err) {
        console.error("[Cases] getAssignments error:", err.message);
        return res.status(500).json({ error: "Internal server error." });
    }
};
