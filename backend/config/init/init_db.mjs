/**
 * init_db.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time database initialisation script for LawLibra.
 *
 * USAGE:
 *   1. Edit the three variables below (PGSQL_USER, PGSQL_PASSWORD, DB_NAME).
 *   2. Run:  node config/init/init_db.mjs
 *
 * What it does:
 *   • Connects to the default `postgres` database.
 *   • Creates DB_NAME if it does not already exist.
 *   • Connects to DB_NAME and runs the full schema from db_schema.sql.
 *   • Seeds an initial ADMIN user "User0" with a randomly generated password.
 *     The password is written to config/init/password.txt.
 *     If User0 already exists the password is reset and the file is overwritten.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Edit these before running ───────────────────────────────────────────────
const PGSQL_USER     = "your_postgreSQL_username";
const PGSQL_PASSWORD = "you_postgresSQL_password";
const DB_NAME        = "lawlibra";

// ─────────────────────────────────────────────────────────────────────────────

import pg                              from "pg";
import { readFile, writeFile }         from "fs/promises";
import { resolve, dirname }            from "path";
import { fileURLToPath }               from "url";
import crypto                          from "crypto";
import { generateSalt, hashPassword } from "../../utils/auth.utils.mjs";

const { Client } = pg;
const __dirname  = dirname(fileURLToPath(import.meta.url));

const SCHEMA_PATH   = resolve(__dirname, "db_schema.sql");
const PASSWORD_PATH = resolve(__dirname, "password.txt");
const PG_HOST     = "localhost";
const PG_PORT     = 5432;

// ─── Step 1: Create the database if it doesn"t exist ─────────────────────────
async function createDatabaseIfNotExists() {
    const adminClient = new Client({
        host:     PG_HOST,
        port:     PG_PORT,
        user:     PGSQL_USER,
        password: PGSQL_PASSWORD,
        database: "postgres",       // connect to default DB to issue CREATE DATABASE
    });

    await adminClient.connect();
    console.log(`[Init] Connected to postgres (admin).`);

    const check = await adminClient.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [DB_NAME]
    );

    if (check.rowCount === 0) {
        // Identifiers cannot be parameterised — DB_NAME is a trusted constant set above
        await adminClient.query(`CREATE DATABASE ${DB_NAME};`);
        console.log(`[Init] Database "${DB_NAME}" created.`);
    } else {
        console.log(`[Init] Database "${DB_NAME}" already exists. Skipping creation.`);
    }

    await adminClient.end();
}

// ─── Step 2: Run the schema SQL against the target database ──────────────────
async function runSchema() {
    const schemaClient = new Client({
        host:     PG_HOST,
        port:     PG_PORT,
        user:     PGSQL_USER,
        password: PGSQL_PASSWORD,
        database: DB_NAME,
    });

    await schemaClient.connect();
    console.log(`[Init] Connected to "${DB_NAME}".`);

    const sql = await readFile(SCHEMA_PATH, "utf-8");
    console.log(`[Init] Running schema from: ${SCHEMA_PATH}`);

    await schemaClient.query(sql);
    console.log(`[Init] Schema applied successfully.`);

    await schemaClient.end();
}

// ─── Step 3: Seed the initial admin user (User0) ─────────────────────────────
async function seedAdminUser() {
    // 15 random bytes → 20-character URL-safe base64 string (no +, /, = chars)
    const plainPassword = crypto.randomBytes(15).toString("base64url");

    const salt         = generateSalt();
    const passwordHash = await hashPassword(plainPassword, salt);

    const userClient = new Client({
        host:     PG_HOST,
        port:     PG_PORT,
        user:     PGSQL_USER,
        password: PGSQL_PASSWORD,
        database: DB_NAME,
    });

    await userClient.connect();

    // Upsert: create User0 on first run, or reset password on subsequent runs
    const { rows } = await userClient.query(
        `INSERT INTO users (name, email, password_hash, salt, role)
         VALUES ($1, $2, $3, $4, 'ADMIN')
         ON CONFLICT (email) DO UPDATE
             SET password_hash = EXCLUDED.password_hash,
                 salt          = EXCLUDED.salt,
                 updated_at    = CURRENT_TIMESTAMP
         RETURNING id`,
        ["User0", "user0@lawlibra.local", passwordHash, salt],
    );

    const userId = rows[0].id;
    
    // Promote User0 to ADMIN for the Global Legal Repository case
    await userClient.query(
        `UPDATE case_assignments 
         SET access_level = 'ADMIN'
         WHERE lawyer_id = $1 AND case_id = '00000000-0000-0000-0000-000000000000'`,
        [userId]
    );

    await userClient.end();
    console.log(`[Init] User0 seeded (email: user0@lawlibra.local).`);

    // Write plaintext password to file — overwritten on every run
    const fileContent = [
        `LawLibra — Initial Admin Credentials`,
        `Generated : ${new Date().toISOString()}`,
        ``,
        `Email    : user0@lawlibra.local`,
        `Password : ${plainPassword}`,
        `Role     : ADMIN`,
        ``,
        `Change this password immediately after first login.`,
        `Delete this file once the password has been stored securely.`,
    ].join("\n");

    await writeFile(PASSWORD_PATH, fileContent, "utf-8");
    console.log(`[Init] Credentials written to: ${PASSWORD_PATH}`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────
(async () => {
    try {
        await createDatabaseIfNotExists();
        await runSchema();
        await seedAdminUser();
        console.log(`\n[Init] ✓ "${DB_NAME}" is ready. See config/init/password.txt for credentials.`);
    } catch (err) {
        console.error(`\n[Init] ✗ Initialisation failed:`, err.message);
        process.exit(1);
    }
})();
