/* ═══════════════════════════════════════════════════════
   LawLibra – In-Memory / localStorage Data Store
═══════════════════════════════════════════════════════ */
export const uid = () =>
  Math.random().toString(36).slice(2, 9) + Date.now().toString(36)

export const delay = (ms) => new Promise(r => setTimeout(r, ms))

export const fmtDate = (d) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return String(d) }
}

export const fmtFileSize = (bytes) => {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

export const relTime = (iso) => {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d < 7) return `${d}d ago`
  return fmtDate(iso)
}

export const initials = (name = '') =>
  name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')

/* ── localStorage helpers ─── */
const ls = {
  get: (k) => { try { return JSON.parse(localStorage.getItem('ll_' + k)) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem('ll_' + k, JSON.stringify(v)) } catch { } },
}

/* ── Collection factory ─── */
function col(name) {
  const init = () => { if (!ls.get(name)) ls.set(name, []) }
  const all = () => { init(); return ls.get(name) || [] }
  const byId = (id) => all().find(x => x.id === id) || null
  const create = (data) => {
    const item = { ...data, id: uid(), createdAt: new Date().toISOString() }
    const arr = all(); arr.unshift(item); ls.set(name, arr); return item
  }
  const update = (id, patch) => {
    const arr = all().map(x => x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x)
    ls.set(name, arr); return arr.find(x => x.id === id) || null
  }
  const del = (id) => ls.set(name, all().filter(x => x.id !== id))
  return { all, byId, create, update, delete: del }
}

/* ── Seed ─── */
const today = new Date()
const fut = (d) => new Date(today.getTime() + d * 86400000).toISOString().split('T')[0]
const past = (d) => new Date(today.getTime() - d * 86400000).toISOString().split('T')[0]

const USERS = [
  { id: 'admin001', name: 'Alexandra Harrington', email: 'admin@lawlibra.pro', password: 'Admin@123', role: 'ADMIN', status: 'ACTIVE', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'law001', name: 'Marcus J. Sterling', email: 'lawyer@lawlibra.pro', password: 'Lawyer@123', role: 'LAWYER', status: 'ACTIVE', createdAt: '2024-01-02T00:00:00Z' },
  { id: 'law002', name: 'Priya Nambiar', email: 'priya@lawlibra.pro', password: 'Priya@123', role: 'LAWYER', status: 'ACTIVE', createdAt: '2024-02-01T00:00:00Z' },
]
const CASES = [
  { id: 'case001', title: 'Harrington Corp vs. Tech Dynamics', clientName: 'Harrington Corporation', type: 'Contract Dispute', caseNumber: 'CV-2025-0041', courtName: 'US District Court SDNY', status: 'OPEN', priority: 'HIGH', assignedTo: ['admin001', 'law001'], nextHearing: fut(12), filedAt: past(90), description: 'Breach of $4M software development contract. Plaintiff alleges missed delivery milestones and IP theft.' },
  { id: 'case002', title: 'Sterling v. City of Meridian', clientName: 'David Sterling', type: 'Civil Litigation', caseNumber: 'CL-2025-0118', courtName: 'Superior Court of Meridian', status: 'OPEN', priority: 'MEDIUM', assignedTo: ['law001'], nextHearing: fut(5), filedAt: past(60), description: 'Wrongful termination claim against municipal employer. Client is seeking reinstatement and back pay.' },
  { id: 'case003', title: 'In Re: Westbrook Estate', clientName: 'Elaine Westbrook', type: 'Probate & Estates', caseNumber: 'PRO-2024-0893', courtName: 'Probate Court of Fairview', status: 'PENDING', priority: 'LOW', assignedTo: ['law002'], nextHearing: fut(21), filedAt: past(180), description: 'Complex probate with contested will and multiple beneficiary disputes across three states.' },
  { id: 'case004', title: 'Vertex IP Portfolio Defense', clientName: 'Vertex Solutions Ltd.', type: 'Intellectual Property', caseNumber: 'IP-2025-0077', courtName: 'US Court of Appeals CAFC', status: 'OPEN', priority: 'HIGH', assignedTo: ['admin001', 'law002'], nextHearing: fut(30), filedAt: past(45), description: 'Patent infringement defense covering 14 software patents in cloud infrastructure segment.' },
  { id: 'case005', title: 'Thompson Tax Dispute 2024', clientName: 'James R. Thompson', type: 'Tax Law', caseNumber: 'TAX-2024-1042', courtName: 'US Tax Court', status: 'CLOSED', priority: 'MEDIUM', assignedTo: ['law001'], nextHearing: null, filedAt: past(300), description: 'Resolved IRS audit dispute regarding deferred compensation arrangements.' },
]
const EVENTS = [
  { id: 'ev001', title: 'Pre-Trial Conference – Harrington', caseId: 'case001', date: fut(5), time: '10:00 AM', type: 'HEARING', location: 'SDNY Courtroom 4B', duration: 90, createdBy: 'admin001', createdAt: past(10) + 'T00:00:00Z' },
  { id: 'ev002', title: 'Deposition – David Sterling', caseId: 'case002', date: fut(8), time: '02:00 PM', type: 'MEETING', location: 'Sterling & Associates', duration: 120, createdBy: 'law001', createdAt: past(5) + 'T00:00:00Z' },
  { id: 'ev003', title: 'Status Hearing – Westbrook Estate', caseId: 'case003', date: fut(21), time: '09:30 AM', type: 'HEARING', location: 'Fairview Probate Court', duration: 60, createdBy: 'law002', createdAt: past(20) + 'T00:00:00Z' },
  { id: 'ev004', title: 'Expert Witness Review – Vertex', caseId: 'case004', date: fut(3), time: '11:00 AM', type: 'MEETING', location: 'Vertex HQ, Conf Rm A', duration: 180, createdBy: 'admin001', createdAt: past(2) + 'T00:00:00Z' },
  { id: 'ev005', title: 'Document Filing Deadline', caseId: 'case001', date: fut(15), time: '05:00 PM', type: 'DEADLINE', location: 'SDNY Electronic Filing', duration: 0, createdBy: 'admin001', createdAt: past(1) + 'T00:00:00Z' },
  { id: 'ev006', title: 'Team Strategy Meeting', caseId: 'case004', date: fut(1), time: '03:00 PM', type: 'MEETING', location: 'Virtual – Teams', duration: 60, createdBy: 'admin001', createdAt: past(1) + 'T00:00:00Z' },
]
const DOCS = [
  { id: 'doc001', name: 'Harrington_Master_Contract.pdf', caseId: 'case001', size: 2450000, type: 'pdf', uploadedBy: 'admin001', tags: ['contract', 'key-doc'], uploadedAt: past(80) + 'T09:00:00Z', createdAt: past(80) + 'T09:00:00Z' },
  { id: 'doc002', name: 'Tech_Dynamics_Response.docx', caseId: 'case001', size: 890000, type: 'docx', uploadedBy: 'law001', tags: ['response', 'discovery'], uploadedAt: past(60) + 'T10:30:00Z', createdAt: past(60) + 'T10:30:00Z' },
  { id: 'doc003', name: 'Sterling_Employment_Records.xlsx', caseId: 'case002', size: 340000, type: 'xlsx', uploadedBy: 'law001', tags: ['records', 'evidence'], uploadedAt: past(45) + 'T14:00:00Z', createdAt: past(45) + 'T14:00:00Z' },
  { id: 'doc004', name: 'Westbrook_Last_Will.pdf', caseId: 'case003', size: 1200000, type: 'pdf', uploadedBy: 'law002', tags: ['will', 'probate'], uploadedAt: past(170) + 'T08:00:00Z', createdAt: past(170) + 'T08:00:00Z' },
  { id: 'doc005', name: 'Vertex_Patent_Portfolio.pdf', caseId: 'case004', size: 5600000, type: 'pdf', uploadedBy: 'admin001', tags: ['IP', 'patents'], uploadedAt: past(40) + 'T11:00:00Z', createdAt: past(40) + 'T11:00:00Z' },
  { id: 'doc006', name: 'Privilege_Log_2025.xlsx', caseId: 'case001', size: 210000, type: 'xlsx', uploadedBy: 'law001', tags: ['privilege', 'log'], uploadedAt: past(20) + 'T16:00:00Z', createdAt: past(20) + 'T16:00:00Z' },
]
const NOTIFS = [
  { id: 'n001', userId: '*', title: 'Hearing Tomorrow', message: 'Pre-trial conference for Harrington Corp is tomorrow at 10:00 AM in SDNY Courtroom 4B.', type: 'hearing', read: false, createdAt: new Date(Date.now() - 3600000).toISOString() },
  { id: 'n002', userId: '*', title: 'New Document Uploaded', message: 'Tech_Dynamics_Response.docx was uploaded to Harrington Corp vs. Tech Dynamics.', type: 'document', read: false, createdAt: new Date(Date.now() - 7200000).toISOString() },
  { id: 'n003', userId: '*', title: 'Case Status Updated', message: 'Thompson Tax Dispute 2024 has been marked as CLOSED.', type: 'case', read: true, createdAt: new Date(Date.now() - 86400000).toISOString() },
  { id: 'n004', userId: '*', title: 'AI Analysis Complete', message: 'Libra AI finished analyzing the Vertex Patent Portfolio and generated a risk report.', type: 'ai', read: false, createdAt: new Date(Date.now() - 1800000).toISOString() },
  { id: 'n005', userId: '*', title: 'Filing Deadline Reminder', message: 'Document filing deadline for Harrington is in 15 days. Ensure all exhibits are ready.', type: 'hearing', read: true, createdAt: new Date(Date.now() - 172800000).toISOString() },
]
const THREADS = [
  { id: 'th001', caseId: 'case001', title: 'Harrington Contract Analysis', createdBy: 'admin001', createdAt: past(10) + 'T09:00:00Z' },
  { id: 'th002', caseId: null, title: 'General Legal Strategy', createdBy: 'law001', createdAt: past(5) + 'T14:00:00Z' },
]
const MESSAGES = [
  { id: 'msg001', threadId: 'th001', role: 'user', content: 'Summarize the key risks in the Harrington contract dispute.', createdAt: past(10) + 'T09:01:00Z' },
  { id: 'msg002', threadId: 'th001', role: 'assistant', content: '**Harrington Corp vs. Tech Dynamics – Risk Analysis**\n\nBased on the case profile, here are the primary risks:\n\n**1. Contract Ambiguity** – Milestone definitions in the MSA appear vague, creating evidentiary challenges.\n\n**2. IP Ownership** – The IP theft allegation requires clear documentation of what was developed under contract scope.\n\n**3. Damages Quantification** – A $4M claim requires expert testimony linking the breach directly to specific losses.\n\n**Recommended next steps:** Obtain all change orders and communications between the teams during the project timeline.', createdAt: past(10) + 'T09:02:00Z' },
  { id: 'msg003', threadId: 'th002', role: 'user', content: 'What are best practices for depositions in employment law?', createdAt: past(5) + 'T14:01:00Z' },
  { id: 'msg004', threadId: 'th002', role: 'assistant', content: '**Deposition Best Practices – Employment Law**\n\n**Preparation:**\n- Review all personnel files, performance reviews, and HR communications\n- Identify key witnesses and depose adverse parties early\n- Prepare your client with mock deposition sessions\n\n**During the Deposition:**\n- Use open-ended questions to allow full explanations\n- Listen carefully before objecting\n- Cover all communication channels including informal ones\n\n**Key Areas:**\n- The decision-making process for the adverse action\n- HR policies and whether they were followed\n- Any comparators treated differently', createdAt: past(5) + 'T14:02:00Z' },
]

function seedIfEmpty(key, data) {
  if (!ls.get(key) || ls.get(key).length === 0) ls.set(key, data)
}

; (function initSeed() {
  seedIfEmpty('users', USERS)
  // Always ensure demo users have correct passwords (they may have been changed via Settings)
  const existing = ls.get('users') || []
  USERS.forEach(demo => {
    const found = existing.find(u => u.id === demo.id)
    if (found) {
      found.password = demo.password
      found.email = demo.email
    } else {
      existing.push(demo)
    }
  })
  ls.set('users', existing)
  seedIfEmpty('cases', CASES)
  seedIfEmpty('events', EVENTS)
  seedIfEmpty('documents', DOCS)
  seedIfEmpty('notifications', NOTIFS)
  seedIfEmpty('threads', THREADS)
  seedIfEmpty('messages', MESSAGES)
  seedIfEmpty('folders', [])
  // Session is preserved across reloads; cleared only on explicit logout
})()

/* ── Auth ─── */
export const Auth = {
  login: (email, password) => {
    const user = (ls.get('users') || []).find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password)
    if (!user) return null
    ls.set('session', user.id)
    return user
  },
  logout: () => { ls.set('session', null); window.dispatchEvent(new Event('auth-change')) },
  currentUser: () => {
    const id = ls.get('session')
    if (!id) return null
    return (ls.get('users') || []).find(u => u.id === id) || null
  },
  isLoggedIn: () => !!ls.get('session'),
}

/* ── Collections ─── */
const _cases = col('cases')
const _users = col('users')
const _docs = col('documents')
const _events = col('events')
const _notifs = col('notifications')
const _thr = col('threads')
const _msg = col('messages')
const _fol = col('folders')

export const DB = {
  cases: {
    all: () => _cases.all(),
    byId: (id) => _cases.byId(id),
    create: (d) => _cases.create(d),
    update: (id, p) => _cases.update(id, p),
    delete: (id) => _cases.delete(id),
    search: (q = '', status = '') => {
      let r = _cases.all()
      if (q) r = r.filter(c => [c.title, c.clientName, c.caseNumber].some(s => s?.toLowerCase().includes(q.toLowerCase())))
      if (status) r = r.filter(c => c.status === status)
      return r
    },
  },
  users: {
    all: () => _users.all(),
    byId: (id) => _users.byId(id),
    create: (d) => _users.create(d),
    update: (id, p) => _users.update(id, p),
    delete: (id) => _users.delete(id),
  },
  documents: {
    all: () => _docs.all(),
    byId: (id) => _docs.byId(id),
    byCaseId: (cid) => _docs.all().filter(d => d.caseId === cid),
    create: (d) => _docs.create(d),
    update: (id, p) => _docs.update(id, p),
    delete: (id) => _docs.delete(id),
  },
  events: {
    all: () => _events.all(),
    byId: (id) => _events.byId(id),
    create: (d) => _events.create(d),
    update: (id, p) => _events.update(id, p),
    delete: (id) => _events.delete(id),
  },
  notifications: {
    all: () => _notifs.all(),
    unread: () => _notifs.all().filter(n => !n.read),
    create: (d) => _notifs.create(d),
    markRead: (id) => _notifs.update(id, { read: true }),
    markAllRead: () => { _notifs.all().forEach(n => _notifs.update(n.id, { read: true })) },
    delete: (id) => _notifs.delete(id),
    deleteAll: () => ls.set('notifications', []),
  },
  threads: {
    all: () => _thr.all(),
    byId: (id) => _thr.byId(id),
    byCaseId: (cid) => _thr.all().filter(t => t.caseId === cid),
    create: (d) => _thr.create(d),
    update: (id, p) => _thr.update(id, p),
    delete: (id) => _thr.delete(id),
  },
  messages: {
    byThread: (tid) => _msg.all().filter(m => m.threadId === tid).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    create: (d) => _msg.create(d),
  },
  folders: {
    all: () => _fol.all(),
    byId: (id) => _fol.byId(id),
    create: (d) => _fol.create(d),
    update: (id, p) => _fol.update(id, p),
    delete: (id) => _fol.delete(id),
  },
}

/* ── Mock AI ─── */
const AI = [
  (q, cid) => {
    const c = cid ? DB.cases.byId(cid) : null
    return `**Legal Analysis${c ? ': ' + c.title : ''}**\n\nBased on your query, here is my assessment:\n\n**Key Considerations:**\n- Review all contractual obligations and applicable statutes of limitation\n- Document all communications and evidence systematically\n- Consider alternative dispute resolution before litigation\n\n**Strategic Recommendations:**\n1. Conduct thorough discovery to build a robust evidentiary record\n2. Engage expert witnesses early if technical matters are involved\n3. Assess settlement value against projected litigation costs\n\nWould you like me to elaborate on any specific aspect?`
  },
  (q) => `**Research Summary**\n\nRegarding: *"${q.slice(0, 60)}..."*\n\n**Relevant Legal Principles:**\n- Courts apply strict interpretation of contractual terms\n- The burden of proof rests with the moving party\n- Precedent suggests a highly fact-intensive inquiry\n\n**Recommended Actions:**\n1. Gather all documentary evidence and contemporaneous records\n2. Identify favorable case law in your specific jurisdiction\n3. Prepare a detailed legal memorandum outlining your position\n\nI can draft specific pleadings, demand letters, or memos on request.`,
  (q) => `**Libra AI – Structured Analysis**\n\n**Overview:**\nThis matter requires careful consideration of both substantive law and procedural requirements specific to your jurisdiction.\n\n**Key Legal Issues:**\n- Jurisdictional considerations and applicable choice of law\n- Statute of limitations and tolling provisions\n- Evidentiary standards and burden allocation\n\n**Risk Matrix:**\n- **High:** Ambiguous language in primary documents\n- **Medium:** Witness credibility and availability\n- **Low:** Procedural compliance\n\n**Next Steps:** Provide additional case details or specific documents for a more tailored analysis. I can also draft correspondence, motions, or legal memos on demand.`,
]

let _ai = 0
export const mockAIResponse = (query, caseId) => {
  const fn = AI[_ai % AI.length]
  _ai++
  return fn(query, caseId)
}
