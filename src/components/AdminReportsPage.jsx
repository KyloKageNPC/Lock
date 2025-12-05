import React, { useState, useEffect } from 'react';
import { Upload, FileText, Trash2, Eye, Plus, X, Check, AlertCircle, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AdminReportsPage() {
  const [reports, setReports] = useState([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newReport, setNewReport] = useState({
    name: '',
    file: null
  });
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [notification, setNotification] = useState(null);
  const [preview, setPreview] = useState(null); // { url, name, type }
  const [ingesting, setIngesting] = useState(false);
  const [loading, setLoading] = useState(true);

  const mapRow = (r) => ({
    id: r.id,
    name: r.name,
    fileName: r.file_name,
    uploadDate: r.created_at ? new Date(r.created_at) : new Date(),
    size: r.size_bytes != null ? `${(Number(r.size_bytes) / (1024 * 1024)).toFixed(1)} MB` : '-',
    status: r.status || 'active',
    url: r.url,
    storagePath: r.storage_path,
    contentType: r.content_type,
  });

  const loadReports = async () => {
    try {
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setReports((data || []).map(mapRow));
    } catch (e) {
      console.error(e);
      showNotification('Failed to load reports', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
    const channel = supabase
      .channel('reports-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reports' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setReports((prev) => [mapRow(payload.new), ...prev]);
          } else if (payload.eventType === 'DELETE') {
            setReports((prev) => prev.filter((r) => r.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE') {
            setReports((prev) => prev.map((r) => (r.id === payload.new.id ? mapRow(payload.new) : r)));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (file) => {
    if (file && (file.type === 'application/pdf' || file.type === 'text/plain' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')) {
      setNewReport(prev => ({ ...prev, file }));
      if (!newReport.name) {
        setNewReport(prev => ({ ...prev, name: file.name.replace(/\.[^/.]+$/, '') }));
      }
    } else {
      showNotification('Please upload PDF, TXT, or DOCX files only', 'error');
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleUploadReport = async (e) => {
    e.preventDefault();
    
    if (!newReport.name || !newReport.file) {
      showNotification('Please provide both report name and file', 'error');
      return;
    }

    try {
      const file = newReport.file;
      const timestamp = Date.now();
      const safeName = file.name.replace(/\s+/g, '_');
      const storagePath = `${timestamp}_${safeName}`;

      setUploadProgress(0);
      const { error: uploadError } = await supabase.storage
        .from('reports')
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from('reports').getPublicUrl(storagePath);
      const url = publicData?.publicUrl;

      const { data: inserted, error: insertError } = await supabase
        .from('reports')
        .insert([
          {
            name: newReport.name,
            file_name: file.name,
            url,
            storage_path: storagePath,
            content_type: file.type,
            size_bytes: file.size,
            status: 'active',
          },
        ])
        .select()
        .single();
      if (insertError) throw insertError;

      const mapped = mapRow(inserted);
      setReports((prev) => [mapped, ...prev]);
      void indexReport(mapped);
      setIsModalOpen(false);
      setNewReport({ name: '', file: null });
      setUploadProgress(100);
      showNotification('Report uploaded successfully!');
    } catch (err) {
      console.error(err);
      showNotification('Upload failed. Please try again.', 'error');
      setUploadProgress(0);
    }
  };

  const vectorizeReport = async (report) => {
    try {
      setIngesting(true);
      // Use Vite dev proxy to avoid CORS in development
      const res = await fetch('/api/vectorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: report.url, name: report.name, contentType: report.contentType }),
      });
      if (!res.ok) throw new Error('Vectorization failed');
      const data = await res.json();
      showNotification(`Vectorized (${data.vectorLength} dims)`, 'success');
    } catch (e) {
      console.error(e);
      showNotification(`Vectorization failed: ${e.message || 'unknown error'}`, 'error');
    } finally {
      setIngesting(false);
    }
  };

  const indexReport = async (report) => {
    try {
      setIngesting(true);
      const res = await fetch('/api/index-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: report.id,
          url: report.url,
          contentType: report.contentType,
          name: report.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Indexing failed');
      showNotification(`Indexed ${data.chunks} chunks`, 'success');
    } catch (e) {
      console.error(e);
      showNotification(`Indexing failed: ${e.message || 'unknown error'}`, 'error');
    } finally {
      setIngesting(false);
    }
  };

  const handleDeleteReport = async (id) => {
    const report = reports.find(r => r.id === id);
    if (!report) return;
    if (!window.confirm('Are you sure you want to delete this report?')) return;
    try {
      if (report.storagePath) {
        const { error } = await supabase.storage.from('reports').remove([report.storagePath]);
        if (error) throw error;
      }
      const { error: dbErr } = await supabase.from('reports').delete().eq('id', id);
      if (dbErr) throw dbErr;
      setReports((prev) => prev.filter((r) => r.id !== id));
      showNotification('Report deleted successfully!');
    } catch (err) {
      console.error(err);
      showNotification('Failed to delete report.', 'error');
    }
  };

  const handleViewReport = (report) => {
    if (!report.url) {
      showNotification('Preview not available for sample report', 'error');
      return;
    }
    setPreview({ url: report.url, name: report.name, type: report.contentType || '' });
  };

  const handleDownloadReport = (report) => {
    if (!report.url) {
      showNotification('Download not available for sample report', 'error');
      return;
    }
    const a = document.createElement('a');
    a.href = report.url;
    a.download = report.fileName || report.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white">
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 ${
          notification.type === 'success' ? 'bg-[#00A67E]' : 'bg-red-600'
        }`}>
          {notification.type === 'success' ? (
            <Check className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      <div className="bg-[#0a0a0a] border-b border-gray-800 px-8 py-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Reports Management</h1>
            <p className="text-gray-400 mt-1">Manage reports for AI Assistant analysis</p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-[#00A67E] text-white px-6 py-3 rounded-lg font-medium hover:bg-[#008f6b] transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Report
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-[#2a2a2a] rounded-lg p-6 border border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total Reports</p>
                <p className="text-3xl font-bold mt-2">{reports.length}</p>
              </div>
              <div className="w-12 h-12 bg-[#00A67E] bg-opacity-20 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-[#00A67E]" />
              </div>
            </div>
          </div>

          <div className="bg-[#2a2a2a] rounded-lg p-6 border border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Active Reports</p>
                <p className="text-3xl font-bold mt-2">{reports.filter(r => r.status === 'active').length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-500 bg-opacity-20 rounded-lg flex items-center justify-center">
                <Check className="w-6 h-6 text-blue-500" />
              </div>
            </div>
          </div>

          <div className="bg-[#2a2a2a] rounded-lg p-6 border border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Storage Used</p>
                <p className="text-3xl font-bold mt-2">7.3 MB</p>
              </div>
              <div className="w-12 h-12 bg-purple-500 bg-opacity-20 rounded-lg flex items-center justify-center">
                <Upload className="w-6 h-6 text-purple-500" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#2a2a2a] rounded-lg border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#0a0a0a] border-b border-gray-800">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Report Name</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">File Name</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Upload Date</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Size</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Status</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report, index) => (
                  <tr
                    key={report.id}
                    className={`border-b border-gray-800 hover:bg-[#333333] transition-colors ${
                      index === reports.length - 1 ? 'border-b-0' : ''
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#00A67E] bg-opacity-20 rounded-lg flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-[#00A67E]" />
                        </div>
                        <span className="font-medium">{report.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-400">{report.fileName}</td>
                    <td className="px-6 py-4 text-gray-400">{formatDate(report.uploadDate)}</td>
                    <td className="px-6 py-4 text-gray-400">{report.size}</td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 bg-[#00A67E] bg-opacity-20 text-[#00A67E] rounded-full text-sm font-medium">
                        {report.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleViewReport(report)} className="p-2 hover:bg-[#444444] rounded-lg transition-colors">
                          <Eye className="w-5 h-5 text-gray-400" />
                        </button>
                        <button onClick={() => handleDownloadReport(report)} className="p-2 hover:bg-[#444444] rounded-lg transition-colors">
                          <Download className="w-5 h-5 text-gray-400" />
                        </button>
                        <button
                          onClick={() => handleDeleteReport(report.id)}
                          className="p-2 hover:bg-red-500 hover:bg-opacity-20 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-5 h-5 text-red-500" />
                        </button>
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
              <p className="text-gray-400">No reports uploaded yet</p>
              <button
                onClick={() => setIsModalOpen(true)}
                className="mt-4 text-[#00A67E] hover:underline"
              >
                Upload your first report
              </button>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#2a2a2a] rounded-lg max-w-2xl w-full border border-gray-800">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-xl font-semibold">Upload New Report</h2>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setNewReport({ name: '', file: null });
                  setUploadProgress(0);
                }}
                className="p-2 hover:bg-[#444444] rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadReport} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Report Name *
                </label>
                <input
                  type="text"
                  value={newReport.name}
                  onChange={(e) => setNewReport(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Q4 2024 Revenue Report"
                  className="w-full bg-[#1a1a1a] text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#00A67E] border border-gray-700"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Report File *
                </label>
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragActive
                      ? 'border-[#00A67E] bg-[#00A67E] bg-opacity-10'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  {newReport.file ? (
                    <div className="space-y-3">
                      <div className="w-16 h-16 bg-[#00A67E] bg-opacity-20 rounded-lg flex items-center justify-center mx-auto">
                        <FileText className="w-8 h-8 text-[#00A67E]" />
                      </div>
                      <div>
                        <p className="font-medium">{newReport.file.name}</p>
                        <p className="text-sm text-gray-400 mt-1">
                          {(newReport.file.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNewReport(prev => ({ ...prev, file: null }))}
                        className="text-red-500 text-sm hover:underline"
                      >
                        Remove file
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                      <p className="text-gray-300 mb-2">
                        Drag and drop your file here, or
                      </p>
                      <label className="inline-block bg-[#00A67E] text-white px-6 py-2 rounded-lg font-medium hover:bg-[#008f6b] transition-colors cursor-pointer">
                        Browse Files
                        <input
                          type="file"
                          onChange={handleFileInputChange}
                          accept=".pdf,.txt,.docx"
                          className="hidden"
                        />
                      </label>
                      <p className="text-sm text-gray-500 mt-3">
                        Supported formats: PDF, TXT, DOCX (Max 10MB)
                      </p>
                    </>
                  )}
                </div>
              </div>

              {uploadProgress > 0 && uploadProgress < 100 && (
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-400">Uploading...</span>
                    <span className="text-[#00A67E]">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-[#1a1a1a] rounded-full h-2">
                    <div
                      className="bg-[#00A67E] h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setNewReport({ name: '', file: null });
                    setUploadProgress(0);
                  }}
                  className="flex-1 bg-[#444444] text-white px-6 py-3 rounded-lg font-medium hover:bg-[#555555] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={(uploadProgress > 0 && uploadProgress < 100) || ingesting}
                  className="flex-1 bg-[#00A67E] text-white px-6 py-3 rounded-lg font-medium hover:bg-[#008f6b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {ingesting ? 'Processing…' : 'Upload Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={() => setPreview(null)}>
          <div className="bg-[#2a2a2a] rounded-lg w-full max-w-5xl h-[80vh] border border-gray-800 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <div className="text-sm text-gray-300 truncate pr-4">{preview.name}</div>
              <button onClick={() => setPreview(null)} className="p-2 hover:bg-[#444444] rounded-lg transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="w-full h-full bg-[#1a1a1a]">
              {preview.type.includes('pdf') ? (
                <iframe title="PDF Preview" src={preview.url} className="w-full h-full" />
              ) : preview.type.includes('text') ? (
                <iframe title="Text Preview" src={preview.url} className="w-full h-full" />
              ) : preview.type.includes('wordprocessingml') ? (
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
