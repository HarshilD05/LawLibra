# LawLibra — Backend

AI-powered legal research assistant for law firms. Built on **Express.js**, **PostgreSQL** (pgvector), and **Node.js ESM**.

---

## Prerequisites

| Requirement | Version |
| :--- | :--- |
| Node.js | >= 18.0.0 |
| PostgreSQL | >= 15 (with `pgvector` extension) |

---

## Setup

### 1. Clone & Install

```bash
git clone <repo-url>
cd backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```env
PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=lawlibra
DB_USER=postgres
DB_PASSWORD=yourpassword

JWT_SECRET=your_super_secret_key_minimum_32_chars
JWT_EXPIRES_IN=8h
```

### 3. Initialise the Database

Open `config/init/init_db.mjs` and set the three constants at the top to match your Postgres credentials:

```js
const PGSQL_USER     = "postgres";
const PGSQL_PASSWORD = "yourpassword";
const DB_NAME        = "lawlibra";
```

Then run:

```bash
npm run db:init
```

This will create the database (if it does not exist) and apply the full schema.

### 4. Start the Server

```bash
# Development (auto-restarts on file changes)
npm run dev

# Production
npm start
```

The server will be available at `http://localhost:3000`.

---

## Documentation

- [Data Models](docs/data_models.md) — Database schema in tabular format
- [API Reference](docs/APIs/apis.md) — All REST API endpoints