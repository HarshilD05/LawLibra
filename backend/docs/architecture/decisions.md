# Architecture Decision Records (ADRs)

Short records of deliberate technical decisions — capturing **why** choices were made, not just what was chosen. This prevents relitigating settled decisions and gives future contributors the context to make consistent choices.

Format: **Context → Decision → Consequences**

---

## ADR-001: Single PostgreSQL database for both relational data and vector search

**Date:** 2026-02  
**Status:** Accepted

### Context
RAG systems typically use a dedicated vector database (Pinecone, Weaviate, Qdrant) alongside a relational database. This requires managing two separate infrastructure pieces, two connection pools, and keeping them in sync.

### Decision
Use a single PostgreSQL instance with the `pgvector` extension. All relational data (users, cases, documents) and all vector embeddings (`doc_chunks.embedding`) live in the same database.

### Consequences
- ✅ One infrastructure piece to run, back up, and monitor
- ✅ Joins between relational data and vector results are native SQL (no cross-DB coordination)
- ✅ Case-scoped search is a simple `WHERE d.case_id = $1` clause — no equivalent in standalone vector DBs
- ✅ HNSW index provides sub-millisecond ANN search sufficient for a single law firm"s document volume
- ⚠️ Does not scale to billions of vectors — acceptable for this use case; can migrate to Qdrant later if needed

---

## ADR-002: Configurable 768-dimensional embedding providers

**Date:** 2026-03  
**Status:** Accepted

### Context
OpenAI"s `text-embedding-3-small` uses 1536 dimensions. Local Ollama models (`nomic-embed-text`, `mxbai-embed-large`) use 768 dimensions. Changing vector dimensions after deployment requires dropping and recreating the HNSW index and re-embedding all documents.

### Decisions
Standardise on **768 dimensions** now. An Embedding Factory allows configuring the embedding service (`google`, `ollama_local` for Ollama, or `external` API) freely via the `.env` without triggering a database schema rebuild. 

We additionally enforce an **Adaptive Rate Limit Strategy** via three `.env` variables (`EMBEDDING_BATCH_SIZE`, `EMBEDDING_DELAY_MS`, `EMBEDDING_RETRY_DELAY_MS`) to protect both cloud APIs (from HTTP 429 locks) and local GPUs (from Output Out-of-Memory crashes).

### Consequences
- ✅ A unified `embed(texts, isQuery)` interface ensures that Google Gemini models gracefully switch between `RETRIEVAL_DOCUMENT` and `QUESTION_ANSWERING` task types.
- ✅ Migrating to Ollama `nomic-embed-text` (local, zero API cost) requires changing only `.env` settings (`EMBEDDING_METHOD=ollama_local`) — **zero schema migration**
- ✅ Google API provides high quality embeddings during development without requiring local GPU
- ✅ Gracefully scales limits via adaptive batching without hard waits, vastly shrinking per-document processing time within legal quotas.
- ⚠️ Google API key continues to incur costs per token when selected as the primary provider method

---

## ADR-003: TF-IDF keywords instead of semantic keyword extraction

**Date:** 2026-02  
**Status:** Accepted

### Context
The previous BidTrust codebase extracted keywords by embedding each chunk individually — approximately 600 API calls for a 100-page document. For legal text, legal stop words (whereas, hereinafter, pursuant) severely pollute semantic keyword results.

### Decision
Use bulk TF-IDF (via the `natural` library) across all chunks of a document in a single pass. A single `TfIdf` instance is populated with all chunks so IDF weighting correctly penalises terms that appear in many chunks.

### Consequences
- ✅ Zero additional API calls — keywords are extracted as part of the same local processing step
- ✅ TF-IDF naturally surfaces domain-specific legal terms that appear rarely across the corpus
- ✅ Legal stop words list is easily extended as new patterns are discovered
- ⚠️ Keywords are lexical, not semantic — "vehicle" and "car" are not treated as synonyms
- ⚠️ Quality degrades for very short documents (< 5 chunks) where IDF has little to differentiate

---

## ADR-004: Separate worker process for document ingestion (Option B)

**Date:** 2026-02  
**Status:** Accepted

### Context
Document ingestion (PDF extraction, chunking, embedding) is CPU and memory intensive and can take minutes for large files. Two implementation options were considered:
- **Option A:** Run ingestion in the same Node.js process as the HTTP server (via `setImmediate` or worker threads)
- **Option B:** Run ingestion in a separate Node.js process connected via BullMQ

### Decision
**Option B** — separate process (`workers/doc_ingestion.worker.mjs`) coordinated via BullMQ and Redis.

### Consequences
- ✅ A worker crash (OOM, unhandled exception, native addon segfault) **never kills the HTTP server**
- ✅ Worker can be scaled independently (run multiple worker processes) without touching server code
- ✅ BullMQ provides persistent job state, automatic retries with exponential backoff, and a full job history in Redis
- ✅ Graceful shutdown: worker finishes active jobs before exiting on SIGTERM
- ⚠️ Requires Redis as an additional infrastructure dependency
- ⚠️ Two processes to manage in production (mitigated by PM2 ecosystem file)
- 📋 Resource guards (per-job timeout, memory limits) are still pending — see [TODO.md](../../TODO.md)

---

## ADR-005: Flat on-disk storage path (`<caseId>/<folderId>/file`)

**Date:** 2026-02  
**Status:** Accepted

### Context
Folders in LawLibra are nested (a folder can have sub-folders). Two storage path strategies were considered:
- **Nested:** `data/<caseId>/<parentId>/<childId>/file` — mirrors the logical tree on disk
- **Flat:** `data/<caseId>/<folderId>/file` — all folders are one level deep, nesting exists only in DB

### Decision
**Flat storage.** The `storage_path` column stores `<caseId>/<folderId>/<uuid>.<ext>` (or `<caseId>/root/<uuid>.<ext>` for unfoldered documents).

### Consequences
- ✅ Renaming a folder requires zero disk operations — only a DB `UPDATE folders SET name = $2`
- ✅ Re-parenting (moving) a folder in the future requires only a DB `UPDATE folders SET parent_folder_id = $2` — zero disk ops
- ✅ `storage_path` becomes a clean, short S3 key — no ancestor-chain resolution required for object storage migration
- ✅ Finding a file"s absolute path is a single function call: `path.join(DATA_DIR, storagePath)`
- ⚠️ The directory layout in `data/` does not visually reflect the folder hierarchy — acceptable since files are always accessed through the API, not by direct filesystem browsing

---

## ADR-006: Single law firm (no multi-tenancy)

**Date:** 2026-02  
**Status:** Accepted

### Context
LawLibra was initially conceived as a potential SaaS product. Early schema design included a `firms` table and `firm_id` foreign keys throughout.

### Decision
Remove all multi-tenancy infrastructure. LawLibra is custom software for **one specific law firm**. There is no `firms` table, no `firm_id`, and no tenant isolation logic.

### Consequences
- ✅ Significantly simpler schema (8 tables instead of 12+)
- ✅ All queries are simpler — no `WHERE firm_id = $1` appended everywhere
- ✅ No tenant isolation bugs or cross-tenant data leakage risk
- ⚠️ Not reusable as-is for a second law firm — would require adding multi-tenancy back
- This is an intentional product decision, not a technical limitation
