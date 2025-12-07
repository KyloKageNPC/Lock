/**
 * API Route: GET /api/reports/[reportId]/figures
 *
 * Retrieves figures for a specific report with smart limits based on report size
 */

import { createClient } from '@supabase/supabase-js';
import { getFiguresForReport } from '../../../_lib/figureExtractor.js';

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

export async function GET(request, { params }) {
  try {
    const supabase = getServerSupabase();
    if (!supabase) {
      return json({ error: 'Supabase server creds not configured' }, 500);
    }

    const { reportId } = params;
    if (!reportId) {
      return json({ error: 'Missing reportId' }, 400);
    }

    // Fetch report metadata to get page count
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('*')
      .eq('id', reportId)
      .single();

    if (reportError || !report) {
      return json({ error: 'Report not found' }, 404);
    }

    // Estimate page count from size or chunks
    // For now, use a heuristic: average 2KB per page
    const estimatedPages = Math.ceil((report.size_bytes || 0) / 2048);

    // Fetch figures with smart limits
    const result = await getFiguresForReport(reportId, estimatedPages);

    return json({
      ok: true,
      ...result,
      reportId,
      reportName: report.name
    });

  } catch (error) {
    console.error('Error fetching figures:', error);
    return json({
      error: 'Failed to fetch figures',
      details: String(error?.message || error)
    }, 500);
  }
}
