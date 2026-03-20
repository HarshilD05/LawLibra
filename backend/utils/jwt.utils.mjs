import jwt from 'jsonwebtoken';

const JWT_SECRET     = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

if (!JWT_SECRET) {
    throw new Error('[JWT] JWT_SECRET is not set. Aborting. Check your .env file.');
}

/**
 * Signs a JWT token with the given payload.
 * @param {{ id: string, role: string }} payload
 * @returns {string} Signed JWT token
 */
export const signToken = (payload) => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Verifies and decodes a JWT token.
 * @param {string} token
 * @returns {{ id: string, role: string, iat: number, exp: number }}
 * @throws {JsonWebTokenError | TokenExpiredError}
 */
export const verifyToken = (token) => {
    return jwt.verify(token, JWT_SECRET);
};
