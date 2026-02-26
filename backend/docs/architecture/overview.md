# Architecture Overview

LawLibra is a custom RAG-based AI legal assistant built for a single law firm. It is **not SaaS** — there is no multi-tenancy, no `firm_id`, and no subscription model. The system is deployed on-premise or on a private server for exclusive use by the firm.

---

## System Processes

Two independent Node.js processes run the backend:

| Process | Start Command | Responsibility |
| :--- | :--- | :--- |
| **HTTP Server** | `npm run start` | Handles all API requests. Never does heavy computation. |
| **Ingestion Worker** | `npm run worker` | Picks up document jobs from Redis, runs the full RAG pipeline. |

A crash in the worker never affects the HTTP server. They share the same PostgreSQL database and Redis instance but have no direct inter-process communication — coordination happens entirely through the job queue.

---

## High-Level System Diagram

> **📐 draw.io placeholder**
> Create a deployment/component diagram showing:
> - A **Client** box (browser / API client) on the left with an arrow labelled `HTTPS` pointing right
> - An **Express HTTP Server** box (Node.js process 1) receiving the arrow
> - From the server, three outbound arrows:
>   - → **PostgreSQL** (labelled `pg Pool — queries`)
>   - → **Redis** (labelled `BullMQ — enqueue job`)
>   - → **Disk / data/** (labelled `fs — file move`)
> - A **BullMQ Worker** box (Node.js process 2) with an arrow from Redis (labelled `dequeue job`) and two outbound arrows:
>   - → **PostgreSQL** (labelled `write chunks`)
>   - → **Google Embedding API** (labelled `HTTPS — embed text`)
> - A dashed border grouping the two Node.js processes labelled `Backend Server`
> - PostgreSQL and Redis in a second dashed border labelled `Data Layer`

---

## Technology Stack

| Layer | Technology | Reason |
| :--- | :--- | :--- |
| Runtime | Node.js (ESM) | Async I/O suits concurrent file handling and DB queries |
| HTTP framework | Express.js 5 | Minimal, well-understood, sufficient for REST API |
| Database | PostgreSQL 16 + pgvector | Single DB for relational data and vector search — no second infrastructure piece |
| Vector index | HNSW (pgvector) | Sub-millisecond approximate nearest-neighbour search at moderate scale |
| Job queue | BullMQ + Redis | Persistent jobs, retries, backoff, worker isolation |
| Auth | JWT + PBKDF2-SHA512 | Stateless tokens; strong password hashing via Node built-ins (no extra lib) |
| Embeddings | Google text-embedding-004 | 768 dims — matches Ollama `nomic-embed-text` for a zero-schema-migration local swap |
| PDF extraction | pdfjs-dist | Page-accurate extraction (critical for legal citations) |
| DOCX extraction | mammoth | Clean raw text from Word documents |
| Keyword extraction | TF-IDF (`natural`) | Hybrid search keywords at zero API cost |
| Chunking | LangChain RecursiveCharacterTextSplitter | 900-char chunks, 150-char overlap |

---

## What Is Deliberately Excluded

| Feature | Reason |
| :--- | :--- |
| Multi-tenancy / `firm_id` | Custom build for one firm — adds complexity for no benefit |
| Dedicated vector database | pgvector is sufficient at this scale; one fewer infrastructure dependency |
| Redis Cluster / Sentinel | Single Redis instance is fine for one firm; add HA later if needed |
| Object storage (S3) | Local disk for now; `storage_path` in DB is already the future S3 key |
| Semantic keyword extraction | Too expensive at ~600 API calls per 100-page document; TF-IDF is domain-appropriate |
