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

export async function GET(request, { params }) {
  try {
    const supabase = getServerSupabase();
    if (!supabase) return json({ error: 'Supabase not configured' }, 500);
    const { threadId } = await params;
    if (!threadId) return json({ error: 'Missing threadId' }, 400);
    const { data, error } = await supabase
      .from('chat_messages')
      .select('id, thread_id, type, content, timestamp')
      .eq('thread_id', threadId)
      .order('timestamp', { ascending: true });
    if (error) {
      if (String(error?.message || '').includes('relation') && String(error?.message || '').includes('does not exist')) {
        return json({ ok: true, messages: [] });
      }
      throw error;
    }
    return json({ ok: true, messages: data || [] });
  } catch (err) {
    console.error('GET /api/chats/[threadId]/messages error', err);
    return json({ error: 'Failed to load messages', details: String(err?.message || err) }, 500);
  }
}

export async function POST(request, { params }) {
  try {
    const supabase = getServerSupabase();
    if (!supabase) return json({ error: 'Supabase not configured' }, 500);
    const { threadId } = await params;
    if (!threadId) return json({ error: 'Missing threadId' }, 400);
    const body = await request.json();
    let { type, content, timestamp } = body || {};
    if (!type || content == null) return json({ error: 'Missing type or content' }, 400);
    const storedType = (type === 'user' || type === 'assistant') ? type : 'assistant';
    const storedContent = typeof content === 'string' ? content : JSON.stringify(content);
    const { data, error } = await supabase
      .from('chat_messages')
      .insert([{ thread_id: threadId, type: storedType, content: storedContent, timestamp: timestamp || new Date().toISOString() }])
      .select('id, thread_id, type, content, timestamp')
      .single();
    if (error) throw error;
    return json({ ok: true, message: data });
  } catch (err) {
    console.error('POST /api/chats/[threadId]/messages error', err);
    return json({ error: 'Failed to add message', details: String(err?.message || err) }, 500);
  }
}
