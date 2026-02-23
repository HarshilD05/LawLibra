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
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Edit these before running ───────────────────────────────────────────────
const PGSQL_USER     = 'postgres';
const PGSQL_PASSWORD = 'yourpassword';
const DB_NAME        = 'lawlibra';
// ─────────────────────────────────────────────────────────────────────────────

import pg from 'pg';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __dirname  = dirname(fileURLToPath(import.meta.url));

const SCHEMA_PATH = resolve(__dirname, '../db_schema.sql');
const PG_HOST     = 'localhost';
const PG_PORT     = 5432;

// ─── Step 1: Create the database if it doesn't exist ─────────────────────────
async function createDatabaseIfNotExists() {
    const adminClient = new Client({
        host:     PG_HOST,
        port:     PG_PORT,
        user:     PGSQL_USER,
        password: PGSQL_PASSWORD,
        database: 'postgres',       // connect to default DB to issue CREATE DATABASE
    });

    await adminClient.connect();
    console.log(`[Init] Connected to postgres (admin).`);

    const check = await adminClient.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [DB_NAME]
    );

    if (check.rowCount === 0) {
        // Identifiers cannot be parameterised — DB_NAME is a trusted constant set above
        await adminClient.query(`CREATE DATABASE "${DB_NAME}"`);
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

    const sql = await readFile(SCHEMA_PATH, 'utf-8');
    console.log(`[Init] Running schema from: ${SCHEMA_PATH}`);

    await schemaClient.query(sql);
    console.log(`[Init] Schema applied successfully.`);

    await schemaClient.end();
}

// ─── Entry point ─────────────────────────────────────────────────────────────
(async () => {
    try {
        await createDatabaseIfNotExists();
        await runSchema();
        console.log(`\n[Init] ✓ "${DB_NAME}" is ready.`);
    } catch (err) {
        console.error(`\n[Init] ✗ Initialisation failed:`, err.message);
        process.exit(1);
    }
})();
