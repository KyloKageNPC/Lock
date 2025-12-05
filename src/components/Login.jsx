import React from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function Login({ onSimLogin }) {
  const navigate = useNavigate();

  const simulate = (role) => {
    if (onSimLogin) onSimLogin(role);
    else {
      localStorage.setItem('simAuthed', 'true');
      localStorage.setItem('simRole', role);
      navigate(role === 'admin' ? '/admin' : '/');
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-[#2a2a2a] border border-gray-800 rounded-xl p-6">
        <h1 className="text-2xl font-semibold mb-4">Simulated Login</h1>
        <p className="text-sm text-gray-400 mb-4">Authentication is disabled. Choose a role to enter.</p>
        <div className="space-y-3">
          <button onClick={() => simulate('user')} className="w-full bg-[#00A67E] text-white rounded px-4 py-2 font-medium">Enter as User</button>
          <button onClick={() => simulate('admin')} className="w-full bg-[#0a0a0a] text-white rounded px-4 py-2 border border-gray-700">Enter as Admin</button>
        </div>
        <p className="mt-4 text-sm text-gray-400">Want to explore sign up? <Link to="/signup" className="text-[#00A67E]">Go to Signup (mock)</Link></p>
      </div>
    </div>
  );
}
