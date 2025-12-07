import React, { useState, useRef, useEffect } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { Send, Bot, User, MessageSquare, Trash2, X, FileText, Pencil, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ChartMessage from './ChartMessage';

export default function ChatInterface() {
  const { reportId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [resolvedReportName, setResolvedReportName] = useState(location.state?.reportName || null);
  const [reportDetails, setReportDetails] = useState(null); // { url, contentType, fileName }
  const [threads, setThreads] = useState([]); // [{id, title, createdAt, messages}]
  const [currentThreadId, setCurrentThreadId] = useState(null);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [availableReports, setAvailableReports] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [clientId, setClientId] = useState(null);
  const [renamingThreadId, setRenamingThreadId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [figures, setFigures] = useState([]);

  // Load report name if landing directly via URL
  useEffect(() => {
    const loadDetails = async () => {
      if (!reportId) return;
      try {
        const { data, error } = await supabase
          .from('reports')
          .select('name,url,content_type,file_name')
          .eq('id', reportId)
          .maybeSingle();
        if (error) throw error;
        if (data?.name && !resolvedReportName) setResolvedReportName(data.name);
        if (data) setReportDetails({
          url: data.url || null,
          contentType: data.content_type || null,
          fileName: data.file_name || null,
        });
      } catch (e) {
        console.error('Failed to load report details', e);
      }
    };
    loadDetails();
    // Load figures list (skip until reportId is known to avoid bad UUID)
    const loadFigures = async () => {
      if (!reportId) return;
      try {
        const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}/figures`);
        const j = await res.json();
        if (res.ok && Array.isArray(j.figures)) setFigures(j.figures);
        else setFigures([]);
      } catch {
        setFigures([]);
      }
    };
    loadFigures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  // Load threads for this reportId and migrate old single-session storage if present
  useEffect(() => {
    if (!reportId) return;
    // ensure clientId
    try {
      let cid = localStorage.getItem('chat_client_id');
      if (!cid) { cid = String(crypto?.randomUUID?.() || Date.now()); localStorage.setItem('chat_client_id', cid); }
      setClientId(cid);
    } catch { setClientId('local-'+Date.now()); }

    const key = `chat_threads_${reportId}`;
    let loaded = [];
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        loaded = Array.isArray(parsed) ? parsed.map(t => ({
          ...t,
          createdAt: t.createdAt || new Date().toISOString(),
          messages: Array.isArray(t.messages) ? t.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) })) : [],
        })) : [];
      }
    } catch {}

    // Migrate old storage if no threads
    if (!loaded.length) {
      try {
        const legacyRaw = localStorage.getItem(`chat_report_${reportId}`);
        if (legacyRaw) {
          const legacyMessages = JSON.parse(legacyRaw);
          const revived = Array.isArray(legacyMessages)
            ? legacyMessages.map(m => ({ ...m, timestamp: new Date(m.timestamp) }))
            : [];
          if (revived.length) {
            loaded = [{
              id: String(Date.now()),
              title: 'Imported chat',
              createdAt: new Date().toISOString(),
              messages: revived,
            }];
            try { localStorage.removeItem(`chat_report_${reportId}`); } catch {}
          }
        }
      } catch {}
    }

    // If still empty, create a default thread
    if (!loaded.length) {
      loaded = [{
        id: String(Date.now()),
        title: 'New Chat',
        createdAt: new Date().toISOString(),
        messages: [{
          id: 1,
          type: 'assistant',
          content: `Started a new chat for ${resolvedReportName || ('Report #' + reportId)}. Ask away!`,
          timestamp: new Date(),
        }],
      }];
    }

    setThreads(loaded);
    setCurrentThreadId(loaded[0].id);
    setMessages(loaded[0].messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'assistant',
      content: "Hi there! I'm your friendly AI companion. I can help explore and explain this report, highlight key points, and suggest questions to dig deeper. What would you like to know?",
      timestamp: new Date()
    }
  ]);

  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const saveThreads = (nextThreads) => {
    const key = `chat_threads_${reportId}`;
    try {
      const serializable = nextThreads.map(t => ({
        ...t,
        messages: t.messages.map(m => ({ ...m, timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp })),
      }));
      localStorage.setItem(key, JSON.stringify(serializable));
    } catch {}
  };

  const openNewChatModal = async () => {
    setShowNewChatModal(true);
    setModalLoading(true);
    try {
      const { data, error } = await supabase
        .from('reports')
        .select('id,name,file_name,content_type,created_at,url,status')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAvailableReports((data || []).map((r) => ({
        id: r.id,
        name: r.name,
        fileName: r.file_name,
        contentType: r.content_type,
        url: r.url,
        createdAt: r.created_at,
      })));
    } catch (e) {
      console.error('Failed to load reports for modal', e);
      setAvailableReports([]);
    } finally {
      setModalLoading(false);
    }
  };

  const closeNewChatModal = () => setShowNewChatModal(false);

  const startChatForReport = (rep) => {
    setShowNewChatModal(false);
    navigate(`/chat/${rep.id}`, { state: { reportName: rep.name } });
  };

  // Server sync helpers
  const loadServerThreads = async () => {
    if (!reportId || !clientId) return;
    try {
      const res = await fetch(`/api/chats?reportId=${encodeURIComponent(reportId)}&clientId=${encodeURIComponent(clientId)}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.threads)) {
        // Merge with local threads by id; prefer server titles and created_at
        const serverThreads = data.threads.map(t => ({
          id: String(t.id),
          title: t.title || 'Chat',
          createdAt: t.created_at || new Date().toISOString(),
          messages: [],
        }));
        let next = threads;
        const existingIds = new Set(next.map(x => x.id));
        for (const st of serverThreads) {
          if (!existingIds.has(st.id)) next = [st, ...next];
        }
        setThreads(next);
        if (!currentThreadId && next.length) {
          setCurrentThreadId(next[0].id);
        }
        saveThreads(next);
      }
    } catch (e) {
      console.error('Failed to load server threads', e);
    }
  };

  useEffect(() => { loadServerThreads(); }, [reportId, clientId]);

  const createServerThread = async () => {
    if (!reportId || !clientId) return null;
    try {
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, clientId, title: 'New Chat' }),
      });
      const data = await res.json();
      if (res.ok && data.thread?.id) {
        return String(data.thread.id);
      }
    } catch (e) {
      console.error('Failed to create server thread', e);
    }
    return null;
  };

  const saveServerMessage = async (threadId, message) => {
    try {
      await fetch(`/api/chats/${encodeURIComponent(threadId)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Map chart -> assistant for DB constraint, keep content JSON
          type: (message.type === 'chart' ? 'assistant' : message.type),
          content: message.content,
          timestamp: message.timestamp.toISOString()
        }),
      });
    } catch (e) {
      console.error('Failed to save server message', e);
    }
  };

  const loadServerMessages = async (threadId) => {
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(threadId)}/messages`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.messages)) {
        // Attempt to auto-detect chart payloads saved as assistant text
        return data.messages.map((m) => {
          let type = m.type;
          let content = m.content;
          if (typeof content === 'string') {
            try {
              const parsed = JSON.parse(content);
              if (parsed && parsed.kind && parsed.data && parsed.data.datasets) {
                type = 'chart';
                content = parsed;
              }
            } catch {}
          }
          return { ...m, type, content };
        });
      }
    } catch (e) {
      console.error('Failed to load server messages', e);
    }
    return [];
  };

  const saveServerThreadTitle = async (threadId, title) => {
    try {
      await fetch(`/api/chats/${encodeURIComponent(threadId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
    } catch (e) {
      console.error('Failed to update thread title', e);
    }
  };

  const selectThread = (id) => {
    const t = threads.find(x => x.id === id);
    if (!t) return;
    setCurrentThreadId(id);
    setMessages(t.messages);
    if (!t.messages || !t.messages.length) {
      loadServerMessages(id).then(serverMessages => {
        if (serverMessages && serverMessages.length) {
          const revived = serverMessages.map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
          setMessages(revived);
          const nextThreads = threads.map(th => th.id === id ? { ...th, messages: revived } : th);
          setThreads(nextThreads);
          saveThreads(nextThreads);
        }
      }).catch(() => {});
    }
  };

  const createThread = async () => {
    if (!reportId) return;
    const serverId = await createServerThread();
    const id = serverId || String(Date.now());
    const newThread = {
      id,
      title: 'New Chat',
      createdAt: new Date().toISOString(),
      messages: [{
        id: 1,
        type: 'assistant',
        content: `Started a new chat for ${resolvedReportName || ('Report #' + reportId)}. Ask away!`,
        timestamp: new Date(),
      }],
    };
    const nextThreads = [newThread, ...threads];
    setThreads(nextThreads);
    setCurrentThreadId(id);
    setMessages(newThread.messages);
    saveThreads(nextThreads);
    // save initial assistant message
    if (serverId) await saveServerMessage(serverId, newThread.messages[0]);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const userMessage = {
      id: messages.length + 1,
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => {
      const next = [...prev, userMessage];
      // persist to current thread
      if (currentThreadId) {
        const nextThreads = threads.map(t => t.id === currentThreadId ? { ...t, messages: next } : t);
        setThreads(nextThreads);
        saveThreads(nextThreads);
      }
      // save to server
      if (currentThreadId) saveServerMessage(currentThreadId, userMessage);
      return next;
    });
    setInputMessage('');
    setIsTyping(true);

    try {
      let answerText = "I'm missing the report context.";
      let assistantMessage = null;
      if (reportDetails?.url) {
        const res = await fetch('/api/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: reportDetails.url,
            contentType: reportDetails.contentType,
            question: inputMessage,
            name: resolvedReportName,
            reportId,
          }),
        });
        const data = await res.json();
            if (res.ok && data?.type === 'chart' && data?.payload) {
              const payload = data.payload;
              assistantMessage = {
                id: messages.length + 2,
                type: 'chart',
                content: payload,
                timestamp: new Date()
              };
              try {
                const localKey = makeLocalChartKey(currentThreadId, assistantMessage.id);
                localStorage.setItem(localKey, JSON.stringify(payload));
                assistantMessage.localChartKey = localKey;
              } catch {}
            } else {
              answerText = data?.answer ? data.answer : (data?.error ? `Error: ${data.error}` : answerText);
            }
      }
      if (!assistantMessage) {
        // build a normal assistant message, with naive client-side chart detection fallback
        assistantMessage = {
          id: messages.length + 2,
          type: 'assistant',
          content: answerText,
          timestamp: new Date()
        };
        try {
          const trimmed = String(answerText || '').trim();
          if (trimmed.startsWith('{') && trimmed.includes('"kind"') && trimmed.includes('datasets')) {
            const parsed = JSON.parse(trimmed);
            if (parsed && parsed.kind && parsed.data) {
              assistantMessage = { id: assistantMessage.id, type: 'chart', content: parsed, timestamp: assistantMessage.timestamp };
              try {
                const localKey = makeLocalChartKey(currentThreadId, assistantMessage.id);
                localStorage.setItem(localKey, JSON.stringify(parsed));
                assistantMessage.localChartKey = localKey;
              } catch {}
            }
          }
        } catch {}
      }
      setMessages(prev => {
        const next = [...prev, assistantMessage];
        if (currentThreadId) {
          const nextThreads = threads.map(t => t.id === currentThreadId ? { ...t, messages: next } : t);
          setThreads(nextThreads);
          saveThreads(nextThreads);
        }
        if (currentThreadId) saveServerMessage(currentThreadId, assistantMessage);
        return next;
      });
    } catch (err) {
      let assistantMessage = {
        id: messages.length + 2,
        type: 'assistant',
        content: 'Hmm, I couldn’t fetch an answer just now. Mind trying again in a moment, or ask a simpler follow-up?',
        timestamp: new Date()
      };
      setMessages(prev => {
        const next = [...prev, assistantMessage];
        if (currentThreadId) {
          const nextThreads = threads.map(t => t.id === currentThreadId ? { ...t, messages: next } : t);
          setThreads(nextThreads);
          saveThreads(nextThreads);
        }
        if (currentThreadId) saveServerMessage(currentThreadId, assistantMessage);
        return next;
      });
    } finally {
      setIsTyping(false);
    }
  };

  function makeLocalChartKey(threadId, messageId) {
    return `chart_payload_${reportId || 'global'}_${threadId || 't'}_${messageId || 'm'}`;
  }

  function buildChartLink(message) {
    const key = message.localChartKey || makeLocalChartKey(currentThreadId, message.id);
    return `/chart/local?key=${encodeURIComponent(key)}`;
  }

  function truncate(str, n) {
    try {
      const s = String(str || '');
      return s.length > n ? s.slice(0, n - 1) + '…' : s;
    } catch {
      return str;
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#1a1a1a] text-white">
      <div className="bg-[#0a0a0a] border-b border-gray-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#00A67E] flex items-center justify-center">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold">
                {reportId ? `AI Chat — ${resolvedReportName || 'Report #' + reportId}` : 'AI Assistant'}
              </h1>
              {reportId && (
                <Link to="/reports" className="text-sm text-[#00A67E] hover:underline">Back to Reports</Link>
              )}
              <button onClick={openNewChatModal} className="text-sm text-[#00A67E] hover:underline">New Chat</button>
            </div>
            <p className="text-sm text-gray-400">
              {reportId ? 'This chat is scoped to the selected report' : 'Powered by OpenAI'}
            </p>
          </div>
        </div>
        {reportId && reportDetails && (
          <div className="mt-3 px-6">
            <div className="flex items-center justify-between bg-[#121212] border border-gray-800 rounded-lg p-3">
              <div className="text-sm text-gray-300">
                <span className="font-medium">Report:</span> {resolvedReportName || reportDetails.fileName || `#${reportId}`}
                {reportDetails.fileName && (
                  <span className="text-gray-500"> — {reportDetails.fileName}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {reportDetails.url && (
                  <a href={reportDetails.url} target="_blank" rel="noreferrer" className="text-sm text-[#00A67E] hover:underline">View</a>
                )}
                <button
                  onClick={openNewChatModal}
                  className="text-sm text-gray-300 hover:text-white"
                >
                  New Chat
                </button>
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-400">
              {figures?.length ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span>{figures.length} figure{figures.length>1?'s':''} available:</span>
                  {figures.slice(0,6).map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        const cap = f.caption ? `: ${f.caption}` : '';
                        const prompt = `Show me Figure ${f.figure_num}${cap}.`;
                        setInputMessage(prompt);
                        // Focus the input so pressing Enter will submit immediately
                        try { inputRef.current?.focus(); } catch {}
                      }}
                      className="px-2 py-1 rounded bg-[#1f1f1f] border border-gray-800 hover:border-[#00A67E] hover:text-[#00A67E] transition-colors flex items-center gap-1"
                      title={f.caption ? f.caption : `Figure ${f.figure_num}`}
                    >
                      <Plus className="w-3 h-3 opacity-70" />
                      {`Figure ${f.figure_num}${f.caption ? ': ' + truncate(f.caption, 24) : ''}`}
                    </button>
                  ))}
                  {figures.length>6 && <span className="opacity-70">+{figures.length-6} more</span>}
                </div>
              ) : (
                <span>No figures found for this report.</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex">
        {reportId && (
          <aside className="hidden md:block w-64 bg-[#0a0a0a] border-r border-gray-800 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-400">Previous Chats</span>
              <button onClick={openNewChatModal} className="text-xs text-[#00A67E] hover:underline">New</button>
            </div>
            <div className="space-y-2">
              {threads.map((t) => (
                <div key={t.id} className={`group px-3 py-2 rounded-lg border ${currentThreadId === t.id ? 'border-[#00A67E] bg-[#1a1a1a]' : 'border-gray-800 bg-[#121212]'} hover:bg-[#1a1a1a]`}>
                  <div className="flex items-center justify-between">
                    <button onClick={() => selectThread(t.id)} className="flex items-center gap-2 text-left flex-1">
                      <MessageSquare className="w-4 h-4 text-gray-400" />
                      <div className="truncate">
                        {renamingThreadId === t.id ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => {
                              setRenamingThreadId(null);
                              if (renameValue.trim()) {
                                const nextThreads = threads.map(th => th.id === t.id ? { ...th, title: renameValue.trim() } : th);
                                setThreads(nextThreads);
                                saveThreads(nextThreads);
                                saveServerThreadTitle(t.id, renameValue.trim());
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur();
                              if (e.key === 'Escape') { setRenamingThreadId(null); setRenameValue(''); }
                            }}
                            className="bg-[#0a0a0a] border border-gray-700 rounded px-2 py-1 text-sm w-full"
                          />
                        ) : (
                          <div className="text-sm">{t.title || 'Chat'}</div>
                        )}
                        <div className="text-xs text-gray-500 truncate">
                          {(t.messages && t.messages.length) ? (
                            typeof t.messages[t.messages.length - 1].content === 'string'
                              ? t.messages[t.messages.length - 1].content.slice(0, 40)
                              : '[Chart]'
                          ) : new Date(t.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setRenamingThreadId(t.id); setRenameValue(t.title || ''); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#2a2a2a]"
                        title="Rename"
                      >
                        <Pencil className="w-4 h-4 text-gray-500" />
                      </button>
                      <button onClick={() => deleteThread(t.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#2a2a2a]" title="Delete">
                        <Trash2 className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}

        <div className="flex flex-col flex-1">
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-4 ${
                  message.type === 'user' ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    message.type === 'assistant' ? 'bg-[#00A67E]' : 'bg-gray-700'
                  }`}
                >
                  {message.type === 'assistant' ? (
                    <Bot className="w-5 h-5 text-white" />
                  ) : (
                    <User className="w-5 h-5 text-white" />
                  )}
                </div>

                <div className={`max-w-[70%] rounded-2xl px-4 py-3 ${message.type === 'assistant' ? 'bg-[#2a2a2a] text-white' : 'bg-[#00A67E] text-white'}`}>
                  {message.type === 'chart' ? (
                    <>
                      <ChartMessage payload={message.content} />
                      <div className="mt-2 text-xs">
                        <a href={buildChartLink(message)} target="_blank" rel="noreferrer" className="text-[#00A67E] hover:underline">Open chart in new tab</a>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {message.content}
                    </p>
                  )}
                  <span className="text-xs opacity-60 mt-2 block">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-[#00A67E] flex items-center justify-center flex-shrink-0">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div className="bg-[#2a2a2a] rounded-2xl px-4 py-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="bg-[#0a0a0a] border-t border-gray-800 px-6 py-4">
            <form onSubmit={handleSendMessage} className="flex gap-3">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Type your message..."
                ref={inputRef}
                className="flex-1 bg-[#2a2a2a] text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#00A67E] placeholder-gray-500"
              />
              <button
                type="submit"
                disabled={!inputMessage.trim() || isTyping}
                className="bg-[#00A67E] text-white rounded-lg px-6 py-3 font-medium hover:bg-[#008f6b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Send className="w-5 h-5" />
                Send
              </button>
            </form>
            <p className="text-xs text-gray-500 mt-3 text-center">
              AI Assistant can make mistakes. Check important info.
            </p>
          </div>
        </div>
      </div>

      {showNewChatModal && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-60 flex items-center justify-center p-4" onClick={closeNewChatModal}>
          <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <div className="text-sm text-gray-300">Start a new chat about a report</div>
              <button onClick={closeNewChatModal} className="p-2 rounded hover:bg-[#2a2a2a]"><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {modalLoading ? (
                <div className="text-gray-400 text-sm">Loading reports…</div>
              ) : availableReports.length ? (
                <div className="space-y-2">
                  {availableReports.map((r) => (
                    <div key={r.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-800 hover:bg-[#121212]">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-[#00A67E] bg-opacity-20 rounded flex items-center justify-center">
                          <FileText className="w-4 h-4 text-[#00A67E]" />
                        </div>
                        <div className="truncate">
                          <div className="text-sm">{r.name}</div>
                          <div className="text-xs text-gray-500 truncate">{r.fileName}</div>
                        </div>
                      </div>
                      <button onClick={() => startChatForReport(r)} className="text-xs px-3 py-1 bg-[#00A67E] text-white rounded hover:bg-[#008f6b]">Chat</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-400 text-sm">No reports available</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}