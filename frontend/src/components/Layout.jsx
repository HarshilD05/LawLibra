import React, { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { getSession, clearSession } from '../api/auth.js'
import { ToastContainer } from './UI.jsx'

// Derive initials from a display name
const initials = (name = '') =>
  name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')

const NAV = [
  { to: '/dashboard',     icon: 'dashboard',      label: 'Dashboard' },
  { to: '/cases',         icon: 'folder_open',     label: 'Cases' },
  { to: '/calendar',      icon: 'calendar_month',  label: 'Calendar' },
  { to: '/ai',            icon: 'auto_awesome',    label: 'AI Counsel' },
  { to: '/notifications', icon: 'notifications',   label: 'Notifications' },
]

const BOTTOM = [
  { to: '/users',    icon: 'gavel',          label: 'Admin Panel',  adminOnly: true },
  { to: '/settings', icon: 'manage_accounts', label: 'Settings' },
]

const TYPE_ICON  = { hearing: 'gavel', document: 'description', case: 'folder_open', ai: 'auto_awesome' }
const TYPE_COLOR = { hearing: 'bg-amber-100 text-amber-600', document: 'bg-blue-100 text-blue-600', case: 'bg-slate-100 text-slate-600', ai: 'bg-purple-100 text-purple-600' }

export default function Layout() {
  const navigate = useNavigate()
  const session = getSession() || {}
  const user = { name: session.name, email: session.email, role: session.role }
  const isAdmin = user.role === 'ADMIN'
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const notifRef = useRef(null)
  const profileRef = useRef(null)


  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const logout = () => {
    clearSession()
    navigate('/login')
  }

  const markAllRead = () => {
    // Placeholder — will call notifications API when Notifications page is wired
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background font-body">
      <ToastContainer />

      {/* ─── Sidebar ─── */}
      <aside className="w-56 flex-shrink-0 bg-[#0D1F3C] flex flex-col py-6 px-4 shadow-2xl z-50">
        {/* Logo */}
        <div className="mb-8 px-2 flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-400/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-amber-400 text-[20px]" style={{fontVariationSettings:"'FILL' 1"}}>balance</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-white font-headline leading-tight">LawLibra</h1>
            <p className="text-[9px] uppercase tracking-widest text-slate-500">Sovereign Counsel</p>
          </div>
        </div>

        {/* Main Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[0.8125rem] transition-all duration-150 ${
                  isActive ? 'bg-white/10 text-white font-semibold' : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className="material-symbols-outlined text-[20px]" style={isActive ? {fontVariationSettings:"'FILL' 1"} : {}}>
                    {item.icon}
                  </span>
                  <span className="flex-1">{item.label}</span>
                  {item.to === '/notifications' && unread > 0 && (
                    <span className="bg-red-500 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div className="pt-3 mt-3 border-t border-white/10 space-y-0.5">
          {BOTTOM.filter(b => !b.adminOnly || isAdmin).map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[0.8125rem] transition-all duration-150 ${
                  isActive ? 'bg-white/10 text-white font-semibold' : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className="material-symbols-outlined text-[20px]" style={isActive ? {fontVariationSettings:"'FILL' 1"} : {}}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[0.8125rem] text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all text-left"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            <span>Logout</span>
          </button>
        </div>

        {/* User Card */}
        <div className="mt-4 px-2 py-3 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-400/20 border border-amber-400/30 flex items-center justify-center flex-shrink-0">
              <span className="text-amber-400 font-bold text-xs">{initials(user.name)}</span>
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-semibold truncate">{user.name || 'User'}</p>
              <p className="text-slate-500 text-[10px] truncate">{user.role || 'LAWYER'}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ─── Main Area ─── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Nav */}
        <header className="h-16 flex-shrink-0 bg-white/80 backdrop-blur-xl flex items-center justify-between px-8 shadow-sm z-40 border-b border-outline-variant/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-500 text-[18px]" style={{fontVariationSettings:"'FILL' 1"}}>balance</span>
            <span className="font-headline font-bold text-slate-700 text-sm tracking-wide">LawLibra</span>
          </div>

          <div className="flex items-center gap-6">
            {/* Notifications — navigate to full page */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => navigate('/notifications')}
                className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors relative"
              >
                <span className="material-symbols-outlined text-[22px] text-slate-500">notifications</span>
              </button>
            </div>

            <div className="h-8 w-[1px] bg-outline-variant/30" />

            {/* Profile */}
            <div className="relative" ref={profileRef}>
              <div
                className="flex items-center gap-3 cursor-pointer group"
                onClick={() => { setProfileOpen(o => !o); setNotifOpen(false) }}
              >
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900 font-headline leading-none">{user.name?.split(',')[0] || 'Counselor'}</p>
                  <p className="text-[11px] text-slate-500 font-medium">{user.role || 'LAWYER'}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-[#101c2e] border-2 border-amber-400/40 flex items-center justify-center text-amber-400 font-bold text-sm">
                  {initials(user.name)}
                </div>
              </div>

              {profileOpen && (
                <div className="absolute right-0 top-12 w-64 bg-white rounded-xl shadow-2xl border border-slate-100 z-[9000] overflow-hidden">
                  <div className="px-4 py-4 ai-gradient">
                    <div className="w-10 h-10 rounded-full bg-amber-400/20 border-2 border-amber-400/40 flex items-center justify-center mb-2">
                      <span className="text-amber-400 font-bold text-sm">{initials(user.name)}</span>
                    </div>
                    <p className="text-white font-semibold text-sm">{user.name || 'User'}</p>
                    <p className="text-slate-400 text-xs">{user.email || '—'}</p>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${isAdmin ? 'bg-amber-400/20 text-amber-400' : 'bg-blue-400/20 text-blue-300'}`}>
                      {user.role || 'LAWYER'}
                    </span>
                  </div>
                  <div className="py-1">
                    <button onClick={() => { navigate('/settings'); setProfileOpen(false) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 text-left">
                      <span className="material-symbols-outlined text-[18px] text-slate-400">manage_accounts</span>Profile &amp; Settings
                    </button>
                    {isAdmin && (
                      <button onClick={() => { navigate('/users'); setProfileOpen(false) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 text-left">
                        <span className="material-symbols-outlined text-[18px] text-slate-400">gavel</span>Admin Panel
                      </button>
                    )}
                    <div className="border-t border-slate-100 mt-1 pt-1">
                      <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 text-left">
                        <span className="material-symbols-outlined text-[18px]">logout</span>Sign Out
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-background">
          <Outlet />
        </main>
      </div>

    </div>
  )
}
