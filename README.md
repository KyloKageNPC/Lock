# ChatPro

React chat UI scaffolded with Vite + Tailwind and `lucide-react` icons.

## Run locally

```powershell
npm install
npm run dev
```

Then open the URL shown (typically `http://localhost:5173`).

## Build and preview

```powershell
npm run build
npm run preview
```

## Notes

- The assistant response is currently a simulated placeholder. You can later integrate OpenAI's API.
- Tailwind classes are already applied for styling.
- To enable real uploads with Supabase, create `.env` from `.env.example` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Create a public bucket named `reports` in Supabase Storage.
- Supported previews: PDF and TXT inline; DOCX uses Office viewer.

## Supabase Setup (Storage)

1. Create a Supabase project and a public bucket named `reports`.
2. Get `Project URL` and `anon` key from Project Settings → API.
3. In `.env`, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Install SDK and run:

```powershell
cmd /c npm install @supabase/supabase-js
cmd /c npm run dev
```

## API Server (Next.js)

This repo includes a sibling API-only Next.js app under `api/` for vectorization.

```powershell
cd api
npm install
$env:OPENAI_API_KEY="<your key>"; npm run dev
```

- Health check: `GET http://localhost:3001/api/health`
- Vectorize: `POST http://localhost:3001/api/vectorize` with body `{ url, name, contentType }`
- Frontend calls the API after successful upload.