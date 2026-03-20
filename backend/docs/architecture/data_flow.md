# Data Flow

The two most complex flows in LawLibra. Both are documented here with sequence diagrams.

---

## 1. Document Upload & Ingestion Flow

From the moment a user uploads a file to when its chunks are searchable in RAG queries.

### Sequence Diagram

> **📐 draw.io placeholder**
> Create a UML sequence diagram with these participants (left to right):
> `Client | HTTP Server | PostgreSQL | Redis | BullMQ Worker | Google Embedding API | Disk`
>
> Steps in order:
> 1. Client →→ HTTP Server : `POST /api/documents/upload` (multipart: file + caseId + folderId)
> 2. HTTP Server → HTTP Server : multer saves file to `uploads/tmp/<uuid>.ext`
> 3. HTTP Server → PostgreSQL : validate caseId access + folderId ownership
> 4. HTTP Server → Disk : `fs.rename` — move file to `data/<caseId>/<folderId>/`
> 5. HTTP Server → PostgreSQL : `INSERT INTO documents` (status=PENDING)
> 6. HTTP Server → Redis : `queue.add("ingest", { documentId, filePath, mimeType })`
> 7. HTTP Server →→ Client : `202 Accepted { documentId, jobId, status: PENDING }`
> 8. *(dashed separator line: "Background — Worker Process")*
> 9. Redis → BullMQ Worker : dequeue job
> 10. BullMQ Worker → PostgreSQL : UPDATE status = PROCESSING
> 11. BullMQ Worker → Disk : read file bytes
> 12. BullMQ Worker → BullMQ Worker : `DocumentProcessor.extractPageTexts()` (page-by-page)
> 13. BullMQ Worker → BullMQ Worker : `DocumentUtils.processDocument()` (clean → chunk → TF-IDF)
> 14. BullMQ Worker →→ Google Embedding API : batch embed all chunk texts
> 15. Google Embedding API →→ BullMQ Worker : 768-dim vectors
> 16. BullMQ Worker → PostgreSQL : bulk INSERT into doc_chunks (single transaction)
> 17. BullMQ Worker → PostgreSQL : UPDATE status = DONE, page_count = N
> 18. *(alt block: "On any step failure")* BullMQ Worker → PostgreSQL : UPDATE status = FAILED, error = message
> 19. *(BullMQ retries up to 3× with exponential backoff before marking permanently failed)*

### Key Points

- The HTTP server is **never blocked** — steps 8-17 happen entirely in the worker process.
- The uploaded file lives in its **final location** from step 4 onwards. The worker reads it there; it is never moved again.
- If the worker crashes mid-job, BullMQ detects the stale lock and **re-queues the job** automatically. Step 10 resets the status to PROCESSING on the next attempt.
- The file is only deleted via `DELETE /api/documents/:id` — never by the worker.

---

## 2. RAG Chat Query Flow

> ⚠️ **Not yet implemented** — this documents the planned design for the Chat module.

From a lawyer sending a question to receiving an AI answer with cited source chunks.

### Sequence Diagram

> **📐 draw.io placeholder**
> Create a UML sequence diagram with these participants:
> `Client | HTTP Server | PostgreSQL | Google Embedding API`
>
> Steps in order:
> 1. Client →→ HTTP Server : `POST /api/chat/<threadId>/message` `{ content: "What is the FIR date?" }`
> 2. HTTP Server → PostgreSQL : verify threadId belongs to a case the user can access
> 3. HTTP Server → PostgreSQL : INSERT user message into chat_messages
> 4. HTTP Server →→ Google Embedding API : embed query text → 768-dim vector
> 5. Google Embedding API →→ HTTP Server : query vector
> 6. HTTP Server → PostgreSQL : **Hybrid search** (see query below)
> 7. PostgreSQL →→ HTTP Server : top-K chunks with similarity scores + page numbers
> 8. HTTP Server → HTTP Server : build LLM prompt (system prompt + retrieved chunks + conversation history + user query)
> 9. HTTP Server →→ Google Gemini API : stream completion
> 10. Google Gemini API →→ HTTP Server : AI response text
> 11. HTTP Server → PostgreSQL : INSERT AI message into chat_messages (with citations JSONB)
> 12. HTTP Server →→ Client : `{ content: "...", citations: [{ chunkId, pageNumber, documentName }] }`

### Hybrid Search Query (Step 6)

The search is **case-scoped** — a lawyer can never retrieve chunks from a case they are not assigned to.

```sql
SELECT
    dc.id,
    dc.original_text,
    dc.page_number,
    dc.keywords,
    d.original_name,
    d.id AS document_id,
    1 - (dc.embedding <=> $queryVector) AS similarity
FROM doc_chunks dc
JOIN documents d ON d.id = dc.document_id
WHERE d.case_id = $caseId          -- CRITICAL: case-scoped isolation
  AND d.processing_status = "DONE"
ORDER BY dc.embedding <=> $queryVector   -- HNSW cosine search
LIMIT 5;
```

> **Planned enhancement:** Add keyword pre-filter (`dc.keywords && $queryKeywords`) before the vector sort to improve precision on legal terminology — this is the "hybrid" in hybrid search.

### Citation Format (stored in `chat_messages.citations` JSONB)

```json
[
  {
    "chunkId": "ck1a2b3c-...",
    "documentId": "d1e2f3g4-...",
    "documentName": "FIR_Copy.pdf",
    "pageNumber": 4,
    "similarity": 0.91
  }
]
```
