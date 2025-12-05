# Technical Improvement Plan

- Retrieval at scale: Add pgvector in Supabase, store embeddings in a vector column, index with ivfflat/hnsw, run similarity via SQL; or adopt Supabase Vector/pgvector functions.
- Identity and history: Tie threads/messages to authenticated user IDs; drop localStorage as the primary store; add pagination and cleanup for `chat_threads`/`chat_messages`.
- Background indexing: Move `/api/index-report` to an async job (queue/cron or Supabase Edge Functions + S3 webhooks); chunk and embed in batches with retries and status flags.
- Security: Use private storage + signed URLs; enforce RLS on `reports`, `report_chunks`, `chat_*`; never expose service role to the client; add content moderation where needed.
- Retrieval quality: Improve chunking (token-based), add MMR, hybrid search (text + vector), and optional reranking; store/source spans to return proper citations.
- Runtime/perf: Stream answers, cache question embeddings per thread, cap max tokens, prefetch top chunks, and add request timeouts/backoff.
- Charts: Switch to function-calling to request structured chart specs from the model, then validate on the server before rendering.
- Observability: Centralize logs, add request IDs, metrics, and error surfacing in API responses; write health checks beyond `route.js`.
