# Documents API

Base path: `/api/documents`

All endpoints require a valid JWT (`Authorization: Bearer <token>`).

**Access levels** referenced below are per-case assignment levels (`VIEW`, `EDIT`, `ADMIN`). System Admins bypass all assignment checks.

**Processing status lifecycle:**
```
PENDING → PROCESSING → DONE
                     → FAILED
```
The HTTP response for upload is always `202 Accepted` — check `GET /:id` to poll current status.

---

## Endpoints

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| POST | [`/upload`](#1-post-upload) | EDIT \| ADMIN | Upload a document and queue ingestion |
| GET | [`/`](#2-get-) | VIEW+ | List documents for a case |
| GET | [`/:id`](#3-get-id) | VIEW+ | Get a single document + processing status |
| GET | [`/:id/chunks`](#4-get-idchunks) | VIEW+ | Get all semantic chunks extracted from the document |
| DELETE | [`/:id`](#5-delete-id) | EDIT \| ADMIN | Delete document, file, and all chunks |

---

## 1. `POST /upload`

Uploads a document into a case (optionally into a specific folder) and immediately queues it for background ingestion via BullMQ.

The server responds with `202 Accepted` as soon as the file is saved and the job is queued — ingestion (text extraction → chunking → embedding → DB storage) happens asynchronously in the worker process. Poll `GET /:id` to track progress.

**Content-Type:** `multipart/form-data`

### Form Fields

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `document` | file | Yes | The file to upload. Field name must be `document` |
| `caseId` | text | Yes | UUID of the target case |
| `folderId` | text | No | UUID of a folder within the case. Omit or send empty for case root |

### Accepted File Types

| MIME Type | Extension |
| :--- | :--- |
| `application/pdf` | `.pdf` |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `.docx` |
| `application/msword` | `.doc` |
| `text/plain` | `.txt` |

**Maximum file size:** 200 MB

### On-disk Storage Path

Files are stored at:
```
data/<caseId>/<folderId>/  (if folderId provided)
data/<caseId>/root/        (if no folderId — case root)
```
The `storage_path` value stored in the DB (e.g. `<caseId>/root/<uuid>.pdf`) doubles as the future S3 key — no migration required when switching to object storage.

### Success Response — `202 Accepted`

```json
{
  "message": "Document uploaded successfully. Ingestion has started in the background.",
  "documentId": "d1e2f3g4-...",
  "jobId": "42",
  "status": "PENDING"
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `400` | `caseId is required.` | Missing `caseId` field |
| `400` | `No file provided. Use field name "document".` | File field missing or wrong name |
| `400` | `Unsupported file type: <mime>. Accepted: PDF, DOCX, DOC, TXT` | Rejected by multer file filter |
| `400` | `folderId does not belong to this case.` | Folder exists in a different case |
| `403` | `VIEW access is insufficient. EDIT or ADMIN required to upload documents.` | Insufficient access level |
| `404` | `Case not found or access denied.` | No access or case missing |
| `500` | `Internal server error.` | Unexpected failure |

---

## 2. `GET /`

Lists documents for a case. Supports pagination and optional filtering by folder.

### Query Parameters

| Parameter | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `caseId` | string (UUID) | Yes | |
| `folderId` | string | No | UUID to filter by folder. Send `null` (literal string) for root-only documents. Omit entirely for all documents across all folders |
| `limit` | integer | No | Default `20`, max `100` |
| `offset` | integer | No | Default `0` |

### Success Response — `200 OK`

```json
{
  "data": [
    {
      "id": "d1e2f3g4-...",
      "caseId": "c1d2e3f4-...",
      "folderId": null,
      "uploaderId": "u9u8u7u6-...",
      "fileName": "550e8400-e29b-41d4-a716-446655440000.pdf",
      "originalName": "Sharma_Affidavit.pdf",
      "storagePath": "c1d2e3f4-.../root/550e8400-....pdf",
      "mimeType": "application/pdf",
      "fileSizeBytes": 204800,
      "pageCount": 12,
      "processingStatus": "DONE",
      "processingError": null,
      "summary": null,
      "tags": [],
      "createdAt": "2026-02-25T10:00:00.000Z",
      "updatedAt": "2026-02-25T10:03:15.000Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `400` | `caseId query parameter is required.` | Missing `caseId` |
| `404` | `Case not found or access denied.` | No access or case missing |
| `500` | `Internal server error.` | Unexpected failure |

---

## 3. `GET /:id`

Returns full metadata for a single document, including current processing status. Use this to poll ingestion progress after upload.

### Processing Status Values

| Value | Meaning |
| :--- | :--- |
| `PENDING` | Queued, worker has not yet started |
| `PROCESSING` | Worker is actively ingesting the document |
| `DONE` | Ingestion complete — chunks are searchable |
| `FAILED` | Ingestion failed — see `processingError` for reason |

### Success Response — `200 OK`

```json
{
  "document": {
    "id": "d1e2f3g4-...",
    "caseId": "c1d2e3f4-...",
    "folderId": "f1000000-...",
    "originalName": "FIR_Copy.pdf",
    "processingStatus": "FAILED",
    "processingError": "No text could be extracted from the document.",
    "pageCount": 0,
    "createdAt": "2026-02-25T10:00:00.000Z",
    "updatedAt": "2026-02-25T10:01:02.000Z"
  }
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `403` | `Access denied.` | No assignment on the document"s case |
| `404` | `Document not found.` | No document with that ID |
| `500` | `Internal server error.` | Unexpected failure |

---

## 4. `GET /:id/chunks`

Returns all semantic chunks extracted from a specific document. The response includes text, keywords, and page numbers, but excludes the full dimension vector arrays for performance. 

This endpoint is particularly useful for debugging extraction quality, checking which keywords were assigned via TF-IDF, or manually tracing RAG mapping.

### Success Response — `200 OK`

```json
{
  "chunks": [
    {
      "id": "abc123d4-...",
      "document_id": "d1e2f3g4-...",
      "chunk_index": 0,
      "page_number": 1,
      "original_text": "This is the first segment of text pulled from the document...",
      "keywords": ["plaintiff", "testimony", "affidavit"],
      "created_at": "2026-03-20T10:00:00.000Z"
    },
    {
      "id": "abc123d5-...",
      "document_id": "d1e2f3g4-...",
      "chunk_index": 1,
      "page_number": 2,
      "original_text": "Continuing on the next page with overlapping context...",
      "keywords": ["jurisdiction", "court"],
      "created_at": "2026-03-20T10:00:00.000Z"
    }
  ]
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `403` | `Access denied.` | No assignment on the document"s case |
| `404` | `Document not found.` | No document with that ID |
| `500` | `Internal server error.` | Unexpected failure |

---

## 5. `DELETE /:id`

Permanently deletes the document, its physical file on disk, and all ingestion chunks from the database. **This operation is irreversible.**

If the physical file is already missing from disk (e.g. manual deletion), the DB record and chunks are still removed cleanly — a warning is logged server-side only.

### Cascade chain

```
Document (DB: DELETE)
  └── doc_chunks (DB: CASCADE)
  └── Physical file on disk (unlinked)
```

### Success Response — `200 OK`

```json
{
  "message": "Document deleted successfully."
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `403` | `VIEW access is insufficient. EDIT or ADMIN required to delete documents.` | Insufficient access level |
| `403` | `Access denied.` | No assignment on this case |
| `404` | `Document not found.` | No document with that ID |
| `500` | `Internal server error.` | Unexpected failure |

---

## Background Ingestion Pipeline

When a document is uploaded, the following pipeline runs in the **worker process** (`npm run worker`), entirely separate from the HTTP server:

```
1. Mark document PROCESSING
2. Extract text page-by-page (pdfjs-dist / mammoth / plain text)
3. Clean text + split into 900-char chunks with 150-char overlap
4. Extract TF-IDF keywords per chunk (zero extra API calls)
5. Generate 768-dim vector embeddings (Google text-embedding-004)
6. Bulk-insert all chunks into doc_chunks table (single transaction)
7. Mark document DONE + store page count
```

On failure at any step, the document is marked `FAILED` with the error message stored in `processingError`. BullMQ retries up to **3 times** with exponential backoff (5s → 25s → 125s) before giving up.

The HTTP server is **never blocked** by ingestion — it remains fully available during processing.
