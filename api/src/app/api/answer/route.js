import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { buildChartForQuestion } from '../_lib/chartHelper';

export const runtime = 'nodejs';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    },
  });
}

function getServerSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchBuffer(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status} ${res.statusText}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function extractText({ buffer, contentType }) {
  try {
    if (contentType?.includes('pdf')) {
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buffer);
      return data.text || '';
    }
    if (contentType?.includes('wordprocessingml') || contentType?.includes('docx')) {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '';
    }
    if (contentType?.startsWith('text/')) {
      return buffer.toString('utf8');
    }
    // Fallback: try utf8
    return buffer.toString('utf8');
  } catch (e) {
    throw new Error(`Extraction failed: ${e.message}`);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });
}

export async function POST(request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return json({ error: 'OPENAI_API_KEY not set on server' }, 500);
    }

    const body = await request.json();
    const { url, contentType, question, name, reportId } = body || {};
    if (!url) return json({ error: 'Missing url' }, 400);
    if (!question) return json({ error: 'Missing question' }, 400);

    let trimmed = '';
    let chunks = [];
    let usedStored = false;
    const wantsChart = /\b(chart|graph|visualiz(e|ation)|plot|bar|line|pie)\b/i.test(String(question || ''));

    const supabase = getServerSupabase();
    if (supabase && reportId) {
      // Try load stored chunks first
      const { data: rows, error } = await supabase
        .from('report_chunks')
        .select('chunk_index, content, embedding')
        .eq('report_id', reportId)
        .order('chunk_index', { ascending: true });
      if (!error && rows && rows.length > 0) {
        chunks = rows.map(r => r.content);
        // retrieval using stored embeddings
        const questionEmbRes = await client.embeddings.create({
          model: 'text-embedding-3-small',
          input: question,
          dimensions: 1536,
        });
        const q = questionEmbRes.data[0].embedding;
        const cosine = (a, b) => {
          let dot = 0, na = 0, nb = 0;
          for (let i = 0; i < a.length; i++) {
            const ai = a[i];
            const bi = b[i];
            dot += ai * bi;
            na += ai * ai;
            nb += bi * bi;
          }
          return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
        };
        const scored = rows.map((r, idx) => ({ idx, score: cosine(q, r.embedding) }));
        scored.sort((x, y) => y.score - x.score);
        const topN = 5;
        const contextPieces = scored.slice(0, topN).map(s => `[#${s.idx + 1} score=${s.score.toFixed(3)}]\n${chunks[s.idx]}`);
        const context = contextPieces.join('\n\n');

        // If a chart is requested, build payload via helper using stored chunks
        if (wantsChart) {
          const payload = await buildChartForQuestion({ question, reportId, supabase, rawText: null, reportName: name });
          usedStored = true;
          return json({ ok: true, type: 'chart', payload });
        }

        const system = `You are a warm, encouraging analyst. Use clear, plain language and keep responses concise. Answer the user's question using ONLY the provided report excerpts. If the answer isn't in the excerpts, kindly say you don't have enough information and suggest what the user could ask next. When helpful, reference excerpt numbers like [#2] to ground your answer.`;
        const user = `Report: ${name || 'Untitled'}\n\n--- BEGIN EXCERPTS ---\n${context}\n--- END EXCERPTS ---\n\nQuestion: ${question}`;

        const completion = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.2,
        });

        const answer = completion.choices?.[0]?.message?.content || 'No answer generated.';
        usedStored = true;
        return json({ ok: true, answer, usedStored });
      }
    }

    // Fallback to on-the-fly extraction + retrieval
    const buffer = await fetchBuffer(url);
    const text = await extractText({ buffer, contentType });
    trimmed = (text || '').trim();
    if (!trimmed) return json({ error: 'No text content extracted' }, 400);

    // Chunk the document for retrieval (simple char-based chunking with overlap)
    const maxChunkSize = 3000; // chars
    const overlap = 300;
    chunks = [];
    for (let i = 0; i < trimmed.length; i += (maxChunkSize - overlap)) {
      const chunk = trimmed.slice(i, i + maxChunkSize);
      if (chunk.length > 0) chunks.push(chunk);
      if (chunk.length < maxChunkSize) break;
    }

    // Embed chunks
    const chunkEmbeddingsRes = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: chunks,
      dimensions: 1536,
    });
    const chunkEmbeddings = chunkEmbeddingsRes.data.map(d => d.embedding);

    // Embed question
    const questionEmbRes = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: question,
      dimensions: 1536,
    });
    const q = questionEmbRes.data[0].embedding;

    // Cosine similarity
    const cosine = (a, b) => {
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < a.length; i++) {
        const ai = a[i];
        const bi = b[i];
        dot += ai * bi;
        na += ai * ai;
        nb += bi * bi;
      }
      return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
    };

    const scored = chunkEmbeddings.map((emb, idx) => ({ idx, score: cosine(q, emb) }));
    scored.sort((x, y) => y.score - x.score);
    const topN = 5;
    const contextPieces = scored.slice(0, topN).map(s => `[#${s.idx + 1} score=${s.score.toFixed(3)}]\n${chunks[s.idx]}`);
    const context = contextPieces.join('\n\n');

    const system = `You are a warm, encouraging analyst. Use clear, plain language and keep responses concise. Answer the user's question using ONLY the provided report excerpts. If the answer isn't in the excerpts, kindly say you don't have enough information and suggest what the user could ask next. When helpful, reference excerpt numbers like [#2] to ground your answer.`;
    const user = `Report: ${name || 'Untitled'}\n\n--- BEGIN EXCERPTS ---\n${context}\n--- END EXCERPTS ---\n\nQuestion: ${question}`;

    // If a chart is requested (no stored chunks), build via helper from extracted text
    if (wantsChart) {
      const payload = await buildChartForQuestion({ question, reportId, supabase: null, rawText: trimmed, reportName: name });
      return json({ ok: true, type: 'chart', payload });
    }

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
    });

    const answer = completion.choices?.[0]?.message?.content || 'No answer generated.';
    return json({ ok: true, answer, usedStored });
  } catch (err) {
    console.error('Answer route error:', err);
    return json({ error: 'Answering failed', details: String(err?.message || err) }, 500);
  }
}
