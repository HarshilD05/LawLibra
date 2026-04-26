import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DB, Auth, fmtDate, initials } from '../store/db.js'
import { StatusBadge, Modal, Field, Input, Select, Textarea, Btn, toast } from '../components/UI.jsx'

const CASE_TYPES = ['Contract Dispute','Criminal Defense','Intellectual Property','Corporate','Tax Law','Probate & Estates','Civil Litigation']

export default function Dashboard() {
  const navigate = useNavigate()
  const user = Auth.currentUser() || {}
  const [cases, setCases] = useState(() => DB.cases.all().slice(0, 5))
  const [showNewCase, setShowNewCase] = useState(false)
  const [form, setForm] = useState({ title:'', clientName:'', type:'Contract Dispute', courtName:'', caseNumber:'', description:'' })

  const stats = {
    totalCases: DB.cases.all().length,
    openCases:  DB.cases.all().filter(c => c.status === 'OPEN').length,
    totalDocs:  DB.documents.all().length,
    unread:     DB.notifications.unread().length,
  }

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const in7Str  = new Date(today.getTime() + 7*86400000).toISOString().split('T')[0]
  const hearings = DB.events.all()
    .filter(e => e.type === 'HEARING' && e.date >= todayStr && e.date <= in7Str)
    .sort((a,b) => a.date.localeCompare(b.date))
    .slice(0, 4)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const createCase = () => {
    if (!form.title || !form.clientName) { toast.warning('Title and client name are required.'); return }
    DB.cases.create({ ...form, caseNumber: form.caseNumber || 'LL-'+Date.now().toString(36).toUpperCase(), status:'OPEN', priority:'MEDIUM', assignedTo:[user.id] })
    DB.notifications.create({ userId:'*', title:'New Case Created', message:`"${form.title}" has been opened.`, type:'case' })
    toast.success('Case created successfully!')
    setShowNewCase(false)
    setForm({ title:'', clientName:'', type:'Contract Dispute', courtName:'', caseNumber:'', description:'' })
    setCases(DB.cases.all().slice(0, 5))
  }

  return (
    <div className="p-6 min-h-screen">
      

      {/* Welcome */}
      <header className="mb-8">
        <h2 className="font-headline font-extrabold tracking-tight text-primary-container mb-2" style={{fontSize:'1.5rem',lineHeight:'2rem'}}>
          {greeting}, {user.name?.split(' ')[0] || 'Counselor'}.
        </h2>
        <p className="text-on-surface-variant font-medium">
          You have {stats.openCases} open case{stats.openCases !== 1 ? 's' : ''} and {stats.unread} unread notification{stats.unread !== 1 ? 's' : ''}.
        </p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {[
          { label:'Total Cases',          value: stats.totalCases, icon:'folder',             color:'text-primary-container', bg:'bg-primary-container/5',     extra:<span className="text-xs font-bold text-secondary flex items-center gap-1">Total <span className="material-symbols-outlined text-sm">inventory_2</span></span> },
          { label:'Open Cases',           value: stats.openCases,  icon:'gavel',              color:'text-primary-container', bg:'bg-secondary-container/20',  filled:true, extra:<span className="text-xs font-bold text-on-surface-variant">Active</span> },
          { label:'Documents',            value: stats.totalDocs,  icon:'description',        color:'text-primary-container', bg:'bg-tertiary-fixed-dim/20',   extra:<span className="text-xs font-bold text-on-surface-variant">In vault</span> },
          { label:'Unread Notifications', value: stats.unread,     icon:'notifications_active',color:'text-primary-container', bg:'bg-error-container/30', filled:true, pulse:stats.unread>0 },
        ].map(s => (
          <div key={s.label} className="bg-surface-container-lowest p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-lg ${s.bg} text-primary-container`}>
                <span className="material-symbols-outlined" style={s.filled ? {fontVariationSettings:"'FILL' 1"} : {}}>{s.icon}</span>
              </div>
              {s.extra || (s.pulse ? <div className="w-2 h-2 bg-error rounded-full animate-pulse" /> : null)}
            </div>
            <h3 className="text-on-surface-variant text-xs font-bold uppercase tracking-wider mb-1">{s.label}</h3>
            <p className={`font-black font-headline ${s.color}`} style={{fontSize:'1.6rem'}}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Cases + Hearings */}
      <div className="flex flex-col lg:flex-row gap-8">
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
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-surface-container-high">
                    {['Title','Client','Status','Next Hearing',''].map(h => (
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
            </div>
            <div className="px-8 py-4 bg-surface-container-low/30 flex justify-center">
              <button onClick={() => navigate('/cases')} className="text-xs font-bold text-on-primary-fixed-variant hover:text-primary-container transition-colors">
                VIEW ALL CASES →
              </button>
            </div>
          </div>
        </section>

        {/* Upcoming Hearings */}
        <aside className="w-full lg:w-80 flex-shrink-0">
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-6 sticky top-6 border border-outline-variant/10">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-headline font-bold text-primary-container">Upcoming Hearings</h3>
              <span className="bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded text-[10px] font-black uppercase">Next 7 Days</span>
            </div>
            <div className="space-y-6">
              {hearings.length === 0 ? (
                <p className="text-sm text-on-surface-variant italic">No hearings in the next 7 days.</p>
              ) : hearings.map(ev => {
                const isToday = ev.date === todayStr
                const c = DB.cases.byId(ev.caseId)
                return (
                  <div key={ev.id} className={`relative pl-4 border-l-2 ${isToday ? 'border-secondary' : 'border-outline-variant'}`}>
                    <p className={`text-[10px] font-black uppercase mb-1 ${isToday ? 'text-secondary' : 'text-on-surface-variant'}`}>
                      {isToday ? 'Today' : fmtDate(ev.date)} • {ev.time}
                    </p>
                    <h4 className="text-sm font-bold text-primary-container mb-1">{ev.title}</h4>
                    <p className="text-xs text-on-surface-variant">{c ? c.title+' • ' : ''}{ev.location || ''}</p>
                  </div>
                )
              })}
            </div>
            <button onClick={() => navigate('/calendar')}
              className="block w-full mt-6 py-3 border border-outline-variant text-xs font-bold text-primary-container rounded-lg hover:bg-surface-container-low transition-colors text-center">
              OPEN FULL CALENDAR
            </button>
          </div>
        </aside>
      </div>

      {/* New Case Modal */}
      <Modal open={showNewCase} onClose={() => setShowNewCase(false)} title="Create New Case" subtitle="All fields are required">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Field label="Case Title"><Input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Smith vs. Acme Corp"/></Field></div>
            <Field label="Client Name"><Input value={form.clientName} onChange={e=>setForm(f=>({...f,clientName:e.target.value}))} placeholder="Client name"/></Field>
            <Field label="Case Type"><Select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{CASE_TYPES.map(t=><option key={t}>{t}</option>)}</Select></Field>
            <Field label="Court Name"><Input value={form.courtName} onChange={e=>setForm(f=>({...f,courtName:e.target.value}))} placeholder="e.g. US District Court"/></Field>
            <Field label="Case Number"><Input value={form.caseNumber} onChange={e=>setForm(f=>({...f,caseNumber:e.target.value}))} placeholder="e.g. CV-2025-001"/></Field>
            <div className="col-span-2"><Field label="Description"><Textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={2} placeholder="Brief case description…"/></Field></div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" onClick={() => setShowNewCase(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={createCase}>Create Case</Btn>
          </div>
        </div>
      </Modal>
    </div>
  )
}
