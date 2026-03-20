# Environment Configuration Guide

This document details all the environment variables needed to configure the LawLibra backend. You will find descriptions for setting up the Database, LLM Providers, Embedding Services, and Document Ingestion Methods.

## Index
- [1. Server & Authentication Setup](#1-server--authentication-setup)
- [2. Database Setup](#2-database-setup)
- [3. LLM Provider Setup](#3-llm-provider-setup)
- [4. Embedding Setup](#4-embedding-setup)
- [5. Document Ingestion Method Setup](#5-document-ingestion-method-setup)
- [6. File Storage Setup](#6-file-storage-setup)

---

## 1. Server & Authentication Setup

These variables configure the HTTP server port and your JSON Web Token (JWT) credentials used for stateless session management.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | The port on which the Express server listens. |
| `JWT_SECRET` | *(None)* | **Required**. A strong, random string (minimum 32 characters) used to sign auth tokens. |
| `JWT_EXPIRES_IN` | `8h` | Time until user sessions expire (e.g., `8h`, `1d`, `60m`). |

---

## 2. Database Setup

LawLibra uses PostgreSQL (with the `pgvector` extension) to store both relational data and vector embeddings.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `DB_HOST` | `localhost` | The hostname of your PostgreSQL database. |
| `DB_PORT` | `5432` | The port number your PostgreSQL runs on. |
| `DB_NAME` | `lawlibra` | The name of the database. |
| `DB_USER` | `postgres` | The database user. |
| `DB_PASSWORD` | *(None)* | The password for the database user. |

---

## 2. LLM Provider Setup

LawLibra interfaces with Language Models to generate RAG-based answers to user queries.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `LLM_PROVIDER` | `gemini` | Which provider to use. Valid options: `gemini`, `openai`, `anthropic`, `ollama`, or others configured in the `llm_factory.mjs`. |
| `LLM_MODEL` | *(Depends on provider)*| The specific model name you want to use (e.g., `gemini-2.5-flash`, `gpt-4o`, `llama3`). |
| `RAG_SIMILARITY_THRESHOLD`| `0.65` | The initial cosine similarity floor (0-1) for searching context chunks for the LLM. |

**(Provider-specific keys are dynamically configured. For example:`OPENAI_API_KEY`, `GOOGLE_API_KEY`, etc. depending on your local factory overrides.)**

---

## 3. Embedding Setup

The system converts raw text and query text into dense vector arrays. To maintain compatibility with the existing PostgreSQL HNSW schema, all algorithms **must** return exactly **768** dimensions by default.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `EMBEDDING_METHOD` | `google` | The embedding provider to use. Options: `google`, `ollama_local`, `external`. |
| `EMBEDDING_DIMENSIONS` | `768` | Fixed constraint size for your pgvector queries. |
| `EMBEDDING_BATCH_SIZE` | `100` | The chunked batch size for sending text snippets to embedding endpoint. |

### Method-Specific Requirements:
- **Google** (`EMBEDDING_METHOD="google"`):
  - `GOOGLE_EMBEDDER_API_KEY`: Required. Generates embeddings via Google Gemini models.
- **Ollama Local** (`EMBEDDING_METHOD="ollama_local"`):
  - `OLLAMA_BASE_URL` (Default `http://localhost:11434`): The URL for generating embeddings using local hardware.
  - `OLLAMA_EMBEDDING_MODEL` (Default `nomic-embed-text`): Has to be a 768-D model.
- **External** (`EMBEDDING_METHOD="external"`):
  - `EXTERNAL_EMBEDDING_ENDPOINT`: The full REST POST URL to generate your vectors.
  - `EXTERNAL_EMBEDDING_API_KEY`: An optional generic API key to pass as a Bearer token.

---

## 4. Document Ingestion Method Setup

The document ingestion dispatcher decides how uploaded files are extracted, chunked, and embedded into the database.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `DOC_INGESTION_METHOD` | `sync` | Controls how worker jobs run. Options: `bullmq`, `spawn`, `sync`. |

### Detail on methods:
- **`sync` (Default):** Runs the pipeline inline on the HTTP server. It blocks the event loop. Uses a 200 response when fully done. **Used for local development/testing only.**
- **`spawn`:** Forks a one-off child process per document without requiring a job queue (No Redis needed). Non-blocking (HTTP server returns 202 accepted). Ideal for simple deployments.
- **`bullmq`:** Sends job items into a Redis-backed queue. Requires a standalone `npm run worker` process to be active. Best for scalable production with decoupled robust retries.

## 6. File Storage Setup

Configures where uploaded and processed files are saved.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `DATA_DIR` | `data` | The root folder for storing persistent documents, categorized by `<caseId>/<folderId>/`. |
| `UPLOAD_TEMP_DIR` | `uploads/tmp` | Temporary staging folder Multer uses before processing moves the file. |