import { randomBytes } from "crypto";
import logger from "../config/logger.mjs";

/**
 * HTTP Request Logger Middleware
 *
 * Attaches a short `reqId` to every request for log correlation, then logs
 * a single line after the response is sent (so the status code is known).
 *
 * Log level is chosen automatically:
 *   5xx → error  |  4xx → warn  |  everything else → info
 *
 * Example output:
 *   2026-05-13T12:00:00Z INFO  [HTTP ] reqId=3f7a method=GET path=/api/events status=200 ms=14 uid=a1b2c3
 *   2026-05-13T12:00:01Z WARN  [HTTP ] reqId=9c2b method=DELETE path=/api/events/bad-id status=404 ms=3 uid=a1b2c3
 */
export const requestLogger = (req, res, next) => {
    // 4-byte hex — short enough to not bloat logs, unique enough to correlate
    req.reqId = randomBytes(4).toString("hex");

    const start = Date.now();

    res.on("finish", () => {
        const ms = Date.now() - start;
        const level = res.statusCode >= 500 ? "error"
            : res.statusCode >= 400 ? "warn"
                : "info";

        logger[level]({
            type: "http",
            reqId: req.reqId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            ms,
            uid: req.user?.id?.slice(0, 8) ?? "-",
        });
    });

    next();
};
