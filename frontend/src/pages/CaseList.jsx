import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DB, Auth, fmtDate } from '../store/db.js'
import { StatusBadge, Modal, Field, Input, Select, Textarea, Btn, ConfirmModal, toast } from '../components/UI.jsx'

const CASE_TYPES = ['Contract Dispute','Criminal Defense','Intellectual Property','Corporate','Tax Law','Probate & Estates','Civil Litigation']
const FILTERS = ['ALL','OPEN','CLOSED','ARCHIVED']

export default function CaseList() {
  const navigate = useNavigate()
  const user = Auth.currentUser() || {}
  const [filter, setFilter] = useState('ALL')
  const [query, setQuery] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [form, setForm] = useState({ title:'', clientName:'', type:'Contract Dispute', courtName:'', caseNumber:'', description:'' })
  const [, forceUpdate] = useState(0)

  const cases = DB.cases.search(query, filter === 'ALL' ? '' : filter)

  const createCase = () => {
    if (!form.title || !form.clientName) { toast.warning('Title and client name are required.'); return }
    DB.cases.create({ ...form, caseNumber: form.caseNumber || 'LL-'+Date.now().toString(36).toUpperCase(), status:'OPEN', priority:'MEDIUM', assignedTo:[user.id] })
    toast.success('Case created successfully!')
    setShowNew(false)
    setForm({ title:'', clientName:'', type:'Contract Dispute', courtName:'', caseNumber:'', description:'' })
    forceUpdate(n => n+1)
  }

  const deleteCase = (id, title) => {
    setConfirm({ id, title })
  }

  return (
    <div className="p-6 min-h-screen bg-surface">
      

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <h2 className="font-headline font-extrabold tracking-tight text-on-surface mb-2" style={{fontSize:'1.5rem',lineHeight:'2rem'}}>Cases</h2>
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
              {f === 'ALL' ? 'All' : f.charAt(0)+f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <div className="relative w-full lg:max-w-xs px-2">
          <span className="material-symbols-outlined absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 text-lg">filter_list</span>
          <input value={query} onChange={e => setQuery(e.target.value)}
            className="w-full bg-surface-container-lowest border-none rounded-lg py-2.5 px-4 text-sm focus:ring-0 shadow-sm outline-none"
            placeholder="Quick filter..." type="text"/>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low/50">
              {['Case Title','Client','Court / Case No.','Status','Next Hearing','Actions'].map((h,i) => (
                <th key={h} className={`px-6 py-4 text-xs font-bold uppercase tracking-wider text-on-tertiary-container ${i===3?'text-center':i===5?'text-right':''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container-low">
            {cases.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-on-surface-variant text-sm">No cases found.</td></tr>
            ) : cases.map(c => (
              <tr key={c.id} className="hover:bg-surface-container-low/30 transition-colors group cursor-pointer" onClick={() => navigate(`/cases/${c.id}`)}>
                <td className="px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-8 bg-secondary rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div>
                      <p className="text-sm font-bold text-on-surface">{c.title}</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">{c.type}</p>
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
                  {c.nextHearing
                    ? <div className="flex items-center gap-2"><span className="material-symbols-outlined text-sm text-secondary">calendar_today</span><p className="text-sm font-medium">{fmtDate(c.nextHearing)}</p></div>
                    : <span className="text-slate-400 text-xs italic">None scheduled</span>}
                </td>
                <td className="px-6 py-5 text-right" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => navigate(`/cases/${c.id}`)} className="p-2 hover:bg-surface-container-high rounded-lg transition-all text-slate-400 hover:text-primary-container" title="View">
                      <span className="material-symbols-outlined text-sm">open_in_new</span>
                    </button>
                    <button onClick={() => deleteCase(c.id, c.title)} className="p-2 hover:bg-red-50 rounded-lg transition-all text-slate-400 hover:text-red-600" title="Delete">
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-6 py-4 bg-surface-container-low/30 flex items-center justify-between">
          <p className="text-xs text-on-surface-variant font-medium">Showing {cases.length} case{cases.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* New Case Modal */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="Create New Case">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Field label="Case Title *"><Input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Smith vs. Acme Corp"/></Field></div>
            <Field label="Client Name *"><Input value={form.clientName} onChange={e=>setForm(f=>({...f,clientName:e.target.value}))} placeholder="Client full name"/></Field>
            <Field label="Case Type"><Select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{CASE_TYPES.map(t=><option key={t}>{t}</option>)}</Select></Field>
            <Field label="Court Name"><Input value={form.courtName} onChange={e=>setForm(f=>({...f,courtName:e.target.value}))} placeholder="e.g. US District Court"/></Field>
            <Field label="Case Number"><Input value={form.caseNumber} onChange={e=>setForm(f=>({...f,caseNumber:e.target.value}))} placeholder="e.g. CV-2025-001"/></Field>
            <div className="col-span-2"><Field label="Description"><Textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={2} placeholder="Brief description…"/></Field></div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" onClick={() => setShowNew(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={createCase}>Create Case</Btn>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => { DB.cases.delete(confirm.id); toast.success('Case deleted.'); forceUpdate(n=>n+1) }}
        title="Delete Case"
        message={`Are you sure you want to delete "${confirm?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}
