import OpenAI from 'openai';

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
    const { url, name, contentType } = body || {};
    if (!url) return json({ error: 'Missing url' }, 400);

    const buffer = await fetchBuffer(url);
    const text = await extractText({ buffer, contentType });
    const trimmed = (text || '').trim();
    if (!trimmed) return json({ error: 'No text content extracted' }, 400);

    const input = trimmed.length > 15000 ? trimmed.slice(0, 15000) : trimmed;

    const embeddingRes = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input,
      dimensions: 1536,
    });

    const vector = embeddingRes.data?.[0]?.embedding || [];
    return json({ ok: true, name, contentType, vectorLength: vector.length });
  } catch (err) {
    console.error('Vectorize error:', err);
    return json({ error: 'Vectorization failed', details: String(err?.message || err) }, 500);
  }
}
