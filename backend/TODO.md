# LawLibra — Pending Security & Infrastructure TODOs

## RAG Pipeline (Chat)
- [ ] **Implement `_generateAIResponse()` in `controllers/chat.controller.mjs`**
  - The stub is clearly marked — replace only that function
  - Steps: embed query → hybrid pgvector + keyword search (case-scoped) → build LLM prompt → call Gemini API → return `{ aiContent, citations }`
  - See `docs/architecture/data_flow.md` (RAG Chat Query section) for the planned SQL and citation schema

## Worker Safety
- [ ] **Implement resource guards in the doc ingestion worker**
  - Add a per-job execution timeout (BullMQ `timeout` option) to kill hanging jobs
  - Add memory usage checks before processing large files (`process.memoryUsage()`)
  - Investigate CPU starvation protection for regex/chunking on malicious documents (e.g., `AbortController` or worker_threads with a timeout)
  - Consider running `pdfjs-dist` extraction inside a `worker_thread` so a crash/hang doesn't kill the BullMQ worker process itself

## Embeddings
- [ ] **Migrate from Google text-embedding-004 to local Ollama (nomic-embed-text)**
  - Both use 768 dimensions — schema migration is NOT required
  - Only change needed: swap the `EmbeddingService` constructor (`GoogleGenerativeAIEmbeddings` → `OllamaEmbeddings`)
  - Ensure Ollama is running as a local service before switching
  - Remove `GOOGLE_API_KEY` from `.env` after migration
