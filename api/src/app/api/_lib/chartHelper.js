// Helper to decide chart intent and build a Chart.js payload from report content

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

const STOP = new Set([
  'the','a','an','and','or','but','of','to','in','on','for','with','at','by','from','as','is','are','was','were','be','been','being','that','this','it','its','if','into','than','then','so','such','their','there','they','them','we','you','your','our','i'
]);

function topTermsFromText(text, topN = 10) {
  const tokens = tokenize(text).filter(t => !STOP.has(t) && t.length > 2);
  const counts = new Map();
  for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
  const sorted = Array.from(counts.entries()).sort((a,b) => b[1]-a[1]).slice(0, topN);
  return { labels: sorted.map(([t]) => t), values: sorted.map(([,c]) => c) };
}

function buildChunkLengths(chunks) {
  return {
    labels: chunks.map((_, i) => `Chunk ${i+1}`),
    values: chunks.map(c => (c ? c.length : 0)),
  };
}

function decideIntent(question) {
  const q = String(question || '').toLowerCase();
  const wantsPie = /\bpie\b/.test(q) || /\bdistribution\b/.test(q);
  const wantsLine = /\bline\b/.test(q) || /\bover time\b/.test(q) || /\btrend\b/.test(q);
  const wantsBar = /\bbar\b/.test(q) || /\bcompare\b/.test(q) || /\bcomparison\b/.test(q);
  const wantsChunk = /\bchunk\b/.test(q) || /\bsection\b/.test(q) || /\blength\b/.test(q);

  let kind = 'bar';
  if (wantsPie) kind = 'pie';
  else if (wantsLine) kind = 'line';
  else if (wantsBar) kind = 'bar';

  const metric = wantsChunk && kind === 'line' ? 'chunk_lengths' : 'top_terms';
  return { kind, metric };
}

function toChartPayload(kind, labels, values, title, datasetLabel) {
  // For pie, Chart.js expects a single dataset with values
  return {
    kind,
    data: {
      labels,
      datasets: [
        {
          label: datasetLabel || title || 'Series',
          data: values,
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        title: { display: Boolean(title), text: title || '' }
      }
    }
  };
}

export async function buildChartForQuestion({ question, reportId, supabase, rawText, reportName }) {
  const { kind, metric } = decideIntent(question);

  // Try to use stored chunks first if supabase present
  let chunks = null;
  if (supabase && reportId) {
    try {
      const { data: rows, error } = await supabase
        .from('report_chunks')
        .select('chunk_index, content')
        .eq('report_id', reportId)
        .order('chunk_index', { ascending: true });
      if (!error && rows && rows.length) {
        chunks = rows.map(r => r.content || '');
      }
    } catch {}
  }

  if (metric === 'chunk_lengths') {
    // Use chunks or fallback to simple single-chunk
    const series = chunks && chunks.length ? buildChunkLengths(chunks) : buildChunkLengths([rawText || '']);
    return toChartPayload('line', series.labels, series.values, `${reportName || 'Report'} — Chunk lengths`, 'Length');
  }

  // top_terms metric
  const text = (chunks && chunks.length) ? chunks.join('\n') : (rawText || '');
  const tt = topTermsFromText(text, 10);
  const title = `${reportName || 'Report'} — Top terms`;
  const payload = toChartPayload(kind, tt.labels, tt.values, title, 'Count');
  return payload;
}
