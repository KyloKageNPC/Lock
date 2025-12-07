# Technical Improvement Plan

- Retrieval at scale: Add pgvector in Supabase, store embeddings in a vector column, index with ivfflat/hnsw, run similarity via SQL; or adopt Supabase Vector/pgvector functions.
- Identity and history: Tie threads/messages to authenticated user IDs; drop localStorage as the primary store; add pagination and cleanup for `chat_threads`/`chat_messages`.
- Background indexing: Move `/api/index-report` to an async job (queue/cron or Supabase Edge Functions + S3 webhooks); chunk and embed in batches with retries and status flags.
- Security: Use private storage + signed URLs; enforce RLS on `reports`, `report_chunks`, `chat_*`; never expose service role to the client; add content moderation where needed.
- Retrieval quality: Improve chunking (token-based), add MMR, hybrid search (text + vector), and optional reranking; store/source spans to return proper citations.
- Runtime/perf: Stream answers, cache question embeddings per thread, cap max tokens, prefetch top chunks, and add request timeouts/backoff.
- Charts: Switch to function-calling to request structured chart specs from the model, then validate on the server before rendering.
- Observability: Centralize logs, add request IDs, metrics, and error surfacing in API responses; write health checks beyond `route.js`.

- Figures: Extract figures from report PDFs/DOCX during indexing; capture caption, figure number, page, and source span.
- Storage: Create `report_figures` with `report_id`, `figure_num`, `title/caption`, `page`, `mime/url`, `chunk_span`, and `created_at`.
- API: Add `/api/reports/[reportId]/figures` to list figures and `/api/reports/[reportId]/figures/[figureNum]` to fetch a specific figure with metadata.
- Messaging: If a report has no figures, show a friendly notice at chat start and on figure-related queries ("No figures found for this report.").
- UX: On entering a report chat, display available figure cards and a count (e.g., "3 figures available"); enable prompts like "Show me Figure 2: Traveling stats" and quick actions to insert figure references into the chat.
