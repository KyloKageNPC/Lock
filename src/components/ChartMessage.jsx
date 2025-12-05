import React from 'react';
import { Pie, Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  LineElement,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  PointElement
} from 'chart.js';

ChartJS.register(
  ArcElement,
  BarElement,
  LineElement,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  PointElement
);

// payload example:
// {
//   kind: 'bar' | 'line' | 'pie',
//   data: { labels: [...], datasets: [{ label, data, backgroundColor, borderColor }] },
//   options: { responsive: true, plugins: { legend: { position: 'top' }, title: { display: true, text: 'My Chart' } } }
// }

export default function ChartMessage({ payload }) {
  const safe = normalizePayload(payload);
  if (!safe) {
    return <div className="text-sm text-red-300">Invalid chart payload</div>;
  }
  const { kind, data, options } = safe;
  if (kind === 'pie') return <Pie data={data} options={options} />;
  if (kind === 'line') return <Line data={data} options={options} />;
  return <Bar data={data} options={options} />;
}

function normalizePayload(payload) {
  try {
    const p = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (!p || !p.kind || !p.data || !Array.isArray(p.data?.datasets)) return null;
    // basic sanitization: restrict keys
    const kind = ['bar', 'line', 'pie'].includes(p.kind) ? p.kind : 'bar';
    const data = {
      labels: Array.isArray(p.data.labels) ? p.data.labels : [],
      datasets: p.data.datasets.map(ds => ({
        label: String(ds.label || ''),
        data: Array.isArray(ds.data) ? ds.data : [],
        backgroundColor: ds.backgroundColor || defaultColors(ds.data?.length || 5),
        borderColor: ds.borderColor || undefined,
      }))
    };
    const options = p.options && typeof p.options === 'object' ? p.options : { responsive: true, plugins: { legend: { position: 'top' } } };
    return { kind, data, options };
  } catch {
    return null;
  }
}

function defaultColors(n) {
  const base = ['#00A67E', '#4C9A2A', '#1E90FF', '#FF7F50', '#FFD700', '#BA55D3'];
  const out = [];
  for (let i = 0; i < n; i++) out.push(base[i % base.length]);
  return out;
}
