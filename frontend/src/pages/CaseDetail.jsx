import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSession } from '../api/auth.js'
import * as authApi from '../api/auth.js'
import * as casesApi from '../api/cases.js'
import * as documentsApi from '../api/documents.js'
import * as foldersApi from '../api/folders.js'
import * as eventsApi from '../api/events.js'

import { StatusBadge, Modal, Field, Input, Select, Textarea, Btn, ConfirmModal, toast, Markdown } from '../components/UI.jsx'

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const EXT_TO_MIME = {
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
}

// Derive a display type from mimeType for icons/colors
const mimeToType = (mime = '') => {
  if (mime.includes('pdf'))  return 'pdf'
  if (mime.includes('word') || mime.includes('docx')) return 'docx'
  if (mime.includes('sheet') || mime.includes('excel')) return 'xlsx'
  if (mime.startsWith('image/')) return 'img'
  if (mime.includes('text')) return 'txt'
  return 'pdf'
}

const FILE_ICONS  = { pdf:'picture_as_pdf', docx:'article', xlsx:'table_chart', img:'image', txt:'text_snippet' }
const FILE_COLORS = { pdf:'text-red-500 bg-red-50', docx:'text-blue-500 bg-blue-50', xlsx:'text-emerald-500 bg-emerald-50', img:'text-purple-500 bg-purple-50', txt:'text-slate-500 bg-slate-100' }

const fmtFileSize = (bytes) => {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`
  return `${(bytes/1048576).toFixed(1)} MB`
}

const fmtDate = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return String(iso) }
}

const relTime = (iso) => {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  return `${d}d ago`
}

const initials = (name = '') =>
  name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')

// The backend events schema: name, startTime (ISO), type, description
const eventDate = (ev) => ev.startTime ? ev.startTime.slice(0, 10) : ''
const eventTime = (ev) => {
  if (!ev.startTime) return ''
  return new Date(ev.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}
const toISO = (date, time) => date ? new Date(`${date}T${time || '09:00'}:00`).toISOString() : null

const TABS = [
  { key: 'overview',  label: 'OVERVIEW' },
  { key: 'documents', label: 'DOCUMENTS' },
  { key: 'team',      label: 'TEAM' },
]

export default function CaseDetail() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const session    = getSession() || {}

  /* ── Core state ─────────────────────────────────────────────────────────── */
  const [caseData,  setCaseData]  = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState('overview')

  // Documents + folders
  const [allDocs,    setAllDocs]    = useState([])   // all docs for the case (flat)
  const [folderTree, setFolderTree] = useState([])   // nested tree from GET /folders/tree
  const [allFolders, setAllFolders] = useState([])   // flat list derived from tree for lookups
  const [currentFolderId, setCurrentFolderId] = useState(null)

  // Events (personal, not case-scoped in the backend schema)
  const [caseEvents, setCaseEvents] = useState([])

  // Assignments / team
  const [team, setTeam] = useState([])

  // Edit modal
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [saving,   setSaving]   = useState(false)

  // Upload modal
  const [showUpload,     setShowUpload]     = useState(false)
  const [selectedFiles,  setSelectedFiles]  = useState([])
  const [uploadTags,     setUploadTags]     = useState('')
  const [uploading,      setUploading]      = useState(false)
  const fileInputRef   = useRef(null)
  const folderInputRef = useRef(null)
  const [dragOver,       setDragOver]       = useState(false)

  // Folder creation modal
  const [showFolder, setShowFolder] = useState(false)
  const [folderName, setFolderName] = useState('')

  // Schedule event modal
  const [showEvent, setShowEvent] = useState(false)
  const [eventForm, setEventForm] = useState({ name: '', date: '', time: '09:00', type: 'HEARING', description: '' })
  const [eventSaving, setEventSaving] = useState(false)
  const todayStr = new Date().toISOString().slice(0, 10)

  // Assign lawyer modal (Admin only)
  const [showAssign,   setShowAssign]   = useState(false)
  const [allUsers,     setAllUsers]     = useState([])   // all system users for the picker
  const [usersLoading, setUsersLoading] = useState(false)
  const [assignForm,   setAssignForm]   = useState({ lawyerId: '', accessLevel: 'VIEW' })
  const [assigning,    setAssigning]    = useState(false)

  /* ── Flatten recursive folder tree into an array ─────────────────────────── */
  const flattenTree = useCallback((nodes, acc = []) => {
    nodes.forEach(n => { acc.push(n); if (n.children?.length) flattenTree(n.children, acc) })
    return acc
  }, [])

  /* ── Data fetching ─────────────────────────────────────────────────────── */
  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [caseRes, docsRes, foldersRes, assignRes] = await Promise.all([
        casesApi.getCaseById(id),
        documentsApi.getDocuments({ caseId: id }),
        foldersApi.getFolderTree(id),
        casesApi.getAssignments(id).catch(() => ({ assignments: [] })),  // 403 for non-admins is ok
      ])
      // GET /api/cases/:id → { case: {...} }
      setCaseData(caseRes.case ?? caseRes)
      // GET /api/documents?caseId= → { data: [...] }
      setAllDocs(Array.isArray(docsRes) ? docsRes : (docsRes.data ?? []))
      // GET /api/folders/tree?caseId= → { tree: [...] }
      const tree = Array.isArray(foldersRes) ? foldersRes : (foldersRes.tree ?? [])
      setFolderTree(tree)
      setAllFolders(flattenTree(tree))
      // GET /api/cases/:id/assignments → { assignments: [...] }
      setTeam(Array.isArray(assignRes) ? assignRes : (assignRes.assignments ?? []))
    } catch (err) {
      toast.error(err.message || 'Failed to load case.')
      if (err.message?.includes('not found')) navigate('/cases')
    } finally {
      setLoading(false)
    }
  }, [id, navigate, flattenTree])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Fetch user's personal events (we'll filter by description/notes that reference this case)
  useEffect(() => {
    eventsApi.getEvents()
      .then(res => {
        const events = Array.isArray(res) ? res : (res.data ?? [])
        // Backend events are personal and have no caseId — show all upcoming
        const upcoming = events
          .filter(ev => eventDate(ev) >= todayStr)
          .sort((a, b) => a.startTime?.localeCompare(b.startTime))
        setCaseEvents(upcoming)
      })
      .catch(() => {})
  }, [todayStr])

  /* ── Folder navigation helpers ───────────────────────────────────────────── */
  const currentFolder = currentFolderId ? allFolders.find(f => f.id === currentFolderId) : null

  // Get direct children folders of currentFolderId from flat list
  const visibleFolders = allFolders.filter(f => (f.parentFolderId ?? null) === currentFolderId)
  // Docs in current folder (null = root)
  const visibleDocs    = allDocs.filter(d => (d.folderId ?? null) === currentFolderId)

  // Build breadcrumb path
  const buildCrumbs = (fid) => {
    const path = []; let cur = fid
    while (cur) {
      const f = allFolders.find(x => x.id === cur)
      if (!f) break
      path.unshift(f)
      cur = f.parentFolderId ?? null
    }
    return path
  }
  const caseCrumbs = buildCrumbs(currentFolderId)

  /* ── Edit case ───────────────────────────────────────────────────────────── */
  const saveEdit = async () => {
    setSaving(true)
    try {
      const res = await casesApi.updateCase(id, {
        title:      editForm.title,
        clientName: editForm.clientName,
        courtName:  editForm.courtName,
        caseNumber: editForm.caseNumber,
        status:     editForm.status,
        metadata:   { ...(caseData.metadata || {}), ...(editForm.metadata || {}), nextHearing: editForm.nextHearing },
      })
      setCaseData(res.case ?? res)
      toast.success('Case updated.')
      setShowEdit(false)
    } catch (err) {
      toast.error(err.message || 'Failed to update case.')
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async () => {
    const statuses = ['OPEN', 'CLOSED', 'ARCHIVED']
    const next = statuses[(statuses.indexOf(caseData.status) + 1) % statuses.length]
    try {
      const res = await casesApi.updateCase(id, { status: next })
      setCaseData(res.case ?? res)
      toast.info(`Status changed to ${next}`)
    } catch (err) {
      toast.error(err.message || 'Failed to update status.')
    }
  }

  /* ── Upload documents ────────────────────────────────────────────────────── */
  const uploadDocs = async () => {
    if (!selectedFiles.length) { toast.warning('Select at least one file.'); return }
    setUploading(true)
    let succeeded = 0
    try {
      for (const file of selectedFiles) {
        const form = new FormData()
        form.append('document', file)
        form.append('caseId', id)
        if (currentFolderId) form.append('folderId', currentFolderId)
        try {
          await documentsApi.uploadDocument(form)
          succeeded++
        } catch (err) {
          toast.error(`Failed to upload ${file.name}: ${err.message}`)
        }
      }
      if (succeeded) toast.success(`${succeeded} file${succeeded > 1 ? 's' : ''} uploaded!`)
    } finally {
      setUploading(false)
      setShowUpload(false)
      setSelectedFiles([])
      setUploadTags('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      // Refresh docs list
      const res = await documentsApi.getDocuments({ caseId: id })
      setAllDocs(Array.isArray(res) ? res : (res.data ?? []))
    }
  }

  const deleteDoc = async (docId) => {
    try {
      await documentsApi.deleteDocument(docId)
      setAllDocs(prev => prev.filter(d => d.id !== docId))
      toast.success('File deleted.')
    } catch (err) {
      toast.error(err.message || 'Failed to delete file.')
    }
  }

  /* ── Drag and drop ───────────────────────────────────────────────────────── */
  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) { setSelectedFiles(files); setShowUpload(true) }
  }, [])

  /* ── Folders ─────────────────────────────────────────────────────────────── */
  const createFolder = async () => {
    if (!folderName.trim()) return
    try {
      const res = await foldersApi.createFolder({
        caseId: id,
        name: folderName.trim(),
        parentFolderId: currentFolderId || undefined,
      })
      const newFolder = res.folder ?? res
      // Re-fetch tree to keep hierarchy correct
      const treeRes = await foldersApi.getFolderTree(id)
      const tree = Array.isArray(treeRes) ? treeRes : (treeRes.tree ?? [])
      setFolderTree(tree)
      setAllFolders(flattenTree(tree))
      toast.success('Folder created.')
      setShowFolder(false)
      setFolderName('')
    } catch (err) {
      toast.error(err.message || 'Failed to create folder.')
    }
  }

  const deleteFolder = async (folder) => {
    try {
      await foldersApi.deleteFolder(folder.id)
      if (currentFolderId === folder.id) setCurrentFolderId(folder.parentFolderId ?? null)
      // Re-fetch both tree and docs
      const [treeRes, docsRes] = await Promise.all([
        foldersApi.getFolderTree(id),
        documentsApi.getDocuments({ caseId: id }),
      ])
      const tree = Array.isArray(treeRes) ? treeRes : (treeRes.tree ?? [])
      setFolderTree(tree)
      setAllFolders(flattenTree(tree))
      setAllDocs(Array.isArray(docsRes) ? docsRes : (docsRes.data ?? []))
      toast.success('Folder deleted.')
    } catch (err) {
      toast.error(err.message || 'Failed to delete folder.')
    }
  }

  /* ── Assign / Remove lawyers ─────────────────────────────────────────────── */
  const openAssignModal = async () => {
    setShowAssign(true)
    setAssignForm({ lawyerId: '', accessLevel: 'VIEW' })
    if (allUsers.length === 0) {
      setUsersLoading(true)
      try {
        const data = await authApi.getAllUsers()
        setAllUsers(Array.isArray(data) ? data : (data.data || []))
      } catch { /* non-fatal */ }
      finally { setUsersLoading(false) }
    }
  }

  const submitAssign = async () => {
    if (!assignForm.lawyerId) { toast.warning('Please select a team member.'); return }
    setAssigning(true)
    try {
      await casesApi.assignLawyer(id, assignForm.lawyerId, assignForm.accessLevel)
      // Refresh team list from server
      const res = await casesApi.getAssignments(id)
      setTeam(Array.isArray(res) ? res : (res.assignments ?? []))
      toast.success('Lawyer assigned to case!')
      setShowAssign(false)
    } catch (err) {
      toast.error(err.message || 'Failed to assign lawyer.')
    } finally {
      setAssigning(false)
    }
  }

  const handleAccessLevelChange = async (lawyerId, newLevel) => {
    try {
      await casesApi.assignLawyer(id, lawyerId, newLevel)   // upsert
      setTeam(prev => prev.map(m => m.lawyerId === lawyerId ? { ...m, accessLevel: newLevel } : m))
      toast.success('Access level updated.')
    } catch (err) {
      toast.error(err.message || 'Failed to update access level.')
    }
  }

  const handleRemoveMember = async (lawyerId, name) => {
    try {
      await casesApi.removeAssignment(id, lawyerId)
      setTeam(prev => prev.filter(m => m.lawyerId !== lawyerId))
      toast.success(`${name} removed from case.`)
    } catch (err) {
      toast.error(err.message || 'Failed to remove team member.')
    }
  }

  /* ── Schedule event ─────────────────────────────────────────────────────── */
  const createEvent = async () => {
    if (!eventForm.name || !eventForm.date) { toast.warning('Title and date are required.'); return }
    if (eventForm.date < todayStr) { toast.warning('Cannot schedule events in the past.'); return }
    setEventSaving(true)
    try {
      await eventsApi.createEvent({
        type: eventForm.type,
        name: eventForm.name,
        startTime: toISO(eventForm.date, eventForm.time),
        description: eventForm.description || undefined,
      })
      toast.success('Event scheduled.')
      setShowEvent(false)
      setEventForm({ name: '', date: '', time: '09:00', type: 'HEARING', description: '' })
      // Refresh events
      const res = await eventsApi.getEvents()
      const events = Array.isArray(res) ? res : (res.data ?? [])
      setCaseEvents(events.filter(ev => eventDate(ev) >= todayStr).sort((a, b) => a.startTime?.localeCompare(b.startTime)))
    } catch (err) {
      toast.error(err.message || 'Failed to schedule event.')
    } finally {
      setEventSaving(false)
    }
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="p-6 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-10 w-10 text-secondary mx-auto mb-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <p className="text-sm text-on-surface-variant">Loading case…</p>
        </div>
      </div>
    )
  }

  if (!caseData) return null

  const nextHearing = caseData.metadata?.nextHearing
  const description = caseData.metadata?.description

  return (
    <div className={`p-6 min-h-screen bg-background text-on-surface ${dragOver ? 'outline-dashed outline-4 outline-secondary/40 outline-offset-[-8px]' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false) }}
      onDrop={onDrop}>

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" multiple className="hidden"
        accept=".pdf,.doc,.docx,.txt"
        onChange={e => { const f = Array.from(e.target.files); if (f.length) { setSelectedFiles(f); setShowUpload(true) } }} />

      {/* Drag overlay */}
      {dragOver && (
        <div className="fixed inset-0 z-50 bg-[#0D1F3C]/40 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-2xl p-12 shadow-2xl text-center">
            <span className="material-symbols-outlined text-7xl text-secondary mb-4 block" style={{fontVariationSettings:"'FILL' 1"}}>cloud_upload</span>
            <p className="font-headline font-bold text-2xl text-on-surface">Drop to upload</p>
            <p className="text-sm text-on-surface-variant mt-1">Files will be added to this case</p>
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs font-semibold text-on-primary-container mb-6">
        <button onClick={() => navigate('/cases')} className="hover:text-primary-container/70 transition-colors">Cases</button>
        <span className="material-symbols-outlined text-sm">chevron_right</span>
        <span className="text-on-surface">{caseData.title}</span>
      </nav>

      {/* Case Header */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <h2 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">{caseData.title}</h2>
              <StatusBadge status={caseData.status} />
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {[
                { label: 'Client',       value: caseData.clientName },
                { label: 'Court',        value: caseData.courtName || '—' },
                { label: 'Case Number',  value: caseData.caseNumber, mono: true },
                { label: 'Next Hearing', value: nextHearing ? fmtDate(nextHearing) : '—' },
                { label: 'Created',      value: fmtDate(caseData.createdAt) },
              ].map(f => (
                <div key={f.label}>
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-tighter block">{f.label}</span>
                  <span className={`text-sm font-semibold ${f.mono ? 'font-mono' : ''}`}>{f.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-3 flex-shrink-0">
            <button onClick={() => { setEditForm({ ...caseData, nextHearing: nextHearing || '' }); setShowEdit(true) }}
              className="flex items-center gap-2 px-4 py-2.5 border border-outline-variant/50 text-sm font-bold rounded-lg hover:bg-white transition-all">
              <span className="material-symbols-outlined text-lg">edit</span>Edit
            </button>
            <button onClick={changeStatus}
              className="flex items-center gap-2 px-4 py-2.5 border border-outline-variant/50 text-sm font-bold rounded-lg hover:bg-white transition-all">
              <span className="material-symbols-outlined text-lg">swap_horiz</span>Status
            </button>
          </div>
        </div>
        {description && <p className="mt-3 text-sm text-on-surface-variant leading-relaxed max-w-3xl">{description}</p>}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-surface-container-low mb-6">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`pb-3 text-sm border-b-2 transition-all ${tab === t.key ? 'border-secondary text-primary-container font-bold' : 'border-transparent font-semibold text-on-surface-variant hover:text-on-surface'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            {/* Documents preview */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
              <div className="p-5 flex items-center justify-between border-b border-surface-container-low">
                <h3 className="font-headline font-bold text-base">Documents</h3>
                <button onClick={() => setTab('documents')} className="text-xs font-bold text-secondary hover:underline">View all</button>
              </div>
              <div className="divide-y divide-surface-container-low">
                {allFolders.filter(f => !f.parentFolderId).length > 0 && (
                  <div className="px-5 py-3">
                    <div className="flex flex-wrap gap-2">
                      {allFolders.filter(f => !f.parentFolderId).map(f => (
                        <button key={f.id} onClick={() => { setTab('documents'); setCurrentFolderId(f.id) }}
                          className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg hover:bg-amber-100 transition-colors">
                          <span className="material-symbols-outlined text-amber-500 text-lg" style={{fontVariationSettings:"'FILL' 1"}}>folder</span>
                          <span className="text-xs font-semibold text-on-surface">{f.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {allDocs.filter(d => !d.folderId).length === 0 && allFolders.filter(f => !f.parentFolderId).length === 0 ? (
                  <p className="p-5 text-sm text-on-surface-variant italic">No documents uploaded yet.</p>
                ) : allDocs.filter(d => !d.folderId).slice(0, 3).map(d => {
                  const dType = mimeToType(d.mimeType)
                  return (
                    <div key={d.id} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-container-low/30 transition-colors">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${FILE_COLORS[dType] || 'text-slate-500 bg-slate-50'}`}>
                        <span className="material-symbols-outlined text-lg" style={{fontVariationSettings:"'FILL' 1"}}>{FILE_ICONS[dType] || 'description'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-on-surface truncate">{d.originalName}</p>
                        <p className="text-xs text-on-surface-variant">{fmtFileSize(d.fileSizeBytes)} · {d.processingStatus}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Upcoming Events */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
              <div className="p-5 flex items-center justify-between border-b border-surface-container-low">
                <h3 className="font-headline font-bold text-base">Upcoming Events</h3>
                <button onClick={() => navigate('/calendar')} className="text-xs font-bold text-secondary hover:underline">Calendar</button>
              </div>
              <div className="p-3 space-y-2 divide-y divide-surface-container-low">
                {caseEvents.length === 0 ? (
                  <p className="p-2 text-sm text-on-surface-variant italic">No upcoming events.</p>
                ) : caseEvents.slice(0, 3).map(ev => {
                  const typeColors = { HEARING: 'bg-red-100 text-red-700', MEETING: 'bg-blue-100 text-blue-700', REMINDER: 'bg-amber-100 text-amber-700', DEADLINE: 'bg-purple-100 text-purple-700' }
                  return (
                    <div key={ev.id} className="flex items-center gap-4 py-3 px-2">
                      <div className={`px-2 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${typeColors[ev.type] || 'bg-slate-100 text-slate-600'}`}>{ev.type}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-on-surface">{ev.name}</p>
                        <p className="text-xs text-on-surface-variant">{eventDate(ev)} • {eventTime(ev)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            <div className="bg-surface-container-lowest rounded-xl shadow-sm p-5">
              <h3 className="font-headline font-bold text-base mb-4">Case Summary</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-on-surface-variant">Created</span><span className="font-semibold">{fmtDate(caseData.createdAt)}</span></div>
                <div className="flex justify-between"><span className="text-on-surface-variant">Last Updated</span><span className="font-semibold">{fmtDate(caseData.updatedAt)}</span></div>
                <div className="flex justify-between"><span className="text-on-surface-variant">Documents</span><span className="font-semibold">{allDocs.length}</span></div>
                <div className="flex justify-between"><span className="text-on-surface-variant">Team</span><span className="font-semibold">{team.length}</span></div>
              </div>
            </div>
            <button onClick={() => setShowEvent(true)}
              className="w-full flex items-center gap-3 p-4 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/20 hover:shadow-md transition-all text-left">
              <span className="material-symbols-outlined text-secondary">calendar_month</span>
              <span className="text-sm font-semibold text-on-surface">Schedule an Event</span>
            </button>
          </div>
        </div>
      )}

      {/* ── DOCUMENTS TAB ───────────────────────────────────────────────────── */}
      {tab === 'documents' && (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <p className="text-sm text-on-surface-variant">{allDocs.length} document{allDocs.length !== 1 ? 's' : ''} · {allFolders.length} folder{allFolders.length !== 1 ? 's' : ''} — drag files anywhere to upload</p>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => setShowFolder(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-outline-variant/50 bg-white hover:bg-surface-container-low transition-all">
                <span className="material-symbols-outlined text-base">create_new_folder</span>New Folder
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white shadow-sm hover:opacity-90 transition-all ai-gradient">
                <span className="material-symbols-outlined text-base">upload_file</span>Upload Files
              </button>
            </div>
          </div>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-sm font-semibold mb-4 flex-wrap">
            <button onClick={() => setCurrentFolderId(null)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-colors ${!currentFolderId ? 'text-on-surface bg-surface-container-low' : 'text-secondary hover:bg-surface-container-low'}`}>
              <span className="material-symbols-outlined text-base" style={{fontVariationSettings:"'FILL' 1"}}>folder_special</span>
              <span>Case Root</span>
            </button>
            {caseCrumbs.map(f => (
              <React.Fragment key={f.id}>
                <span className="material-symbols-outlined text-slate-300 text-base">chevron_right</span>
                <button onClick={() => setCurrentFolderId(f.id)}
                  className={`px-2 py-1 rounded-lg transition-colors ${currentFolderId === f.id ? 'text-on-surface bg-surface-container-low font-bold' : 'text-secondary hover:bg-surface-container-low'}`}>
                  {f.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* Folders grid */}
          {visibleFolders.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-3">Folders</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {visibleFolders.map(folder => (
                  <div key={folder.id}
                    className="group relative bg-white rounded-xl border border-surface-container-low shadow-sm hover:shadow-md hover:border-amber-200 transition-all cursor-pointer p-4 flex flex-col items-center text-center"
                    onClick={() => setCurrentFolderId(folder.id)}>
                    <span className="material-symbols-outlined text-5xl text-amber-400 mb-2" style={{fontVariationSettings:"'FILL' 1"}}>folder</span>
                    <p className="text-xs font-bold text-on-surface truncate w-full">{folder.name}</p>
                    <p className="text-[10px] text-on-surface-variant mt-0.5">
                      {allDocs.filter(d => d.folderId === folder.id).length} file(s)
                    </p>
                    <button onClick={e => { e.stopPropagation(); deleteFolder(folder) }}
                      title="Delete folder"
                      className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all">
                      <span className="material-symbols-outlined text-[14px]">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Files table */}
          {visibleDocs.length > 0 && (
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-3">Files</p>
              <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-5 py-2 border-b border-surface-container-low text-[11px] font-bold uppercase tracking-wider text-on-primary-container/50">
                  <div className="col-span-5">Name</div><div className="col-span-2 text-right">Size</div><div className="col-span-2">Status</div><div className="col-span-2">Uploaded</div><div className="col-span-1 text-right">Actions</div>
                </div>
                <div className="divide-y divide-surface-container-low">
                  {visibleDocs.map(d => {
                    const dType = mimeToType(d.mimeType)
                    return (
                      <div key={d.id} className="grid grid-cols-12 gap-2 px-5 py-3.5 hover:bg-surface-container-low/30 transition-colors items-center group">
                        <div className="col-span-5 flex items-center gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${FILE_COLORS[dType] || 'text-slate-500 bg-slate-50'}`}>
                            <span className="material-symbols-outlined text-lg" style={{fontVariationSettings:"'FILL' 1"}}>{FILE_ICONS[dType] || 'description'}</span>
                          </div>
                          <span className="text-sm font-semibold text-on-surface truncate">{d.originalName}</span>
                        </div>
                        <div className="col-span-2 text-right text-xs text-on-surface-variant">{fmtFileSize(d.fileSizeBytes)}</div>
                        <div className="col-span-2">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${d.processingStatus === 'DONE' ? 'bg-emerald-100 text-emerald-700' : d.processingStatus === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                            {d.processingStatus}
                          </span>
                        </div>
                        <div className="col-span-2 text-xs text-on-surface-variant">{relTime(d.createdAt)}</div>
                        <div className="col-span-1 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => deleteDoc(d.id)} title="Delete"
                            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors">
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {visibleFolders.length === 0 && visibleDocs.length === 0 && (
            <div className="py-14 text-center">
              <span className="material-symbols-outlined text-5xl text-slate-200 block mb-2">folder_open</span>
              <p className="text-sm font-semibold text-on-surface-variant">{currentFolderId ? 'This folder is empty' : 'No documents yet'}</p>
              <p className="text-xs text-slate-400 mt-1">Upload files or create a folder to get started</p>
            </div>
          )}
        </div>
      )}

      {/* ── TEAM TAB ────────────────────────────────────────────────────────── */}
      {tab === 'team' && (
        <div className="max-w-2xl">
          <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
            {/* Tab header */}
            <div className="px-6 py-5 border-b border-surface-container-low flex items-center justify-between gap-3">
              <div>
                <h3 className="font-headline font-bold text-primary-container">Assigned Team</h3>
                <p className="text-xs text-on-surface-variant mt-1">{team.length} member{team.length !== 1 ? 's' : ''} assigned to this case</p>
              </div>
              {/* Only system-level ADMINs can assign lawyers (matches backend authorizeAdmin guard) */}
              {session.role === 'ADMIN' && (
                <button onClick={openAssignModal}
                  className="ai-gradient text-white flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold shadow hover:opacity-90 transition-all flex-shrink-0">
                  <span className="material-symbols-outlined text-base">person_add</span>Assign Lawyer
                </button>
              )}
            </div>

            {/* Team list */}
            <div className="divide-y divide-surface-container-low">
              {team.length === 0 ? (
                <div className="py-12 text-center">
                  <span className="material-symbols-outlined text-5xl text-slate-200 block mb-2">group_off</span>
                  <p className="text-sm font-semibold text-on-surface-variant">No team members assigned.</p>
                  {session.role === 'ADMIN' && (
                    <p className="text-xs text-slate-400 mt-1">Click "Assign Lawyer" to add someone.</p>
                  )}
                </div>
              ) : team.map(m => {
                const isCurrentUser = m.email === session.email
                return (
                  <div key={m.lawyerId} className="flex items-center gap-4 px-6 py-4 group hover:bg-surface-container-low/30 transition-colors">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full ai-gradient flex items-center justify-center text-amber-400 font-bold text-sm flex-shrink-0">
                      {initials(m.name)}
                    </div>

                    {/* Name / email */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-on-surface">
                        {m.name}
                        {isCurrentUser && <span className="ml-1.5 text-[10px] text-secondary font-bold">(you)</span>}
                      </p>
                      <p className="text-xs text-on-surface-variant truncate">{m.email}</p>
                    </div>

                    {/* Access level — editable by ADMIN, read-only for others */}
                    {session.role === 'ADMIN' ? (
                      <select
                        value={m.accessLevel}
                        onChange={e => handleAccessLevelChange(m.lawyerId, e.target.value)}
                        className="text-xs font-bold px-2 py-1 rounded-lg border border-outline-variant/40 bg-white focus:outline-none focus:ring-2 focus:ring-secondary/30 cursor-pointer"
                        title="Change access level">
                        <option value="VIEW">VIEW</option>
                        <option value="EDIT">EDIT</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        m.accessLevel === 'ADMIN' ? 'bg-amber-100 text-amber-700' :
                        m.accessLevel === 'EDIT'  ? 'bg-blue-100  text-blue-700'  :
                                                    'bg-slate-100 text-slate-600'
                      }`}>{m.accessLevel}</span>
                    )}

                    {/* Remove button (Admin only, cannot remove yourself) */}
                    {session.role === 'ADMIN' && !isCurrentUser && (
                      <button
                        onClick={() => handleRemoveMember(m.lawyerId, m.name)}
                        title="Remove from case"
                        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all">
                        <span className="material-symbols-outlined text-[18px]">person_remove</span>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ───────────────────────────────────────────────────────── */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit Case">
        <div className="space-y-4">
          <Field label="Case Title"><Input value={editForm.title || ''} onChange={e => setEditForm(f => ({...f, title: e.target.value}))}/></Field>
          <Field label="Client Name"><Input value={editForm.clientName || ''} onChange={e => setEditForm(f => ({...f, clientName: e.target.value}))}/></Field>
          <Field label="Court Name"><Input value={editForm.courtName || ''} onChange={e => setEditForm(f => ({...f, courtName: e.target.value}))}/></Field>
          <Field label="Case Number"><Input value={editForm.caseNumber || ''} onChange={e => setEditForm(f => ({...f, caseNumber: e.target.value}))}/></Field>
          <Field label="Next Hearing Date"><Input type="date" value={editForm.nextHearing?.split('T')[0] || ''} onChange={e => setEditForm(f => ({...f, nextHearing: e.target.value}))}/></Field>
          <Field label="Status">
            <Select value={editForm.status || 'OPEN'} onChange={e => setEditForm(f => ({...f, status: e.target.value}))}>
              <option>OPEN</option><option>CLOSED</option><option>ARCHIVED</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" onClick={() => setShowEdit(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Btn>
          </div>
        </div>
      </Modal>

      {/* ── Upload Modal ─────────────────────────────────────────────────────── */}
      <Modal open={showUpload} onClose={() => { setShowUpload(false); setSelectedFiles([]) }} title="Upload Documents" subtitle="PDF, DOCX, DOC, or TXT files only">
        <div className="space-y-4">
          <div onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = Array.from(e.dataTransfer.files); if (f.length) setSelectedFiles(f) }}
            className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-secondary/50 hover:bg-blue-50/30 transition-all group">
            {selectedFiles.length > 0 ? (
              <div>
                <p className="font-bold text-sm text-on-surface mb-2">{selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} ready</p>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {selectedFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                      <span className="text-xs text-on-surface-variant truncate font-medium">{f.name}</span>
                      <span className="text-[10px] text-slate-400 ml-2 flex-shrink-0">{fmtFileSize(f.size)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <span className="material-symbols-outlined text-5xl text-slate-300 group-hover:text-secondary transition-colors mb-2 block">cloud_upload</span>
                <p className="font-bold text-sm text-on-surface">Click or drag files here</p>
                <p className="text-xs text-slate-400 mt-1">PDF, DOCX, DOC, TXT</p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" onClick={() => { setShowUpload(false); setSelectedFiles([]) }}>Cancel</Btn>
            <Btn variant="primary" onClick={uploadDocs} disabled={!selectedFiles.length || uploading}>
              <span className="material-symbols-outlined text-base">upload</span>
              {uploading ? 'Uploading…' : `Upload ${selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''}`}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* ── Folder Modal ─────────────────────────────────────────────────────── */}
      <Modal open={showFolder} onClose={() => setShowFolder(false)} title="New Folder">
        <div className="space-y-4">
          <Field label="Folder Name">
            <Input autoFocus value={folderName} onChange={e => setFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createFolder()} placeholder="e.g. Witness Statements"/>
          </Field>
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">
            <span className="material-symbols-outlined text-amber-500 text-lg" style={{fontVariationSettings:"'FILL' 1"}}>folder</span>
            <p className="text-sm font-semibold text-on-surface">Inside: <span className="text-secondary">{currentFolder ? currentFolder.name : caseData.title}</span></p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" onClick={() => setShowFolder(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={createFolder}>
              <span className="material-symbols-outlined text-base">create_new_folder</span>Create Folder
            </Btn>
          </div>
        </div>
      </Modal>

      {/* ── Event Modal ──────────────────────────────────────────────────────── */}
      <Modal open={showEvent} onClose={() => setShowEvent(false)} title="Schedule Event">
        <div className="space-y-4">
          <Field label="Title"><Input value={eventForm.name} onChange={e => setEventForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Pre-trial Hearing"/></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date"><Input type="date" value={eventForm.date} min={todayStr} onChange={e => setEventForm(f => ({...f, date: e.target.value}))}/></Field>
            <Field label="Time"><Input type="time" value={eventForm.time} onChange={e => setEventForm(f => ({...f, time: e.target.value}))}/></Field>
          </div>
          <Field label="Type">
            <Select value={eventForm.type} onChange={e => setEventForm(f => ({...f, type: e.target.value}))}>
              <option value="HEARING">Hearing</option><option value="MEETING">Meeting</option><option value="REMINDER">Reminder</option><option value="DEADLINE">Deadline</option>
            </Select>
          </Field>
          <Field label="Notes (optional)">
            <Input value={eventForm.description} onChange={e => setEventForm(f => ({...f, description: e.target.value}))} placeholder="Any additional details…"/>
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" onClick={() => setShowEvent(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={createEvent} disabled={eventSaving}>{eventSaving ? 'Scheduling…' : 'Schedule'}</Btn>
          </div>
        </div>
      </Modal>
      {/* ── Assign Lawyer Modal (Admin only) ──────────────────────────────────── */}
      <Modal open={showAssign} onClose={() => setShowAssign(false)} title="Assign Lawyer to Case">
        <div className="space-y-4">
          {usersLoading ? (
            <div className="py-6 text-center">
              <svg className="animate-spin h-6 w-6 text-secondary mx-auto" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            </div>
          ) : (
            <Field label="Select Team Member">
              <Select
                value={assignForm.lawyerId}
                onChange={e => setAssignForm(f => ({ ...f, lawyerId: e.target.value }))}>
                <option value="">— Choose a user —</option>
                {allUsers
                  .filter(u => !team.some(m => m.lawyerId === u.id))  /* hide already-assigned */
                  .map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email}) · {u.role}
                    </option>
                  ))
                }
              </Select>
            </Field>
          )}

          <Field label="Access Level">
            <Select
              value={assignForm.accessLevel}
              onChange={e => setAssignForm(f => ({ ...f, accessLevel: e.target.value }))}>
              <option value="VIEW">VIEW — Read-only access</option>
              <option value="EDIT">EDIT — Can add documents &amp; notes</option>
              <option value="ADMIN">ADMIN — Full case control</option>
            </Select>
          </Field>

          {/* Access level legend */}
          <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700 space-y-1">
            <p><span className="font-bold">VIEW</span> — Can read case info and documents</p>
            <p><span className="font-bold">EDIT</span> — Can upload documents and add notes</p>
            <p><span className="font-bold">ADMIN</span> — Can edit case details and manage the team</p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" onClick={() => setShowAssign(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={submitAssign} disabled={assigning || !assignForm.lawyerId}>
              <span className="material-symbols-outlined text-base">person_add</span>
              {assigning ? 'Assigning…' : 'Assign'}
            </Btn>
          </div>
        </div>
      </Modal>

    </div>
  )
}
