import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { extractFiguresFromPDF } from '../_lib/figureExtractor.js';

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
    return buffer.toString('utf8');
  } catch (e) {
    throw new Error(`Extraction failed: ${e.message}`);
  }
}

function chunkText(text, size = 3000, overlap = 300) {
  const chunks = [];
  for (let i = 0; i < text.length; i += (size - overlap)) {
    const chunk = text.slice(i, i + size);
    if (!chunk) break;
    chunks.push(chunk);
    if (chunk.length < size) break;
  }
  return chunks;
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });
}

export async function POST(request) {
  try {
    if (!process.env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY not set on server' }, 500);
    const supabase = getServerSupabase();
    if (!supabase) return json({ error: 'Supabase server creds not configured' }, 500);

    const body = await request.json();
    const { reportId, url, contentType, name } = body || {};
    if (!reportId) return json({ error: 'Missing reportId' }, 400);
    if (!url) return json({ error: 'Missing url' }, 400);

    const buffer = await fetchBuffer(url);
    const text = await extractText({ buffer, contentType });
    const trimmed = (text || '').trim();
    if (!trimmed) return json({ error: 'No text content extracted' }, 400);

    const chunks = chunkText(trimmed);
    if (!chunks.length) return json({ error: 'No chunks produced' }, 400);

    const embeddingsRes = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: chunks,
      dimensions: 1536,
    });

    const rows = embeddingsRes.data.map((d, i) => ({
      report_id: reportId,
      chunk_index: i,
      content: chunks[i],
      embedding: d.embedding,
      name: name || null,
    }));

    // Remove existing chunks for this report
    await supabase.from('report_chunks').delete().eq('report_id', reportId);

    // Insert in batches to avoid payload limits
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabase.from('report_chunks').insert(batch);
      if (error) throw error;
    }

    // Extract figures from PDF if applicable
    let figuresExtracted = 0;
    if (contentType?.includes('pdf')) {
      try {
        const figures = await extractFiguresFromPDF(buffer, reportId, name || 'report');
        figuresExtracted = figures.length;
        console.log(`Extracted ${figuresExtracted} figures from report ${reportId}`);
      } catch (figErr) {
        console.error('Figure extraction failed (non-fatal):', figErr);
        // Don't fail the whole indexing if figure extraction fails
      }
    }

    return json({ ok: true, chunks: rows.length, figures: figuresExtracted });
  } catch (err) {
    console.error('Index-report error:', err);
    return json({ error: 'Indexing failed', details: String(err?.message || err) }, 500);
  }
}
