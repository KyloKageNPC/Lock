import React, { useEffect, useState } from 'react';
import { FileText, MessageSquare, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function UserReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null); // { url, name, type }

  const mapRow = (r) => ({
    id: r.id,
    name: r.name,
    fileName: r.file_name,
    uploadDate: r.created_at ? new Date(r.created_at) : new Date(),
    size: r.size_bytes != null ? `${(Number(r.size_bytes) / (1024 * 1024)).toFixed(1)} MB` : '-',
    status: r.status || 'active',
    url: r.url,
    contentType: r.content_type,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('reports')
          .select('*')
          .eq('status', 'active')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setReports((data || []).map(mapRow));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const formatDate = (date) =>
    date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white">
      <div className="bg-[#0a0a0a] border-b border-gray-800 px-8 py-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-gray-400 mt-1">Browse reports and start an AI chat about one</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="bg-[#2a2a2a] rounded-lg border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#0a0a0a] border-b border-gray-800">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Report</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Uploaded</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Size</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id} className="border-b border-gray-800 hover:bg-[#333333] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#00A67E] bg-opacity-20 rounded-lg flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-[#00A67E]" />
                        </div>
                        <div>
                          <div className="font-medium">{report.name}</div>
                          <div className="text-sm text-gray-400">{report.fileName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-400">{formatDate(report.uploadDate)}</td>
                    <td className="px-6 py-4 text-gray-400">{report.size}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {report.url && (
                          <button onClick={() => setPreview({ url: report.url, name: report.name, type: report.contentType || '' })} className="p-2 hover:bg-[#444444] rounded-lg transition-colors">
                            <Eye className="w-5 h-5 text-gray-400" />
                          </button>
                        )}
                        <Link
                          to={`/chat/${report.id}`}
                          state={{ reportName: report.name }}
                          className="px-3 py-2 bg-[#00A67E] text-white rounded-lg text-sm font-medium hover:bg-[#008f6b] flex items-center gap-2"
                        >
                          <MessageSquare className="w-4 h-4" />
                          Ask with AI
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && reports.length === 0 && (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No reports available yet</p>
            </div>
          )}
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={() => setPreview(null)}>
          <div className="bg-[#2a2a2a] rounded-lg w-full max-w-5xl h-[80vh] border border-gray-800 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <div className="text-sm text-gray-300 truncate pr-4">{preview.name}</div>
              <button onClick={() => setPreview(null)} className="p-2 hover:bg-[#444444] rounded-lg transition-colors">Close</button>
            </div>
            <div className="w-full h-full bg-[#1a1a1a]">
              {preview.type?.includes('pdf') ? (
                <iframe title="PDF Preview" src={preview.url} className="w-full h-full" />
              ) : preview.type?.includes('text') ? (
                <iframe title="Text Preview" src={preview.url} className="w-full h-full" />
              ) : preview.type?.includes('wordprocessingml') ? (
                <iframe title="DOCX Preview" className="w-full h-full" src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(preview.url)}`} />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm">No inline preview available</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
