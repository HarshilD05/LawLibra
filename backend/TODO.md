# LawLibra — Pending Security & Infrastructure TODOs

## RAG Pipeline (Chat)
- [x] **Implement `_generateAIResponse()` in `controllers/chat.controller.mjs`** (patched 2026-02-26)
  - Created `services/llm_factory.mjs` — multi-provider factory (gemini/groq/openai/anthropic/ollama) driven by `LLM_PROVIDER` + `{PROVIDER}_API_KEY` in .env
  - Full RAG pipeline: embed query → similarity-thresholded pgvector search (case-scoped, max 10 sources) → SystemMessage + history + numbered sources → LLM → `{ aiContent, citations }`
  - Similarity threshold configurable via `RAG_SIMILARITY_THRESHOLD` in .env (default: 0.65)
  - Citations stored in `chat_messages.citations` JSONB as documented in `data_flow.md`

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
