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
    const baseColors = professionalPalette();
    const data = {
      labels: Array.isArray(p.data.labels) ? p.data.labels : [],
      datasets: p.data.datasets.map((ds, i) => ({
        label: String(ds.label || ''),
        data: Array.isArray(ds.data) ? ds.data : [],
        backgroundColor: ds.backgroundColor || pickSeriesColor(baseColors, i, kind),
        borderColor: ds.borderColor || pickBorderColor(baseColors, i),
        borderWidth: kind === 'line' ? 2 : 1,
        tension: kind === 'line' ? 0.3 : undefined,
        pointRadius: kind === 'line' ? 2 : undefined,
        borderRadius: kind === 'bar' ? 6 : undefined,
      }))
    };
    const merged = mergeOptions(kind, p.options);
    return { kind, data, options: merged };
  } catch {
    return null;
  }
}

function professionalPalette() {
  // Muted, professional palette for dark UI
  return [
    '#4CC9F0', // cyan
    '#4361EE', // indigo
    '#3A0CA3', // deep purple
    '#F72585', // magenta
    '#B5179E', // purple
    '#4895EF', // blue
    '#2EC4B6', // teal
    '#FFBF69', // orange
    '#9E9E9E', // grey
  ];
}

function pickSeriesColor(palette, idx, kind) {
  if (kind === 'pie') {
    // For pie, Chart.js expects array; handled by datasets[0].backgroundColor
    return palette;
  }
  return palette[idx % palette.length];
}

function pickBorderColor(palette, idx) {
  const base = palette[idx % palette.length];
  return base;
}

function mergeOptions(kind, incoming) {
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#CCCCCC', boxWidth: 12 } },
      title: { display: false, color: '#FFFFFF', font: { size: 14, weight: '600' } },
      tooltip: {
        enabled: true,
        backgroundColor: '#1f2937',
        titleColor: '#ffffff',
        bodyColor: '#e5e7eb',
        cornerRadius: 6,
        callbacks: {
          label: (ctx) => {
            const v = ctx.parsed?.y ?? ctx.parsed ?? ctx.raw;
            const label = ctx.dataset?.label ? ctx.dataset.label + ': ' : '';
            return label + formatNumber(v);
          }
        }
      }
    },
    layout: { padding: 8 },
    scales: {
      x: { ticks: { color: '#B3B3B3', maxRotation: 0, autoSkip: true }, grid: { color: 'rgba(255,255,255,0.06)' } },
      y: { ticks: { color: '#B3B3B3' }, grid: { color: 'rgba(255,255,255,0.08)' } }
    },
    animation: { duration: 400, easing: 'easeOutQuart' }
  };

  if (kind === 'line') {
    base.elements = { line: { borderWidth: 2, tension: 0.3 }, point: { radius: 2 } };
  }
    
  if (kind === 'bar') {
    base.categoryPercentage = 0.8;
    base.barPercentage = 0.9;
  }

  if (kind === 'pie') {
    // Donut style
    base.cutout = '60%';
    base.plugins.legend.position = 'bottom';
    base.scales = undefined; // no grid for pie
    base.plugins.tooltip.callbacks = {
      label: (ctx) => `${ctx.label}: ${formatNumber(ctx.parsed)}`
    };
  }

  // Merge incoming options (shallow) while preserving base defaults
  const merged = { ...base, ...(incoming || {}) };
  merged.plugins = { ...(base.plugins || {}), ...((incoming || {}).plugins || {}) };
  if (base.scales || (incoming || {}).scales) {
    merged.scales = { ...(base.scales || {}), ...((incoming || {}).scales || {}) };
  }
  return merged;
}

function formatNumber(v) {
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
}
