import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

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
  return new Uint8Array(arrayBuffer);
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

async function extractFigures({ buffer, contentType, reportId, supabase }) {
  const figures = [];
  try {
    // DOCX: use mammoth HTML conversion to capture images
    if (contentType?.includes('wordprocessingml') || contentType?.includes('docx')) {
      const mammoth = await import('mammoth');
      const images = [];
      const { value: html } = await mammoth.convertToHtml({ buffer }, {
        convertImage: mammoth.images.inline(async (element) => {
          try {
            const contentType = element.contentType || 'image/png';
            const imageBuffer = await element.read();
            const ts = Date.now();
            const path = `figures/${reportId}/${ts}_${Math.random().toString(36).slice(2)}.bin`;
            if (supabase) {
              await supabase.storage.from('reports').upload(path, imageBuffer, { contentType, upsert: true });
              const { data: pub } = supabase.storage.from('reports').getPublicUrl(path);
              images.push({ url: pub?.publicUrl || null, mime: contentType });
              return { src: pub?.publicUrl || '' };
            }
            // If no supabase, fallback to data URI
            const base64 = Buffer.from(imageBuffer).toString('base64');
            const dataUri = `data:${contentType};base64,${base64}`;
            images.push({ url: dataUri, mime: contentType });
            return { src: dataUri };
          } catch {
            return { src: '' };
          }
        })
      });
      // Heuristic: search for captions containing "Figure" near images by splitting HTML into blocks
      const blocks = String(html || '').split(/<p[^>]*>|<div[^>]*>/i);
      let imgIdx = 0;
      for (const blk of blocks) {
        if (blk.includes('<img')) {
          const img = images[imgIdx];
          imgIdx += 1;
          if (!img) continue;
          // Find caption text following the image
          const capMatch = blk.match(/Figure\s*(\d+)\s*[:\-]?\s*([^<]+)/i) || String(blk).match(/Fig\.?\s*(\d+)\s*[:\-]?\s*([^<]+)/i);
          const figure_num = capMatch ? Number(capMatch[1]) : imgIdx;
          const caption = capMatch ? capMatch[2]?.trim() : null;
          figures.push({ figure_num, caption, page: null, mime: img.mime, url: img.url });
        }
      }
    } else if (contentType?.includes('pdf')) {
      // PDF: extract caption text only via pdf-parse (no canvas rendering to avoid worker issues)
      try {
        const pdfParse = (await import('pdf-parse')).default;
        const data = await pdfParse(buffer);
        const txt = String(data.text || '');
        const regex = /(Fig\.?|Figure)\s*(\d+)\s*[:\-]?\s*([^\n]+)/gi;
        let m;
        while ((m = regex.exec(txt)) !== null) {
          const figure_num = Number(m[2]);
          const caption = (m[3] || '').trim();
          figures.push({ figure_num, caption, page: null, mime: null, url: null });
        }
      } catch (e) {
        console.error('PDF caption extraction failed:', e);
      }
    }
  } catch (e) {
    console.error('Figure extraction failed:', e);
  }
  return figures;
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

    // Extract figures and persist (best-effort)
    try {
      const figures = await extractFigures({ buffer, contentType, reportId, supabase });
      if (Array.isArray(figures) && figures.length) {
        const figRows = figures.map(f => ({
          report_id: reportId,
          figure_num: f.figure_num || null,
          caption: f.caption || null,
          page: f.page || null,
          mime: f.mime || null,
          url: f.url || null,
        }));
        const batchSizeF = 50;
        for (let i = 0; i < figRows.length; i += batchSizeF) {
          const batch = figRows.slice(i, i + batchSizeF);
          const { error: fe } = await supabase.from('report_figures').insert(batch);
          if (fe) {
            const msg = String(fe?.message || '');
            if (msg.includes('does not exist')) break; // table missing; skip
            throw fe;
          }
        }
      }
    } catch (e) {
      console.error('Persisting figures failed:', e);
    }

    return json({ ok: true, chunks: rows.length });
  } catch (err) {
    console.error('Index-report error:', err);
    return json({ error: 'Indexing failed', details: String(err?.message || err) }, 500);
  }
}
