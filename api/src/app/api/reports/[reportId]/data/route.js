import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

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

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });
}

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

const STOPWORDS = new Set([
  'the','a','an','and','or','but','of','to','in','on','for','with','at','by','from','as','is','are','was','were','be','been','being','that','this','it','its','if','into','than','then','so','such','their','there','they','them','we','you','your','our','i'
]);

function topTerms(text, topN = 12) {
  const tokens = tokenize(text).filter(t => !STOPWORDS.has(t) && t.length > 2);
  const counts = new Map();
  for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
  const sorted = Array.from(counts.entries()).sort((a,b) => b[1]-a[1]).slice(0, topN);
  return { labels: sorted.map(([t]) => t), values: sorted.map(([,c]) => c) };
}

export async function GET(_request, { params }) {
  try {
    const { reportId } = await params;
    const supabase = getServerSupabase();
    if (!supabase) return json({ error: 'Supabase not configured' }, 500);
    if (!reportId) return json({ error: 'Missing reportId' }, 400);

    const { data: rows, error } = await supabase
      .from('report_chunks')
      .select('content, chunk_index')
      .eq('report_id', reportId)
      .order('chunk_index', { ascending: true });
    if (error) throw error;

    const chunks = (rows || []).map(r => r.content || '');
    const full = chunks.join('\n');

    const tt = topTerms(full, 12);
    const chunkLengths = {
      labels: chunks.map((_, i) => `Chunk ${i+1}`),
      values: chunks.map(c => (c ? c.length : 0)),
    };

    return json({ ok: true, metrics: { top_terms: tt, chunk_lengths: chunkLengths } });
  } catch (err) {
    console.error('Report data route error:', err);
    return json({ error: 'Failed to compute metrics', details: String(err?.message || err) }, 500);
  }
}
