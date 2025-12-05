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
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });
}

export async function GET(request) {
  try {
    const supabase = getServerSupabase();
    if (!supabase) return json({ error: 'Supabase not configured' }, 500);
    const { searchParams } = new URL(request.url);
    const reportId = searchParams.get('reportId');
    const clientId = searchParams.get('clientId');
    if (!reportId || !clientId) return json({ error: 'Missing reportId or clientId' }, 400);
    const { data, error } = await supabase
      .from('chat_threads')
      .select('id, report_id, client_id, title, created_at')
      .eq('report_id', reportId)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    if (error) {
      // If table doesn't exist yet, return an empty list gracefully
      if (String(error?.message || '').includes('relation') && String(error?.message || '').includes('does not exist')) {
        return json({ ok: true, threads: [] });
      }
      throw error;
    }
    return json({ ok: true, threads: data || [] });
  } catch (err) {
    console.error('GET /api/chats error', err);
    return json({ error: 'Failed to load threads', details: String(err?.message || err) }, 500);
  }
}

export async function POST(request) {
  try {
    const supabase = getServerSupabase();
    if (!supabase) return json({ error: 'Supabase not configured' }, 500);
    const body = await request.json();
    const { reportId, clientId, title } = body || {};
    if (!reportId || !clientId) return json({ error: 'Missing reportId or clientId' }, 400);
    const { data, error } = await supabase
      .from('chat_threads')
      .insert([{ report_id: reportId, client_id: clientId, title: title || 'New Chat' }])
      .select('id, report_id, client_id, title, created_at')
      .single();
    if (error) throw error;
    return json({ ok: true, thread: data });
  } catch (err) {
    console.error('POST /api/chats error', err);
    return json({ error: 'Failed to create thread', details: String(err?.message || err) }, 500);
  }
}
