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

export async function GET(_request, { params }) {
  try {
    const { reportId } = await params;
    const supabase = getServerSupabase();
    if (!supabase) return json({ ok: true, figures: [] });
    if (!reportId) return json({ error: 'Missing reportId' }, 400);

    const { data, error } = await supabase
      .from('report_figures')
      .select('id, report_id, figure_num, caption, page, mime, url')
      .eq('report_id', reportId)
      .order('figure_num', { ascending: true });
    if (error) {
      const msg = String(error?.message || '');
      const code = String(error?.code || '');
      if (msg.includes('does not exist') || code === 'PGRST205') {
        // Gracefully return empty when table is missing
        return json({ ok: true, figures: [] });
      }
      throw error;
    }
    return json({ ok: true, figures: data || [] });
  } catch (err) {
    console.error('GET /api/reports/[reportId]/figures error', err);
    return json({ error: 'Failed to load figures', details: String(err?.message || err) }, 500);
  }
}
