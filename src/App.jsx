import React from 'react'
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import ChatInterface from './components/ChatInterface.jsx'
import AdminReportsPage from './components/AdminReportsPage.jsx'
import UserReportsPage from './components/UserReportsPage.jsx'
import Breadcrumbs from './components/Breadcrumbs.jsx'
import Login from './components/Login.jsx'
import Signup from './components/Signup.jsx'

function AuthRoute({ children, isAuthed }) {
  return isAuthed ? children : <Navigate to="/login" replace />
}

function AdminRoute({ children, role }) {
  return role === 'admin' ? children : <Navigate to="/" replace />
}

export default function App() {
  const linkBase = 'px-4 py-2 rounded-md text-sm font-medium transition-colors';
  const navigate = useNavigate()

  const [isAuthed, setIsAuthed] = React.useState(() => {
    return localStorage.getItem('simAuthed') === 'true'
  })
  const [role, setRole] = React.useState(() => {
    return localStorage.getItem('simRole') || null
  })

  const signOut = () => {
    localStorage.removeItem('simAuthed')
    localStorage.removeItem('simRole')
    setIsAuthed(false)
    setRole(null)
    navigate('/login')
  }
  return (
    <>
      <div className="bg-[#0a0a0a] border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="text-white font-semibold">ChatPro</div>
        <nav className="flex gap-2 items-center">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `${linkBase} ${isActive ? 'bg-[#00A67E] text-white' : 'text-gray-300 hover:bg-[#2a2a2a]'}`
            }
          >
            Chat
          </NavLink>
          <NavLink
            to="/reports"
            className={({ isActive }) =>
              `${linkBase} ${isActive ? 'bg-[#00A67E] text-white' : 'text-gray-300 hover:bg-[#2a2a2a]'}`
            }
          >
            Reports
          </NavLink>
          {role === 'admin' && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? 'bg-[#00A67E] text-white' : 'text-gray-300 hover:bg-[#2a2a2a]'}`
              }
            >
              Admin
            </NavLink>
          )}
          {isAuthed ? (
            <>
              <span className="ml-2 text-xs text-gray-400">Role: {role || 'none'}</span>
              <button onClick={signOut} className="ml-2 px-3 py-2 text-sm text-gray-300 hover:bg-[#2a2a2a] rounded-md">Sign Out</button>
            </>
          ) : (
            <NavLink
              to="/login"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? 'bg-[#00A67E] text-white' : 'text-gray-300 hover:bg-[#2a2a2a]'}`
              }
            >
              Simulate Login
            </NavLink>
          )}
        </nav>
      </div>
      <Breadcrumbs />
      <Routes>
        <Route path="/login" element={<Login onSimLogin={(r) => { localStorage.setItem('simAuthed','true'); localStorage.setItem('simRole', r); setIsAuthed(true); setRole(r); navigate(r==='admin' ? '/admin' : '/'); }} />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/" element={<AuthRoute isAuthed={isAuthed}><ChatInterface /></AuthRoute>} />
        <Route path="/chat/:reportId" element={<AuthRoute isAuthed={isAuthed}><ChatInterface /></AuthRoute>} />
        <Route path="/reports" element={<AuthRoute isAuthed={isAuthed}><UserReportsPage /></AuthRoute>} />
        <Route path="/admin" element={<AdminRoute role={role}><AdminReportsPage /></AdminRoute>} />
      </Routes>
    </>
  )
}