import "dotenv/config";
import express from "express";
import cors from "cors";
import { initOllama } from "./config/ollama.mjs";
import logger, { closeLogger } from "./config/logger.mjs";
import { requestLogger } from "./middleware/request_log.middleware.mjs";
import mainRouter from "./routes/main_router.mjs";

await initOllama();

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json());
app.use(cors());
app.use(requestLogger);         // log every request/response

// --- Health Check ---
app.get("/health", (_req, res) => res.status(200).json({ status: "ok", service: "LawLibra API" }));

// --- API Routes ---
app.use("/api", mainRouter);

// --- 404 Fallback ---
app.use((_req, res) => {
    res.status(404).json({ error: "Route not found." });
});

// --- Start ---
app.listen(PORT, () => {
    logger.info({ type: "server", event: "start", port: PORT, env: process.env.NODE_ENV ?? "development" });
});

// --- Graceful Shutdown ---
async function shutdown(signal) {
    logger.info({ type: "server", event: "shutdown", signal });
    await closeLogger();   // flush the log stream before exit
    process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
