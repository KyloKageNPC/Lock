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
      'access-control-allow-methods': 'PATCH,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });
}

export async function PATCH(request, ctx) {
  try {
    const supabase = getServerSupabase();
    if (!supabase) return json({ error: 'Supabase not configured' }, 500);
    const { params } = await ctx;
    const threadId = params?.threadId;
    if (!threadId) return json({ error: 'Missing threadId' }, 400);
    const body = await request.json();
    const { title } = body || {};
    if (!title) return json({ error: 'Missing title' }, 400);
    const { data, error } = await supabase
      .from('chat_threads')
      .update({ title })
      .eq('id', threadId)
      .select('id, title')
      .single();
    if (error) {
      if (String(error?.message || '').includes('relation') && String(error?.message || '').includes('does not exist')) {
        // Silently ignore update when table missing
        return json({ ok: false, skipped: true });
      }
      throw error;
    }
    return json({ ok: true, thread: data });
  } catch (err) {
    console.error('PATCH /api/chats/[threadId] error', err);
    return json({ error: 'Failed to update thread', details: String(err?.message || err) }, 500);
  }
}
