# Chat Threads API

Base path: `/api/chat/threads`

All endpoints require a valid JWT (`Authorization: Bearer <token>`).

**Access rules:**
- **Create thread / Send message / Read:** any case assignment (`VIEW`, `EDIT`, `ADMIN`). Lawyers with `VIEW` access can still query the AI — they just cannot upload documents.
- **Rename / Delete thread:** thread owner **OR** System Admin only. Other assigned lawyers are blocked.
- System Admins bypass all case-assignment checks.

**`position_index` convention (stored in `chat_messages`):**
```
Even index (0, 2, 4 …) = USER message
Odd  index (1, 3, 5 …) = AI   message
```
A user message and its AI reply are always inserted atomically in a single DB transaction, keeping the sequence consistent under concurrent requests.

---

## Endpoints

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| POST | [`/`](#1-post-) | VIEW+ | Create a new thread for a case |
| GET | [`/?caseId=`](#2-get-caseid) | VIEW+ | List all threads for a case (paginated) |
| GET | [`/:id`](#3-get-id) | VIEW+ | Get a single thread |
| PATCH | [`/:id`](#4-patch-id) | Owner \| Admin | Rename a thread |
| DELETE | [`/:id`](#5-delete-id) | Owner \| Admin | Delete a thread and all its messages |
| GET | [`/:id/messages`](#6-get-idmessages) | VIEW+ | Get paginated messages for a thread |
| POST | [`/:id/messages`](#7-post-idmessages) | VIEW+ | Send a message and receive the AI reply |

---

## 1. `POST /`

Creates a new chat thread scoped to a case. Any user with any assignment level on the case may create threads.

### Request Body

```json
{
  "caseId": "c1d2e3f4-...",
  "title": "Questions about FIR"
}
```

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `caseId` | string (UUID) | Yes | The case this thread belongs to |
| `title` | string | No | Defaults to `"New Thread"` if omitted |

### Success Response — `201 Created`

```json
{
  "thread": {
    "id": "t1a2b3c4-...",
    "caseId": "c1d2e3f4-...",
    "userId": "u9u8u7u6-...",
    "title": "Questions about FIR",
    "createdAt": "2026-02-25T10:00:00.000Z"
  }
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `400` | `caseId is required.` | Missing or blank `caseId` |
| `404` | `Case not found or access denied.` | Case does not exist or requester has no assignment |
| `500` | `Internal server error.` | Unexpected failure |

---

## 2. `GET /?caseId=`

Returns a paginated list of all threads for a case, newest first. Each thread includes a `messageCount` so clients can show a preview without fetching the full message history.

### Query Parameters

| Parameter | Type | Default | Max | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `caseId` | string (UUID) | — | — | **Required** |
| `limit` | number | `20` | `100` | Records per page |
| `offset` | number | `0` | — | Records to skip |

### Success Response — `200 OK`

```json
{
  "data": [
    {
      "id": "t1a2b3c4-...",
      "caseId": "c1d2e3f4-...",
      "userId": "u9u8u7u6-...",
      "title": "Questions about FIR",
      "createdAt": "2026-02-26T09:00:00.000Z",
      "messageCount": 6
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

Returns metadata for a single thread. Does **not** include messages — use [`GET /:id/messages`](#6-get-idmessages) for those.

### Success Response — `200 OK`

```json
{
  "thread": {
    "id": "t1a2b3c4-...",
    "caseId": "c1d2e3f4-...",
    "userId": "u9u8u7u6-...",
    "title": "Questions about FIR",
    "createdAt": "2026-02-26T09:00:00.000Z"
  }
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `403` | `Access denied.` | Requester has no assignment on the thread's case |
| `404` | `Thread not found.` | No thread with that ID |
| `500` | `Internal server error.` | Unexpected failure |

---

## 4. `PATCH /:id`

Renames a thread. Only the thread's **creator** or a **System Admin** may rename it — other assigned lawyers receive a `403`.

### Request Body

```json
{
  "title": "FIR Date & Witness Statements"
}
```

| Field | Type | Required |
| :--- | :--- | :--- |
| `title` | string | Yes |

### Success Response — `200 OK`

```json
{
  "thread": {
    "id": "t1a2b3c4-...",
    "caseId": "c1d2e3f4-...",
    "userId": "u9u8u7u6-...",
    "title": "FIR Date & Witness Statements",
    "createdAt": "2026-02-26T09:00:00.000Z"
  }
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `400` | `title is required.` | Empty or missing `title` |
| `403` | `Only the thread owner or an Admin can rename this thread.` | Requester is not owner or Admin |
| `403` | `Access denied.` | No assignment on this case |
| `404` | `Thread not found.` | No thread with that ID |
| `500` | `Internal server error.` | Unexpected failure |

---

## 5. `DELETE /:id`

Permanently deletes the thread and all its messages (cascades via FK). Only the thread's **creator** or a **System Admin** may delete it.

**This operation is irreversible.**

### Cascade chain

```
Thread (DB: CASCADE)
  └── chat_messages (all positions)
```

### Success Response — `200 OK`

```json
{
  "message": "Thread deleted successfully."
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `403` | `Only the thread owner or an Admin can delete this thread.` | Requester is not owner or Admin |
| `403` | `Access denied.` | No assignment on this case |
| `404` | `Thread not found.` | No thread with that ID |
| `500` | `Internal server error.` | Unexpected failure |

---

## 6. `GET /:id/messages`

Returns the message history for a thread ordered by `position_index` ascending (chronological order). Supports pagination.

### Query Parameters

| Parameter | Type | Default | Max | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `limit` | number | `50` | `200` | Records per page |
| `offset` | number | `0` | — | Records to skip |

### Success Response — `200 OK`

```json
{
  "data": [
    {
      "id": "m1000000-...",
      "threadId": "t1a2b3c4-...",
      "positionIndex": 0,
      "senderType": "USER",
      "content": "What is the FIR date?",
      "citations": null,
      "createdAt": "2026-02-26T09:01:00.000Z"
    },
    {
      "id": "m2000000-...",
      "threadId": "t1a2b3c4-...",
      "positionIndex": 1,
      "senderType": "AI",
      "content": "According to the FIR on record, the date is 14 January 2026...",
      "citations": [
        {
          "chunkId": "ck1a2b3c-...",
          "documentId": "d1e2f3g4-...",
          "documentName": "FIR_Copy.pdf",
          "pageNumber": 1,
          "similarity": 0.94
        }
      ],
      "createdAt": "2026-02-26T09:01:01.000Z"
    }
  ],
  "total": 2,
  "limit": 50,
  "offset": 0
}
```

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `403` | `Access denied.` | Requester has no assignment on the thread's case |
| `404` | `Thread not found.` | No thread with that ID |
| `500` | `Internal server error.` | Unexpected failure |

---

## 7. `POST /:id/messages`

Sends a user message and synchronously returns both the stored user message and the AI reply in a single response. Both messages are written in one atomic DB transaction.

> ⚠️ **RAG pipeline not yet implemented.** The AI response is currently a stub that echoes the question. When the RAG pipeline is complete, only the internal `_generateAIResponse()` function will change — the request/response shape and citation format will stay the same.

### Request Body

```json
{
  "content": "What is the FIR date?"
}
```

| Field | Type | Required |
| :--- | :--- | :--- |
| `content` | string | Yes |

### Success Response — `201 Created`

```json
{
  "userMessage": {
    "id": "m1000000-...",
    "threadId": "t1a2b3c4-...",
    "positionIndex": 0,
    "senderType": "USER",
    "content": "What is the FIR date?",
    "citations": null,
    "createdAt": "2026-02-26T09:01:00.000Z"
  },
  "aiMessage": {
    "id": "m2000000-...",
    "threadId": "t1a2b3c4-...",
    "positionIndex": 1,
    "senderType": "AI",
    "content": "According to the FIR on record, the date is 14 January 2026...",
    "citations": [
      {
        "chunkId": "ck1a2b3c-...",
        "documentId": "d1e2f3g4-...",
        "documentName": "FIR_Copy.pdf",
        "pageNumber": 1,
        "similarity": 0.94
      }
    ],
    "createdAt": "2026-02-26T09:01:01.000Z"
  }
}
```

### Citation Object Fields

| Field | Type | Notes |
| :--- | :--- | :--- |
| `chunkId` | string (UUID) | ID of the `doc_chunks` row used |
| `documentId` | string (UUID) | Parent document |
| `documentName` | string | Original filename (e.g. `FIR_Copy.pdf`) |
| `pageNumber` | number | Page within the document where the chunk was found |
| `similarity` | number | Cosine similarity score (0–1) from the vector search |

### Error Responses

| Status | Error | Cause |
| :--- | :--- | :--- |
| `400` | `Message content is required.` | Empty or missing `content` |
| `403` | `Access denied.` | Requester has no assignment on this case |
| `404` | `Thread not found.` | No thread with that ID |
| `500` | `Internal server error.` | Unexpected failure |
