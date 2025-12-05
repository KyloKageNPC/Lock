import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link, useNavigate } from 'react-router-dom';

export default function Signup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [asAdmin, setAsAdmin] = useState(false);
  const [adminCode, setAdminCode] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) navigate('/');
    });
  }, [navigate]);

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    // Create profile with default role client
    const userId = data.user?.id;
    if (userId) {
      await supabase.from('profiles').upsert({ id: userId, role: 'client', display_name: displayName });
      if (asAdmin && adminCode) {
        try {
          const res = await fetch('/api/admin/promote', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ userId, code: adminCode })
          });
          const j = await res.json();
          if (!res.ok) {
            setError(j?.error || 'Admin promotion failed');
          }
        } catch (err) {
          setError('Admin promotion failed');
        }
      }
    }
    setLoading(false);
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-[#2a2a2a] border border-gray-800 rounded-xl p-6">
        <h1 className="text-2xl font-semibold mb-4">Sign Up</h1>
        {error && <div className="mb-3 text-sm text-red-400">{error}</div>}
        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Display Name</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm mb-1">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2" required />
          </div>
          <div className="flex items-center gap-2">
            <input id="asAdmin" type="checkbox" checked={asAdmin} onChange={(e) => setAsAdmin(e.target.checked)} />
            <label htmlFor="asAdmin" className="text-sm">Create as admin</label>
          </div>
          {asAdmin && (
            <div>
              <label className="block text-sm mb-1">Admin Access Code</label>
              <input type="text" value={adminCode} onChange={(e) => setAdminCode(e.target.value)} className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2" />
              <p className="text-xs text-gray-400 mt-1">Ask your team lead for the admin code.</p>
            </div>
          )}
          <button type="submit" disabled={loading} className="w-full bg-[#00A67E] text-white rounded px-4 py-2 font-medium disabled:opacity-50">{loading ? 'Creating…' : 'Create Account'}</button>
        </form>
        <p className="mt-4 text-sm text-gray-400">Already have an account? <Link to="/login" className="text-[#00A67E]">Log in</Link></p>
      </div>
    </div>
  );
}
