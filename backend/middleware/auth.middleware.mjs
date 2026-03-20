import { verifyToken } from "../utils/jwt.utils.mjs";

/**
 * Middleware: Verifies Bearer JWT in Authorization header.
 * Attaches decoded payload to req.user on success.
 */
export const authenticate = (req, res, next) => {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized. No token provided." });
    }

    const token = header.split(" ")[1];

    try {
        req.user = verifyToken(token); // { id, role, iat, exp }
        next();
    } catch (err) {
        return res.status(401).json({ error: "Invalid or expired token." });
    }
};

/**
 * Middleware: Restricts access to ADMIN role only.
 * Must be used after authenticate().
 */
export const authorizeAdmin = (req, res, next) => {
    if (req.user?.role !== "ADMIN") {
        return res.status(403).json({ error: "Forbidden. Admin access required." });
    }
    next();
};
