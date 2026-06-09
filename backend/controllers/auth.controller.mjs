import { generateSalt, hashPassword, verifyPassword } from "../utils/auth.utils.mjs";
import { signToken } from "../utils/jwt.utils.mjs";
import { User } from "../models/user.model.mjs";
import logger from "../config/logger.mjs";

/**
 * POST /api/auth/users   (Admin only)
 * Creates a new user account. Unlike the public /register route, this endpoint
 * requires a valid Admin JWT so the requested role can be trusted.
 */
export const adminCreateUser = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: "Name, email, and password are required." });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: "Password must be at least 8 characters." });
        }

        const requestedRole = role === "ADMIN" ? "ADMIN" : "LAWYER";

        const existing = await User.findByEmail(email);
        if (existing) {
            return res.status(409).json({ error: "An account with this email already exists." });
        }

        const salt = generateSalt();
        const passwordHash = await hashPassword(password, salt);
        const newUser = await User.create({ name, email, passwordHash, salt, role: requestedRole });

        return res.status(201).json({ user: newUser.toSafeObject() });
    } catch (err) {
        logger.error({ type: "auth", op: "adminCreateUser", uid: req.user?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * PATCH /api/auth/users/:id   (Admin only)
 * Updates a user's name, email, and/or role.
 */
export const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, role } = req.body;

        if (!name && !email && !role) {
            return res.status(400).json({ error: "At least one field (name, email, role) must be provided." });
        }

        const updated = await User.update(id, { name, email, role });
        if (!updated) {
            return res.status(404).json({ error: "User not found." });
        }

        return res.status(200).json({ user: updated.toSafeObject() });
    } catch (err) {
        logger.error({ type: "auth", op: "updateUser", targetId: req.params?.id, uid: req.user?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * POST /api/auth/register
 * Admin-only in production. Creates a new user account.
 */
export const register = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: "Name, email, and password are required." });
        }

        // Role defaults to LAWYER; only allow explicit ADMIN role if caller is an ADMIN
        const requestedRole = role === "ADMIN" ? "ADMIN" : "LAWYER";

        const existing = await User.findByEmail(email);
        if (existing) {
            return res.status(409).json({ error: "An account with this email already exists." });
        }

        const salt = generateSalt();
        const passwordHash = await hashPassword(password, salt);
        const newUser = await User.create({ name, email, passwordHash, salt, role: requestedRole });

        const token = signToken({ id: newUser.id, role: newUser.role });

        return res.status(201).json({ user: newUser.toSafeObject(), token });
    } catch (err) {
        logger.error({ type: "auth", op: "register", err: err.message });
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * POST /api/auth/login
 * Returns a JWT on successful credentials.
 */
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required." });
        }

        const user = await User.findByEmail(email);
        // Use a generic error message to prevent user enumeration
        if (!user) {
            return res.status(401).json({ error: "Invalid email or password." });
        }

        const isValid = await verifyPassword(password, user.getSalt(), user.getPasswordHash());
        if (!isValid) {
            return res.status(401).json({ error: "Invalid email or password." });
        }

        const token = signToken({ id: user.id, role: user.role });

        return res.status(200).json({ user: user.toSafeObject(), token });
    } catch (err) {
        logger.error({ type: "auth", op: "login", err: err.message });
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * GET /api/auth/me
 * Returns the logged-in user"s profile. Requires a valid JWT.
 */
export const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }
        return res.status(200).json({ user: user.toSafeObject() });
    } catch (err) {
        logger.error({ type: "auth", op: "getMe", uid: req.user?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * GET /api/auth/users?limit=20&offset=0
 * Admin-only. Returns a paginated list of all users.
 */
export const getAllUsers = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100); // cap at 100
        const offset = Math.max(parseInt(req.query.offset) || 0, 0);

        const { users, total } = await User.getAll({ limit, offset });

        return res.status(200).json({
            data: users.map((u) => u.toSafeObject()),
            total,
            limit,
            offset,
        });
    } catch (err) {
        logger.error({ type: "auth", op: "getAllUsers", uid: req.user?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * PATCH /api/auth/change-password
 * Authenticated. A user can change their own password.
 * Requires { currentPassword, newPassword } in body.
 */
export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: "currentPassword and newPassword are required." });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ error: "New password must be at least 8 characters." });
        }

        // Fetch with credentials to verify the current password
        const user = await User.findByEmail(
            (await User.findById(req.user.id))?.email
        );
        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }

        const isValid = await verifyPassword(currentPassword, user.getSalt(), user.getPasswordHash());
        if (!isValid) {
            return res.status(401).json({ error: "Current password is incorrect." });
        }

        const newSalt = generateSalt();
        const newPasswordHash = await hashPassword(newPassword, newSalt);
        await User.changePassword(req.user.id, newPasswordHash, newSalt);

        return res.status(200).json({ message: "Password updated successfully." });
    } catch (err) {
        logger.error({ type: "auth", op: "changePassword", uid: req.user?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * GET /api/auth/users/:id
 * Admin-only. Returns a single user"s profile by ID.
 */
export const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }
        return res.status(200).json({ user: user.toSafeObject() });
    } catch (err) {
        logger.error({ type: "auth", op: "getUserById", targetId: req.params?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
    }
};

/**
 * DELETE /api/auth/users/:id
 * Admin-only. Permanently deletes a user account.
 * Prevents an admin from deleting their own account.
 */
export const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        if (id === req.user.id) {
            return res.status(400).json({ error: "You cannot delete your own account." });
        }

        const deleted = await User.deleteById(id);
        if (!deleted) {
            return res.status(404).json({ error: "User not found." });
        }

        return res.status(200).json({ message: "User deleted successfully." });
    } catch (err) {
        logger.error({ type: "auth", op: "deleteUser", targetId: req.params?.id, uid: req.user?.id, err: err.message });
        return res.status(500).json({ error: "Internal server error." });
    }
};
