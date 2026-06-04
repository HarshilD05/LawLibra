import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as casesApi from '../api/cases.js'
import { getSession } from '../api/auth.js'
import { StatusBadge, Modal, Field, Input, Select, Textarea, Btn, ConfirmModal, toast } from '../components/UI.jsx'

// Pure utility — no store dependency
const fmtDate = (d) => {
  if (!d) return null
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return String(d) }
}

const CASE_TYPES = ['Contract Dispute', 'Criminal Defense', 'Intellectual Property', 'Corporate', 'Tax Law', 'Probate & Estates', 'Civil Litigation']
const FILTERS = ['ALL', 'OPEN', 'CLOSED', 'ARCHIVED']
const BLANK_FORM = { title: '', clientName: '', type: 'Contract Dispute', courtName: '', caseNumber: '', description: '' }

export default function CaseList() {
  const navigate = useNavigate()
  const session = getSession() || {}

  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')
  const [query, setQuery] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState(null)   // { id, title }
  const [form, setForm] = useState(BLANK_FORM)

  // Fetch all cases on mount and re-fetch when filter changes
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const params = filter !== 'ALL' ? { status: filter } : {}
        const data = await casesApi.getCases(params)
        // GET /api/cases → { data: [...], total, limit, offset }
        setCases(Array.isArray(data) ? data : (data.data ?? []))
      } catch (err) {
        toast.error(err.message || 'Failed to load cases.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [filter])

  // Client-side text filter on top of status filter
  const displayed = query
    ? cases.filter(c => [c.title, c.clientName, c.caseNumber].some(s => s?.toLowerCase().includes(query.toLowerCase())))
    : cases

  const createCase = async () => {
    if (!form.title || !form.clientName) { toast.warning('Title and client name are required.'); return }
    setCreating(true)
    try {
      const res = await casesApi.createCase({
        ...form,
        caseNumber: form.caseNumber || 'LL-' + Date.now().toString(36).toUpperCase(),
        status: 'OPEN',
      })
      // POST /api/cases → { case: {...} }
      const newCase = res.case ?? res
      // Add to list if it matches the active filter
      if (filter === 'ALL' || filter === 'OPEN') {
        setCases(prev => [newCase, ...prev])
      }
      toast.success('Case created successfully!')
      setShowNew(false)
      setForm(BLANK_FORM)
    } catch (err) {
      toast.error(err.message || 'Failed to create case.')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm) return
    const { id, title } = confirm
    setConfirm(null)
    try {
      await casesApi.deleteCase(id)
      setCases(prev => prev.filter(c => c.id !== id))
      toast.success(`"${title}" deleted.`)
    } catch (err) {
      toast.error(err.message || 'Failed to delete case.')
    }
  }

  return (
    <div className="p-6 min-h-screen bg-surface">

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <h2 className="font-headline font-extrabold tracking-tight text-on-surface mb-2" style={{ fontSize: '1.5rem', lineHeight: '2rem' }}>Cases</h2>
          <p className="text-on-surface-variant font-medium">Manage your active litigation and legal documentation.</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="ai-gradient text-white flex items-center gap-2 px-6 py-3 rounded-lg font-semibold shadow-lg hover:shadow-xl transition-all active:scale-95">
          <span className="material-symbols-outlined">add</span><span>New Case</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-surface-container-low rounded-xl p-2 mb-6 flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="flex bg-surface-container-lowest rounded-lg p-1 shadow-sm w-full lg:w-auto gap-1">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-5 py-2 rounded-md text-sm font-bold transition-all ${filter === f ? 'bg-[#0D1F3C] text-white' : 'text-slate-500 hover:bg-slate-100 font-semibold'}`}>
              {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <div className="relative w-full lg:max-w-xs px-2">
          <span className="material-symbols-outlined absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 text-lg">filter_list</span>
          <input value={query} onChange={e => setQuery(e.target.value)}
            className="w-full bg-surface-container-lowest border-none rounded-lg py-2.5 px-4 text-sm focus:ring-0 shadow-sm outline-none"
            placeholder="Quick filter..." type="text" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center">
            <svg className="animate-spin h-7 w-7 text-secondary mx-auto mb-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <p className="text-sm text-on-surface-variant">Loading cases…</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/50">
                {['Case Title', 'Client', 'Court / Case No.', 'Status', 'Next Hearing', 'Actions'].map((h, i) => (
                  <th key={h} className={`px-6 py-4 text-xs font-bold uppercase tracking-wider text-on-tertiary-container ${i === 3 ? 'text-center' : i === 5 ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-low">
              {displayed.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-on-surface-variant text-sm">No cases found.</td></tr>
              ) : displayed.map(c => (
                <tr key={c.id} className="hover:bg-surface-container-low/30 transition-colors group cursor-pointer" onClick={() => navigate(`/cases/${c.id}`)}>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-8 bg-secondary rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div>
                        <p className="text-sm font-bold text-on-surface">{c.title}</p>
                        {/* type is not a top-level field — lives in metadata */}
                        <p className="text-xs text-on-surface-variant mt-0.5">{c.metadata?.type || c.courtName || ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5"><p className="text-sm font-semibold">{c.clientName}</p></td>
                  <td className="px-6 py-5">
                    <p className="text-sm text-on-surface">{c.courtName || '—'}</p>
                    <p className="text-xs font-mono text-slate-500">{c.caseNumber}</p>
                  </td>
                  <td className="px-6 py-5 text-center"><StatusBadge status={c.status} /></td>
                  <td className="px-6 py-5">
                    {/* nextHearing is stored in metadata.nextHearing */}
                  {c.metadata?.nextHearing
                      ? <div className="flex items-center gap-2"><span className="material-symbols-outlined text-sm text-secondary">calendar_today</span><p className="text-sm font-medium">{fmtDate(c.metadata.nextHearing)}</p></div>
                      : <span className="text-slate-400 text-xs italic">None scheduled</span>}
                  </td>
                  <td className="px-6 py-5 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => navigate(`/cases/${c.id}`)} className="p-2 hover:bg-surface-container-high rounded-lg transition-all text-slate-400 hover:text-primary-container" title="View">
                        <span className="material-symbols-outlined text-sm">open_in_new</span>
                      </button>
                      <button onClick={() => setConfirm({ id: c.id, title: c.title })} className="p-2 hover:bg-red-50 rounded-lg transition-all text-slate-400 hover:text-red-600" title="Delete">
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="px-6 py-4 bg-surface-container-low/30 flex items-center justify-between">
          <p className="text-xs text-on-surface-variant font-medium">Showing {displayed.length} case{displayed.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* New Case Modal */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="Create New Case">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Field label="Case Title *"><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Smith vs. Acme Corp" /></Field></div>
            <Field label="Client Name *"><Input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} placeholder="Client full name" /></Field>
            <Field label="Case Type"><Select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>{CASE_TYPES.map(t => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Court Name"><Input value={form.courtName} onChange={e => setForm(f => ({ ...f, courtName: e.target.value }))} placeholder="e.g. US District Court" /></Field>
            <Field label="Case Number"><Input value={form.caseNumber} onChange={e => setForm(f => ({ ...f, caseNumber: e.target.value }))} placeholder="e.g. CV-2025-001" /></Field>
            <div className="col-span-2"><Field label="Description"><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Brief description…" /></Field></div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" onClick={() => setShowNew(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={createCase} disabled={creating}>{creating ? 'Creating…' : 'Create Case'}</Btn>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={handleDelete}
        title="Delete Case"
        message={`Are you sure you want to delete "${confirm?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}
