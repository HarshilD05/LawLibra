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
9. [events](#9-events)
10. [notifications](#10-notifications)
11. [Indexes](#11-indexes)

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

## 9. `events`

Personal calendar events created by individual lawyers. Events are **user-owned**, not case-owned — a lawyer opts in to add an event (e.g. from a hearing notification). Overlapping events are intentional and permitted.

| Column | Type | Nullable | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | NO | `gen_random_uuid()` | Primary key |
| `user_id` | `UUID` | NO | — | FK → `users.id` · `ON DELETE CASCADE` |
| `type` | `VARCHAR(50)` | NO | — | `HEARING`, `DEADLINE`, `MEETING`, or `REMINDER` |
| `name` | `VARCHAR(255)` | NO | — | Short event title |
| `description` | `TEXT` | YES | — | Optional longer notes |
| `start_time` | `TIMESTAMPTZ` | NO | — | Event start (timezone-aware) |
| `end_time` | `TIMESTAMPTZ` | YES | — | Event end; `NULL` = point-in-time (e.g. a deadline) |
| `all_day` | `BOOLEAN` | NO | `FALSE` | `TRUE` for full-day events (court dates, etc.) |
| `remind_before_minutes` | `INTEGER` | YES | `NULL` | Minutes before `start_time` to fire an `EVENT_REMINDER` notification. `NULL` = no reminder |
| `created_at` | `TIMESTAMPTZ` | NO | `CURRENT_TIMESTAMP` | — |
| `updated_at` | `TIMESTAMPTZ` | NO | `CURRENT_TIMESTAMP` | — |

**Constraints:** `type IN ('HEARING', 'DEADLINE', 'MEETING', 'REMINDER')` · `chk_event_times: end_time IS NULL OR end_time > start_time` · `chk_remind_before: remind_before_minutes IS NULL OR remind_before_minutes > 0`

> **Design note:** No `status` column and no `case_id` FK by design. Events are personal — a lawyer deletes events they no longer need rather than tracking cancellation state. The link back to a case (if any) is carried by the notification that prompted the event creation.
>
> When `remind_before_minutes` is set, the event controller enqueues a delayed BullMQ job (queue: `event-reminders`). The job fires at `start_time − remind_before_minutes` and inserts an `EVENT_REMINDER` notification. Updating the event re-schedules the job using a deterministic job ID (`reminder:<event_id>`).

---

## 10. `notifications`

Per-user notification feed. Each row targets exactly one user.
- `entity_type` is a **real column** (not inside JSONB) so the feed can be filtered by tab (`CASE` / `CHAT` / `EVENT`) with a plain `WHERE` clause.
- `metadata` JSONB holds all type-specific context; its shape is contractually defined per `notification_type`.

| Column | Type | Nullable | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | NO | `gen_random_uuid()` | Primary key |
| `user_id` | `UUID` | NO | — | FK → `users.id` · `ON DELETE CASCADE` |
| `notification_type` | `VARCHAR(50)` | NO | — | See type enum below |
| `entity_type` | `VARCHAR(10)` | NO | — | `CASE`, `CHAT`, or `EVENT` |
| `msg` | `TEXT` | NO | — | Human-readable body rendered in the UI |
| `metadata` | `JSONB` | NO | `'{}'` | Type-specific payload — shape defined per `notification_type` |
| `is_read` | `BOOLEAN` | NO | `FALSE` | Whether the user has dismissed the notification |
| `read_at` | `TIMESTAMPTZ` | YES | `NULL` | Timestamp set when `is_read` flips to `TRUE` |
| `created_at` | `TIMESTAMPTZ` | NO | `CURRENT_TIMESTAMP` | For ordering and TTL-based archival |

**Constraints:** `notification_type IN (...)` · `entity_type IN ('CASE','CHAT','EVENT')`

### `notification_type` Enum

| Type | `entity_type` | Trigger |
| :--- | :--- | :--- |
| `CASE_ASSIGNED` | `CASE` | Admin assigns you to a case |
| `CASE_UNASSIGNED` | `CASE` | Admin removes you from a case |
| `CASE_UPDATED` | `CASE` | Case details changed |
| `HEARING_SCHEDULED` | `CASE` | Hearing date added or updated |
| `DOCUMENT_PROCESSED` | `CASE` | Document finished RAG ingestion |
| `DOCUMENT_ERROR` | `CASE` | Document RAG ingestion failed |
| `CHAT_RESPONSE_READY` | `CHAT` | AI finished generating a response |
| `CHAT_ERROR` | `CHAT` | AI response generation failed |
| `CHAT_DOCUMENT_PROCESSED` | `CHAT` | Document processed in a chat context |
| `CHAT_DOCUMENT_ERROR` | `CHAT` | Document error in a chat context |
| `EVENT_REMINDER` | `EVENT` | BullMQ delayed job fired at `start_time − remind_before_minutes` |

### Metadata Payload Shapes

Each `notification_type` has a strict payload contract. `action_url` is the frontend route the user is redirected to on click.

| Type | Metadata fields |
| :--- | :--- |
| `CASE_ASSIGNED` | `case_id`, `case_title`, `access_level`, `action_url` |
| `CASE_UNASSIGNED` | `case_id`, `case_title` — **no `action_url`** (access revoked) |
| `CASE_UPDATED` | `case_id`, `case_title`, `updated_fields[]`, `action_url` |
| `HEARING_SCHEDULED` | `case_id`, `case_title`, `hearing_date` (ISO 8601), `court_name`, `action_url` |
| `DOCUMENT_PROCESSED` | `case_id`, `case_title`, `document_id`, `document_name`, `action_url` |
| `DOCUMENT_ERROR` | `case_id`, `case_title`, `document_id`, `document_name`, `error_message`, `action_url` |
| `CHAT_RESPONSE_READY` | `case_id`, `case_title`, `thread_id`, `thread_title`, `action_url` |
| `CHAT_ERROR` | `case_id`, `case_title`, `thread_id`, `thread_title`, `error_message`, `action_url` |
| `CHAT_DOCUMENT_PROCESSED` | `case_id`, `case_title`, `thread_id`, `thread_title`, `document_id`, `document_name`, `action_url` |
| `CHAT_DOCUMENT_ERROR` | `case_id`, `case_title`, `thread_id`, `thread_title`, `document_id`, `document_name`, `error_message`, `action_url` |
| `EVENT_REMINDER` | `event_id`, `event_name`, `event_type`, `start_time` (ISO 8601), `action_url` |

---

## 11. `indexes`

| Index | Table | Column(s) | Type | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| *(auto)* | `doc_chunks` | `embedding` | `HNSW (vector_cosine_ops)` | Fast approximate nearest-neighbour search for RAG |
| `idx_cases_metadata` | `cases` | `metadata` | `GIN` | Fast JSONB key/value queries |
| `idx_events_user_id` | `events` | `user_id` | `BTREE` | Fetch all events for a user |
| `idx_events_user_start` | `events` | `(user_id, start_time)` | `BTREE` | Calendar range queries — `WHERE user_id = ? AND start_time BETWEEN ? AND ?` |
| `idx_notifications_user_unread` | `notifications` | `(user_id, is_read)` | `BTREE` | Unread-count badge — `WHERE user_id = ? AND is_read = FALSE` |
| `idx_notifications_user_feed` | `notifications` | `(user_id, created_at DESC)` | `BTREE` | Notification feed ordered by recency |
| `idx_notifications_entity` | `notifications` | `(user_id, entity_type)` | `BTREE` | Feed filtered by entity tab — `WHERE user_id = ? AND entity_type = ?` |
| `idx_notifications_metadata` | `notifications` | `metadata` | `GIN` | Query inside payload — e.g. `WHERE metadata->>'case_id' = ?` |
