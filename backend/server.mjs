import "dotenv/config";
import express from "express";

import { initOllama } from "./config/ollama.mjs";
await initOllama();

import mainRouter from "./routes/main_router.mjs";


const app  = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json());

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
    console.log(`[Server] LawLibra backend running on port ${PORT}`);
});
