import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSession } from '../api/auth.js'
import * as casesApi from '../api/cases.js'
import { StatusBadge, Modal, Field, Input, Select, Textarea, Btn, toast } from '../components/UI.jsx'

const fmtDate = (d) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return String(d) }
}

const CASE_TYPES = ['Contract Dispute', 'Criminal Defense', 'Intellectual Property', 'Corporate', 'Tax Law', 'Probate & Estates', 'Civil Litigation']

const BLANK_FORM = { title: '', clientName: '', type: 'Contract Dispute', courtName: '', caseNumber: '', description: '' }

export default function Dashboard() {
  const navigate = useNavigate()
  const session = getSession() || {}
  const user = { name: session.name, email: session.email, role: session.role }

  const [cases, setCases] = useState([])
  const [loadingCases, setLoadingCases] = useState(true)
  const [showNewCase, setShowNewCase] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(BLANK_FORM)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await casesApi.getCases({ limit: 5 })
        // Backend returns { data: [...], total, limit, offset }
        setCases((Array.isArray(data) ? data : (data.data ?? [])).slice(0, 5))
      } catch (err) {
        toast.error(err.message || 'Failed to load cases.')
      } finally {
        setLoadingCases(false)
      }
    }
    load()
  }, [])

  // Stats derived from loaded cases (notifications/docs not yet available via API)
  const openCases = cases.filter(c => c.status === 'OPEN').length

  // Upcoming hearings from the loaded cases (next 7 days)
  // NOTE: Calendar events will come from the events/calendar API in the Calendar page
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const in7Str = new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0]

  const hour = today.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const createCase = async () => {
    if (!form.title || !form.clientName) { toast.warning('Title and client name are required.'); return }
    setCreating(true)
    try {
      const res = await casesApi.createCase({
        ...form,
        caseNumber: form.caseNumber || 'LL-' + Date.now().toString(36).toUpperCase(),
        status: 'OPEN',
        priority: 'MEDIUM',
      })
      // Backend returns { case: {...} }
      const newCase = res.case ?? res
      setCases(prev => [newCase, ...prev].slice(0, 5))
      toast.success('Case created successfully!')
      setShowNewCase(false)
      setForm(BLANK_FORM)
    } catch (err) {
      toast.error(err.message || 'Failed to create case.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="p-6 min-h-screen">

      {/* Welcome */}
      <header className="mb-8">
        <h2 className="font-headline font-extrabold tracking-tight text-primary-container mb-2" style={{ fontSize: '1.5rem', lineHeight: '2rem' }}>
          {greeting}, {user.name?.split(' ')[0] || 'Counselor'}.
        </h2>
        <p className="text-on-surface-variant font-medium">
          You have {openCases} open case{openCases !== 1 ? 's' : ''}.
        </p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
        {[
          { label: 'Total Cases', value: cases.length, icon: 'folder', color: 'text-primary-container', bg: 'bg-primary-container/5', extra: <span className="text-xs font-bold text-secondary flex items-center gap-1">Total <span className="material-symbols-outlined text-sm">inventory_2</span></span> },
          { label: 'Open Cases',  value: openCases,    icon: 'gavel',   color: 'text-primary-container', bg: 'bg-secondary-container/20', filled: true, extra: <span className="text-xs font-bold text-on-surface-variant">Active</span> },
          { label: 'My Role',     value: user.role || '—', icon: 'verified_user', color: 'text-primary-container', bg: 'bg-tertiary-fixed-dim/20', extra: <span className="text-xs font-bold text-on-surface-variant">Access Level</span> },
        ].map(s => (
          <div key={s.label} className="bg-surface-container-lowest p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-lg ${s.bg} text-primary-container`}>
                <span className="material-symbols-outlined" style={s.filled ? { fontVariationSettings: "'FILL' 1" } : {}}>{s.icon}</span>
              </div>
              {s.extra || null}
            </div>
            <h3 className="text-on-surface-variant text-xs font-bold uppercase tracking-wider mb-1">{s.label}</h3>
            <p className={`font-black font-headline ${s.color}`} style={{ fontSize: '1.6rem' }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Cases Table */}
      <section className="flex-grow">
        <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
          <div className="px-8 py-6 flex items-center justify-between bg-surface-container-low/50">
            <h3 className="font-headline text-xl font-bold text-primary-container">My Cases</h3>
            <div className="flex gap-2">
              <button onClick={() => navigate('/cases')} className="px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors">View All</button>
              <button onClick={() => setShowNewCase(true)} className="ai-gradient px-4 py-2 text-sm font-bold text-white rounded-lg flex items-center gap-2 hover:opacity-90 transition-opacity">
                <span className="material-symbols-outlined text-sm">add</span> New Case
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            {loadingCases ? (
              <div className="py-12 text-center">
                <svg className="animate-spin h-6 w-6 text-secondary mx-auto mb-2" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                <p className="text-sm text-on-surface-variant">Loading cases…</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-surface-container-high">
                    {['Title', 'Client', 'Status', 'Next Hearing', ''].map(h => (
                      <th key={h} className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-low">
                  {cases.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-on-surface-variant text-sm">No cases yet. Click "New Case" to get started.</td></tr>
                  ) : cases.map(c => (
                    <tr key={c.id} className="hover:bg-surface-container-low transition-colors group cursor-pointer" onClick={() => navigate(`/cases/${c.id}`)}>
                      <td className="px-6 py-5">
                        <div className="font-bold text-primary-container text-sm">{c.title}</div>
                        <div className="text-xs text-on-surface-variant">{c.caseNumber}</div>
                      </td>
                      <td className="px-6 py-5 text-sm font-medium">{c.clientName}</td>
                      <td className="px-6 py-5"><StatusBadge status={c.status} /></td>
                      <td className="px-6 py-5 text-sm">{c.nextHearing ? fmtDate(c.nextHearing) : <span className="text-slate-400">—</span>}</td>
                      <td className="px-6 py-5 text-right">
                        <button className="p-2 text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => { e.stopPropagation(); navigate(`/cases/${c.id}`) }}>
                          <span className="material-symbols-outlined text-sm">open_in_new</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="px-8 py-4 bg-surface-container-low/30 flex justify-center">
            <button onClick={() => navigate('/cases')} className="text-xs font-bold text-on-primary-fixed-variant hover:text-primary-container transition-colors">
              VIEW ALL CASES →
            </button>
          </div>
        </div>
      </section>

      {/* New Case Modal */}
      <Modal open={showNewCase} onClose={() => setShowNewCase(false)} title="Create New Case" subtitle="Fill in the case details">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Field label="Case Title"><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Smith vs. Acme Corp" /></Field></div>
            <Field label="Client Name"><Input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} placeholder="Client name" /></Field>
            <Field label="Case Type"><Select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>{CASE_TYPES.map(t => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Court Name"><Input value={form.courtName} onChange={e => setForm(f => ({ ...f, courtName: e.target.value }))} placeholder="e.g. US District Court" /></Field>
            <Field label="Case Number"><Input value={form.caseNumber} onChange={e => setForm(f => ({ ...f, caseNumber: e.target.value }))} placeholder="e.g. CV-2025-001" /></Field>
            <div className="col-span-2"><Field label="Description"><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Brief case description…" /></Field></div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" onClick={() => setShowNewCase(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={createCase} disabled={creating}>{creating ? 'Creating…' : 'Create Case'}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  )
}
