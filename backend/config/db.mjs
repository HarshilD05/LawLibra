import pg from "pg";
import logger from "./logger.mjs";

const { Pool } = pg;

const pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || "lawlibra",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD,
});

    logger.info({ type: "db", event: "connected" });

pool.on("error", (err) => {
    logger.error({ type: "db", event: "idle_error", err: err.message });
    process.exit(-1);
});

export default pool;
