import crypto from "crypto";

// NIST SP 800-132 recommended minimum: 310,000 iterations for PBKDF2-SHA512
const ITERATIONS = 310_000;
const KEY_LENGTH = 64;     // 512 bits
const DIGEST    = "sha512";

/**
 * Generates a cryptographically random salt (hex string).
 * @returns {string} 64-character hex salt
 */
export const generateSalt = () => {
    return crypto.randomBytes(32).toString("hex");
};

/**
 * Hashes a plaintext password with a given salt using PBKDF2-SHA512.
 * @param {string} password - Plaintext password
 * @param {string} salt     - Hex salt string
 * @returns {Promise<string>} Hex hash string
 */
export const hashPassword = (password, salt) => {
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, DIGEST, (err, derivedKey) => {
            if (err) reject(err);
            else resolve(derivedKey.toString("hex"));
        });
    });
};

/**
 * Timing-safe comparison between a plaintext attempt and a stored hash.
 * @param {string} password    - Plaintext password attempt
 * @param {string} salt        - Hex salt from DB
 * @param {string} storedHash  - Hex hash from DB
 * @returns {Promise<boolean>}
 */
export const verifyPassword = async (password, salt, storedHash) => {
    const attemptHash = await hashPassword(password, salt);
    // timingSafeEqual prevents timing-based brute force attacks
    return crypto.timingSafeEqual(
        Buffer.from(attemptHash, "hex"),
        Buffer.from(storedHash, "hex")
    );
};
