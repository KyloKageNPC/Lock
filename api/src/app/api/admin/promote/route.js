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
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });
}

export async function POST(request) {
  try {
    const supabase = getServerSupabase();
    if (!supabase) return json({ error: 'Supabase not configured' }, 500);
    const adminCode = process.env.ADMIN_SIGNUP_CODE;
    if (!adminCode) return json({ error: 'Admin code not configured' }, 500);
    const body = await request.json();
    const { userId, code } = body || {};
    if (!userId || !code) return json({ error: 'Missing userId or code' }, 400);
    if (code !== adminCode) return json({ error: 'Invalid admin code' }, 403);
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, role: 'admin' }, { onConflict: 'id' });
    if (error) {
      const msg = String(error?.message || '')
      if (msg.includes('does not exist') || msg.includes("Could not find the table 'public.profiles'")) {
        return json({
          error: 'Missing table profiles',
          fix: 'Create the table in Supabase SQL editor',
          sql: `create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text check (role in ('admin','client')) default 'client',
  created_at timestamp with time zone default now()
);`
        }, 400)
      }
      throw error;
    }
    return json({ ok: true });
  } catch (err) {
    console.error('POST /api/admin/promote error', err);
    return json({ error: 'Failed to promote user', details: String(err?.message || err) }, 500);
  }
}
