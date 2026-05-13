/**
 * Logger — compact logfmt file logger with 2-hour rotation.
 *
 * Log format (one line per event):
 *   TIMESTAMP LEVEL [TYPE ] key=value key="value with spaces" ...
 *
 * Example output:
 *   2026-05-13T12:00:00Z INFO  [HTTP ] method=GET path=/api/events status=200 ms=14 uid=a1b2c3
 *   2026-05-13T12:00:00Z ERROR [DB   ] op=Event.create err="Connection refused" uid=a1b2c3
 *   2026-05-13T12:00:00Z INFO  [AUTH ] event=login_success uid=a1b2c3
 *   2026-05-13T12:00:00Z INFO  [JOB  ] queue=doc-ingestion jobId=42 event=completed ms=4200
 *
 * In development:  colorized logfmt to stdout (no files written).
 * In production:   rotating logfmt files in backend/logs/.
 *
 * File naming:  app_YYYY-MM-DD_HH-mm.log  (timestamp at open time)
 * Rotation:     every LOG_ROTATION_MS (default 2 hours) OR on server restart.
 *
 * Usage:
 *   import logger from "./config/logger.mjs";
 *   logger.info({ type: "http", method: "GET", path: "/api/events", status: 200, ms: 14 });
 *   logger.error({ type: "db",   op: "Event.create", err: err.message });
 */

import fs   from "fs";
import path  from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ───────────────────────────────────────────────────────────────────

const LOGS_DIR    = path.join(__dirname, "../logs");
const ROTATION_MS = parseInt(process.env.LOG_ROTATION_MS, 10) || 2 * 60 * 60 * 1000;
const IS_DEV      = (process.env.NODE_ENV ?? "development") !== "production";

const LEVEL_RANK  = { error: 0, warn: 1, info: 2, debug: 3 };
const LEVEL_LABEL = ["ERROR", "WARN ", "INFO ", "DEBUG"];
const MAX_LEVEL   = LEVEL_RANK[process.env.LOG_LEVEL ?? "info"] ?? 2;

// ANSI colours — only used in dev
const COL = { 0: "\x1b[31m", 1: "\x1b[33m", 2: "\x1b[36m", 3: "\x1b[90m" };
const RST = "\x1b[0m";

// ─── File Rotation ────────────────────────────────────────────────────────────

let _stream   = null;
let _rotateAt = 0;

function _buildFilename() {
    // e.g. app_2026-05-13_10-00.log
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const tag = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`
              + `_${pad(now.getUTCHours())}-${pad(now.getUTCMinutes())}`;
    return path.join(LOGS_DIR, `app_${tag}.log`);
}

function _openStream() {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    _stream   = fs.createWriteStream(_buildFilename(), { flags: "a" });
    _rotateAt = Date.now() + ROTATION_MS;
    _stream.on("error", (err) => {
        process.stderr.write(`[Logger] Stream write error: ${err.message}\n`);
    });
}

function _checkRotation() {
    if (Date.now() >= _rotateAt) {
        _stream?.end();
        _openStream();
    }
}

/**
 * Closes the active log stream cleanly.
 * Call this in your graceful-shutdown handler before process.exit().
 * @returns {Promise<void>}
 */
export function closeLogger() {
    return new Promise((resolve) => {
        if (_stream) { _stream.end(resolve); } else { resolve(); }
    });
}

// Open on import (production only)
if (!IS_DEV) _openStream();

// ─── Formatting ───────────────────────────────────────────────────────────────

/**
 * Serialises a plain object to logfmt: k=v k="v with space"
 * Skips null / undefined values.
 */
function _logfmt(obj) {
    const parts = [];
    for (const [k, v] of Object.entries(obj)) {
        if (v === undefined || v === null) continue;
        const s = String(v);
        // Quote if value contains spaces, = or "
        parts.push(/[ ="]/u.test(s) ? `${k}="${s.replace(/"/g, "'")}"` : `${k}=${s}`);
    }
    return parts.join(" ");
}

/** Core write — shared by all public methods. */
function _write(levelStr, data) {
    const rank = LEVEL_RANK[levelStr];
    if (rank > MAX_LEVEL) return;

    const label   = LEVEL_LABEL[rank];
    const ts      = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

    const payload = typeof data === "string" ? { msg: data } : { ...data };
    const { type = "app", ...rest } = payload;

    // Fixed-width 5-char type column: [HTTP ] [DB   ] [JOB  ]
    const bracket = `[${type.toUpperCase().slice(0, 5).padEnd(5)}]`;
    const body    = _logfmt(rest);
    const line    = `${ts} ${label} ${bracket} ${body}\n`;

    if (IS_DEV) {
        process.stdout.write(`${COL[rank]}${line}${RST}`);
    } else {
        _checkRotation();
        _stream?.write(line);
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

const logger = {
    /** Unrecoverable failures, 5xx responses, job crashes. */
    error: (data) => _write("error", data),
    /** Validation errors, 4xx responses, retried jobs. */
    warn:  (data) => _write("warn",  data),
    /** Request/response summary, auth events, lifecycle. */
    info:  (data) => _write("info",  data),
    /** Detailed internals — only emitted when LOG_LEVEL=debug. */
    debug: (data) => _write("debug", data),
};

export default logger;
