# Data Models

Complete reference for every table in the LawLibra PostgreSQL database.

> **Extensions required:** `uuid-ossp`, `vector` (pgvector)

---

## Table of Contents

1. [users](#1-users)
2. [cases](#2-cases)
3. [case_assignments](#3-case_assignments)
4. [folders](#4-folders)
5. [documents](#5-documents)
6. [doc_chunks](#6-doc_chunks)
7. [chat_threads](#7-chat_threads)
8. [chat_messages](#8-chat_messages)
9. [Indexes](#9-indexes)

---

## 1. `users`

Stores all system accounts. A user is either a `LAWYER` or an `ADMIN`.

| Column | Type | Nullable | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | NO | `uuid_generate_v4()` | Primary key |
| `email` | `VARCHAR(255)` | NO | — | Unique login email |
| `name` | `VARCHAR(255)` | NO | — | Display name |
| `password_hash` | `VARCHAR(255)` | NO | — | PBKDF2-SHA512 hash |
| `salt` | `VARCHAR(255)` | NO | — | Cryptographic salt (hex) |
| `role` | `VARCHAR(50)` | NO | — | `LAWYER` or `ADMIN` |
| `created_at` | `TIMESTAMPTZ` | NO | `CURRENT_TIMESTAMP` | Account creation time |
| `updated_at` | `TIMESTAMPTZ` | NO | `CURRENT_TIMESTAMP` | Last update time |

**Constraints:** `role IN ("LAWYER", "ADMIN")`, `UNIQUE(email)`

---

## 2. `cases`

Represents a legal case managed by the firm.

| Column | Type | Nullable | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | NO | `uuid_generate_v4()` | Primary key |
| `title` | `VARCHAR(255)` | NO | — | Human-readable case title |
| `status` | `VARCHAR(50)` | NO | `"OPEN"` | `OPEN`, `CLOSED`, or `ARCHIVED` |
| `client_name` | `VARCHAR(255)` | YES | — | Name of the firm"s client |
| `court_name` | `VARCHAR(255)` | YES | — | Name of the court |
| `case_number` | `VARCHAR(100)` | YES | — | Official court case number |
| `metadata` | `JSONB` | YES | `"{}"` | Flexible extra fields (judge, hearings, etc.) |
| `created_by` | `UUID` | YES | — | FK → `users.id` |
| `created_at` | `TIMESTAMPTZ` | NO | `CURRENT_TIMESTAMP` | — |
| `updated_at` | `TIMESTAMPTZ` | NO | `CURRENT_TIMESTAMP` | — |

**Constraints:** `status IN ("OPEN", "CLOSED", "ARCHIVED")`

---

## 3. `case_assignments`

Junction table linking lawyers to cases with a specific access level. Controlled exclusively by Admins.

| Column | Type | Nullable | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `lawyer_id` | `UUID` | NO | — | FK → `users.id` |
| `case_id` | `UUID` | NO | — | FK → `cases.id` |
| `access_level` | `VARCHAR(50)` | NO | — | `VIEW`, `EDIT`, or `ADMIN` |
| `assigned_at` | `TIMESTAMPTZ` | NO | `CURRENT_TIMESTAMP` | When the assignment was made |

**Constraints:** `PRIMARY KEY (lawyer_id, case_id)`, `access_level IN ("VIEW", "EDIT", "ADMIN")`
**Cascade:** Deleting a user or case removes their assignments.

---

## 4. `folders`

Virtual file-system folders within a case. Self-referencing to support unlimited nesting.

| Column | Type | Nullable | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | NO | `uuid_generate_v4()` | Primary key |
| `case_id` | `UUID` | NO | — | FK → `cases.id` |
| `parent_folder_id` | `UUID` | YES | — | FK → `folders.id` (self-ref; `NULL` = root) |
| `name` | `VARCHAR(255)` | NO | — | Folder display name |
| `created_by` | `UUID` | YES | — | FK → `users.id` |
| `created_at` | `TIMESTAMPTZ` | NO | `CURRENT_TIMESTAMP` | — |

**Cascade:** Deleting a case removes all its folders. Deleting a folder removes all sub-folders.

---

## 5. `documents`

Metadata for files stored in object storage (S3 / MinIO / local disk). The actual file bytes live in storage; this table stores the reference and processing state.

| Column | Type | Nullable | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | NO | `uuid_generate_v4()` | Primary key |
| `case_id` | `UUID` | NO | — | FK → `cases.id` |
| `folder_id` | `UUID` | YES | — | FK → `folders.id` (`NULL` = case root) |
| `uploader_id` | `UUID` | YES | — | FK → `users.id` |
| `file_name` | `VARCHAR(255)` | NO | — | Stored filename (slug/UUID-safe) |
| `original_name` | `VARCHAR(255)` | NO | — | Original filename from upload |
| `storage_path` | `VARCHAR(512)` | NO | — | Path / key in object storage |
| `mime_type` | `VARCHAR(100)` | YES | — | e.g. `application/pdf` |
| `file_size_bytes` | `BIGINT` | YES | — | File size in bytes |
| `page_count` | `INTEGER` | YES | `0` | Number of pages (for PDFs) |
| `is_processed` | `BOOLEAN` | NO | `FALSE` | `TRUE` once RAG chunking is done |
| `processing_error` | `TEXT` | YES | — | Error message if processing failed |
| `summary` | `TEXT` | YES | — | LLM-generated full-document summary |
| `doc_embedding` | `vector(1536)` | YES | — | Embedding of the document summary |
| `tags` | `TEXT[]` | YES | — | User-defined tags e.g. `{Affidavit, Evidence}` |
| `created_at` | `TIMESTAMPTZ` | NO | `CURRENT_TIMESTAMP` | — |
| `updated_at` | `TIMESTAMPTZ` | NO | `CURRENT_TIMESTAMP` | — |

---

## 6. `doc_chunks`

Text segments split from documents for RAG retrieval. Each chunk stores its vector embedding and source page for citation purposes.

| Column | Type | Nullable | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | NO | `uuid_generate_v4()` | Primary key |
| `document_id` | `UUID` | NO | — | FK → `documents.id` |
| `chunk_index` | `INTEGER` | NO | — | Zero-based position within the document |
| `page_number` | `INTEGER` | YES | — | Source page number (for citations) |
| `original_text` | `TEXT` | NO | — | Raw extracted chunk text |
| `keywords` | `TEXT[]` | YES | — | Extracted keywords for hybrid search |
| `embedding` | `vector(1536)` | YES | — | Vector embedding (1536 = OpenAI; 768 = HuggingFace) |
| `created_at` | `TIMESTAMPTZ` | NO | `CURRENT_TIMESTAMP` | — |

---

## 7. `chat_threads`

A named conversation thread within a case. A case can have multiple threads.

| Column | Type | Nullable | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | NO | `uuid_generate_v4()` | Primary key |
| `case_id` | `UUID` | NO | — | FK → `cases.id` |
| `user_id` | `UUID` | YES | — | FK → `users.id` (thread owner) |
| `title` | `VARCHAR(255)` | YES | — | Thread title |
| `created_at` | `TIMESTAMPTZ` | NO | `CURRENT_TIMESTAMP` | — |

---

## 8. `chat_messages`

Individual messages within a thread. Uses `BIGSERIAL` for strict ordering.

**Ordering convention:** `position_index` is 0-based within a thread.
- **Even** positions (`0, 2, 4…`) → `USER` messages
- **Odd** positions (`1, 3, 5…`) → `AI` messages

| Column | Type | Nullable | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | NO | auto | Sequential global ID |
| `thread_id` | `UUID` | NO | — | FK → `chat_threads.id` |
| `position_index` | `INTEGER` | NO | — | 0-based slot in thread (even=USER, odd=AI) |
| `sender_type` | `VARCHAR(50)` | YES | — | `USER` or `AI` |
| `content` | `TEXT` | NO | — | Message body |
| `citations` | `JSONB` | YES | — | Array of `{ chunkId, documentId, pageNumber, snippet }` |
| `created_at` | `TIMESTAMPTZ` | NO | `CURRENT_TIMESTAMP` | — |

**Constraints:** `UNIQUE(thread_id, position_index)`, `sender_type IN ("USER", "AI")`

---

## 9. Indexes

| Index | Table | Column | Type | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| *(auto)* | `doc_chunks` | `embedding` | `HNSW (vector_cosine_ops)` | Fast approximate nearest-neighbour search for RAG |
| `idx_cases_metadata` | `cases` | `metadata` | `GIN` | Fast JSONB key/value queries |
