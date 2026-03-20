import { Router } from "express";
import {
    register,
    login,
    getMe,
    getAllUsers,
    getUserById,
    changePassword,
    deleteUser,
} from "../controllers/auth.controller.mjs";
import { authenticate, authorizeAdmin } from "../middleware/auth.middleware.mjs";

const router = Router();

// POST /api/auth/register  — Create a new user account
router.post("/register", register);

// POST /api/auth/login     — Authenticate and receive a JWT
router.post("/login", login);

// GET  /api/auth/me              — Get current authenticated user"s profile
router.get("/me", authenticate, getMe);

// PATCH /api/auth/change-password — Change own password (any authenticated user)
router.patch("/change-password", authenticate, changePassword);

// GET  /api/auth/users            — List all users with pagination (Admin only)
router.get("/users", authenticate, authorizeAdmin, getAllUsers);

// GET  /api/auth/users/:id        — Get a single user by ID (Admin only)
router.get("/users/:id", authenticate, authorizeAdmin, getUserById);

// DELETE /api/auth/users/:id      — Delete a user by ID (Admin only)
router.delete("/users/:id", authenticate, authorizeAdmin, deleteUser);

export default router;
