import { Router } from "express";
import {
    createCase,
    getCases,
    getCaseById,
    updateCase,
    deleteCase,
    assignLawyer,
    removeAssignment,
    getAssignments,
} from "../controllers/case.controller.mjs";
import { authenticate, authorizeAdmin } from "../middleware/auth.middleware.mjs";

const router = Router();

// All case routes require a valid JWT
router.use(authenticate);

// POST   /api/cases                              — Create a new case (Admin only)
router.post("/", authorizeAdmin, createCase);

// GET    /api/cases?limit&offset&status          — List cases (Admin: all | Lawyer: own)
router.get("/", getCases);

// GET    /api/cases/:id                          — Get a single case (Admin or assigned Lawyer)
router.get("/:id", getCaseById);

// PATCH  /api/cases/:id                          — Update a case (Admin or Lawyer with EDIT/ADMIN)
router.patch("/:id", updateCase);

// DELETE /api/cases/:id                          — Delete a case (Admin only)
router.delete("/:id", authorizeAdmin, deleteCase);

// POST   /api/cases/:id/assignments              — Assign a lawyer to a case (Admin only)
router.post("/:id/assignments", authorizeAdmin, assignLawyer);

// DELETE /api/cases/:id/assignments/:lawyerId    — Remove a lawyer from a case (Admin only)
router.delete("/:id/assignments/:lawyerId", authorizeAdmin, removeAssignment);

// GET    /api/cases/:id/assignments              — List all assignments for a case (Admin only)
router.get("/:id/assignments", authorizeAdmin, getAssignments);

export default router;
