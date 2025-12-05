import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import ChartMessage from './ChartMessage';

export default function ChartViewer() {
  const location = useLocation();
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      const key = params.get('key');
      if (!key) { setError('Missing chart key'); return; }
      const raw = localStorage.getItem(key);
      if (!raw) { setError('Chart data not found'); return; }
      const data = JSON.parse(raw);
      setPayload(data);
    } catch (e) {
      setError('Failed to load chart');
    }
  }, [location.search]);

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white">
      <div className="bg-[#0a0a0a] border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Chart Viewer</h1>
        <Link to="/" className="text-sm text-[#00A67E] hover:underline">Back to Chat</Link>
      </div>
      <div className="p-6">
        {error ? (
          <div className="text-sm text-red-400">{error}</div>
        ) : payload ? (
          <div className="bg-[#2a2a2a] rounded-lg p-4 border border-gray-800">
            <ChartMessage payload={payload} />
          </div>
        ) : (
          <div className="text-sm text-gray-400">Loading…</div>
        )}
      </div>
    </div>
  );
}
