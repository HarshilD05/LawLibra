import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DB, Auth, fmtDate, fmtFileSize, uid, initials, relTime } from '../store/db.js'

const EXT_TO_TYPE = { pdf:'pdf', doc:'docx', docx:'docx', xls:'xlsx', xlsx:'xlsx', txt:'txt', png:'img', jpg:'img', jpeg:'img', gif:'img', webp:'img' }
import { StatusBadge, Modal, Field, Input, Select, Textarea, Btn, ConfirmModal, toast, Markdown } from '../components/UI.jsx'

const FILE_ICONS  = { pdf:'picture_as_pdf', docx:'article', xlsx:'table_chart', img:'image', txt:'text_snippet' }
const FILE_COLORS = { pdf:'text-red-500 bg-red-50', docx:'text-blue-500 bg-blue-50', xlsx:'text-emerald-500 bg-emerald-50', img:'text-purple-500 bg-purple-50', txt:'text-slate-500 bg-slate-100' }

// In-memory store for actual file blobs (keyed by document id)
const fileStore = window.__lawlibraFileStore || (window.__lawlibraFileStore = new Map())

const openFile = (doc) => {
  const blobUrl = fileStore.get(doc.id)
  if (blobUrl) {
    // For images and PDFs, open in new tab; for others, trigger download
    const viewable = ['pdf', 'img', 'txt']
    if (viewable.includes(doc.type)) {
      window.open(blobUrl, '_blank')
    } else {
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = doc.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  } else {
    toast.info('Preview not available for pre-loaded demo files.')
  }
}

export default function CaseDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const user = Auth.currentUser() || {}
  const [caseData, setCaseData] = useState(() => DB.cases.byId(id))
  const [tab, setTab] = useState('overview')
  const [, forceUpdate] = useState(0)
  const refresh = () => { setCaseData(DB.cases.byId(id)); forceUpdate(n=>n+1) }

  // Edit modal
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState({})

  // Document upload
  const [showUpload, setShowUpload] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [uploadTags, setUploadTags] = useState('')
  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [isFolderUpload, setIsFolderUpload] = useState(false)

  // New folder modal
  const [showFolder, setShowFolder] = useState(false)
  const [folderName, setFolderName] = useState('')

  // Folder navigation inside documents tab
  const [currentFolderId, setCurrentFolderId] = useState(null)


  // Schedule event modal
  const [showEvent, setShowEvent] = useState(false)
  const [eventForm, setEventForm] = useState({ title:'', date:'', time:'09:00', type:'HEARING', location:'', duration:60 })

  useEffect(() => {
    if (!caseData) navigate('/cases')
  }, [caseData])

  if (!caseData) return null

  const allCaseDocs = DB.documents.byCaseId(id)
  const docs = allCaseDocs
  const allCaseFolders = DB.folders.all().filter(f => f.caseId === id)
  const events = DB.events.all().filter(e => e.caseId === id).sort((a,b) => a.date.localeCompare(b.date))
  const team   = (caseData.assignedTo || []).map(uid => DB.users.byId(uid)).filter(Boolean)

  // Folder navigation helpers
  const currentFolder = currentFolderId ? allCaseFolders.find(f => f.id === currentFolderId) : null
  const visibleFolders = allCaseFolders.filter(f => (f.parentId || null) === currentFolderId)
  const visibleDocs = allCaseDocs.filter(d => (d.folderId || null) === currentFolderId)
  const buildCrumbs = (fid) => {
    const path = []; let cur = fid
    while (cur) { const f = allCaseFolders.find(x => x.id === cur); if (!f) break; path.unshift(f); cur = f.parentId || null }
    return path
  }
  const caseCrumbs = buildCrumbs(currentFolderId)

  const openThread = (t) => {
    setActiveThread(t)
    setMessages(DB.messages.byThread(t.id))
  }

  const newThread = () => {
    const t = DB.threads.create({ caseId: id, title: 'New Consultation', createdBy: user.id })
    setThreads(DB.threads.byCaseId(id))
    openThread(t)
  }

  const sendMessage = async () => {
    if (!aiInput.trim() || !activeThread) return
    const userMsg = DB.messages.create({ threadId: activeThread.id, role:'user', content: aiInput.trim() })
    setMessages(DB.messages.byThread(activeThread.id))
    setAiInput('')
    setAiLoading(true)
    await delay(1200)
    const reply = mockAIResponse(aiInput, id)
    DB.messages.create({ threadId: activeThread.id, role:'assistant', content: reply })
    setMessages(DB.messages.byThread(activeThread.id))
    setAiLoading(false)
  }

  const saveEdit = () => {
    DB.cases.update(id, editForm)
    toast.success('Case updated.')
    setShowEdit(false)
    refresh()
  }

  const changeStatus = () => {
    const statuses = ['OPEN','CLOSED','ARCHIVED','PENDING']
    const next = statuses[(statuses.indexOf(caseData.status)+1) % statuses.length]
    DB.cases.update(id, { status: next })
    toast.info(`Status changed to ${next}`)
    refresh()
  }

  const uploadDoc = () => {
    if (!selectedFiles.length) { toast.warning('Select at least one file.'); return }
    const tags = uploadTags ? uploadTags.split(',').map(t => t.trim()).filter(Boolean) : []
    let targetFolderId = currentFolderId

    if (isFolderUpload && selectedFiles.length > 0) {
      // Get the root folder name from the first file's webkitRelativePath
      const firstPath = selectedFiles[0].webkitRelativePath || selectedFiles[0].name
      const rootFolderName = firstPath.split('/')[0] || 'Uploaded Folder'
      const folder = DB.folders.create({ name: rootFolderName, caseId: id, parentId: currentFolderId })
      targetFolderId = folder.id

      // Build sub-folder structure
      const subFolderMap = {} // path -> folderId
      selectedFiles.forEach(file => {
        const relPath = file.webkitRelativePath || file.name
        const parts = relPath.split('/')
        // parts[0] is root folder (already created), build subfolders for parts[1..n-1]
        let parentId = folder.id
        for (let i = 1; i < parts.length - 1; i++) {
          const subPath = parts.slice(0, i + 1).join('/')
          if (!subFolderMap[subPath]) {
            const sub = DB.folders.create({ name: parts[i], caseId: id, parentId })
            subFolderMap[subPath] = sub.id
          }
          parentId = subFolderMap[subPath]
        }
        const ext = file.name.split('.').pop().toLowerCase()
        const newDoc = DB.documents.create({ name: file.name, caseId: id, folderId: parentId, size: file.size, type: EXT_TO_TYPE[ext] || 'pdf', uploadedBy: user.id, tags })
        fileStore.set(newDoc.id, URL.createObjectURL(file))
      })
    } else {
      selectedFiles.forEach(file => {
        const ext = file.name.split('.').pop().toLowerCase()
        const newDoc = DB.documents.create({ name: file.name, caseId: id, folderId: targetFolderId, size: file.size, type: EXT_TO_TYPE[ext] || 'pdf', uploadedBy: user.id, tags })
        fileStore.set(newDoc.id, URL.createObjectURL(file))
      })
    }

    toast.success(`${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} uploaded!`)
    setShowUpload(false)
    setSelectedFiles([])
    setUploadTags('')
    setIsFolderUpload(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''
    forceUpdate(n=>n+1)
  }

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) { setIsFolderUpload(false); setSelectedFiles(files); setShowUpload(true) }
  }, [])

  const handleFileSelect = (e) => {
    const f = Array.from(e.target.files)
    if (f.length) { setIsFolderUpload(false); setSelectedFiles(f); setShowUpload(true) }
  }

  const handleFolderSelect = (e) => {
    const f = Array.from(e.target.files)
    if (f.length) { setIsFolderUpload(true); setSelectedFiles(f); setShowUpload(true) }
  }

  const createFolder = () => {
    if (!folderName.trim()) return
    DB.folders.create({ name: folderName.trim(), caseId: id, parentId: currentFolderId })
    toast.success('Folder created.')
    setShowFolder(false)
    setFolderName('')
    forceUpdate(n=>n+1)
  }

  const deleteFolder = (folder) => {
    // Recursively delete all files and subfolders inside
    const deleteFolderRecursive = (folderId) => {
      // Delete all files in this folder
      DB.documents.all().filter(d => d.folderId === folderId).forEach(d => {
        fileStore.delete(d.id)
        DB.documents.delete(d.id)
      })
      // Recursively delete subfolders
      DB.folders.all().filter(f => f.parentId === folderId).forEach(f => {
        deleteFolderRecursive(f.id)
        DB.folders.delete(f.id)
      })
    }
    deleteFolderRecursive(folder.id)
    DB.folders.delete(folder.id)
    if (currentFolderId === folder.id) setCurrentFolderId(folder.parentId || null)
    toast.success('Folder deleted.')
    forceUpdate(n=>n+1)
  }

  const createEvent = () => {
    if (!eventForm.title || !eventForm.date) { toast.warning('Title and date are required.'); return }
    const todayStr = new Date().toISOString().split('T')[0]
    if (eventForm.date < todayStr) { toast.warning('Cannot schedule events in the past. Please select today or a future date.'); return }
    DB.events.create({ ...eventForm, caseId: id, createdBy: user.id, duration: Number(eventForm.duration) })
    toast.success('Event scheduled.')
    setShowEvent(false)
    setEventForm({ title:'', date:'', time:'09:00', type:'HEARING', location:'', duration:60 })
    forceUpdate(n=>n+1)
  }

  const priorityBadge = { HIGH:'bg-red-100 text-red-700', MEDIUM:'bg-blue-100 text-blue-700', LOW:'bg-slate-100 text-slate-600' }

  const TABS = [
    { key:'overview',  label:'OVERVIEW' },
    { key:'documents', label:'DOCUMENTS' },
    { key:'team',      label:'TEAM' },
  ]

  return (
    <div className={`p-6 min-h-screen bg-background text-on-surface ${dragOver ? 'outline-dashed outline-4 outline-secondary/40 outline-offset-[-8px]' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false) }}
      onDrop={onDrop}>

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" multiple className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.webp"
        onChange={handleFileSelect} />
      <input ref={folderInputRef} type="file" multiple className="hidden"
        webkitdirectory="" mozdirectory="" directory=""
        onChange={handleFolderSelect} />

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
              {caseData.priority && (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${priorityBadge[caseData.priority] || priorityBadge.MEDIUM}`}>
                  {caseData.priority}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {[
                { label:'Client',      value: caseData.clientName },
                { label:'Court',       value: caseData.courtName || '—' },
                { label:'Case Number', value: caseData.caseNumber, mono: true },
                { label:'Type',        value: caseData.type },
                { label:'Next Hearing',value: fmtDate(caseData.nextHearing) },
              ].map(f => (
                <div key={f.label}>
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-tighter block">{f.label}</span>
                  <span className={`text-sm font-semibold ${f.mono ? 'font-mono' : ''}`}>{f.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-3 flex-shrink-0">
            <button onClick={() => { setEditForm({...caseData}); setShowEdit(true) }}
              className="flex items-center gap-2 px-4 py-2.5 border border-outline-variant/50 text-sm font-bold rounded-lg hover:bg-white transition-all">
              <span className="material-symbols-outlined text-lg">edit</span>Edit
            </button>
            <button onClick={changeStatus}
              className="flex items-center gap-2 px-4 py-2.5 border border-outline-variant/50 text-sm font-bold rounded-lg hover:bg-white transition-all">
              <span className="material-symbols-outlined text-lg">swap_horiz</span>Status
            </button>
          </div>
        </div>
        <p className="mt-3 text-sm text-on-surface-variant leading-relaxed max-w-3xl">{caseData.description}</p>
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

      {/* OVERVIEW TAB */}
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
                {allCaseFolders.filter(f => !f.parentId).length > 0 && (
                  <div className="px-5 py-3">
                    <div className="flex flex-wrap gap-2">
                      {allCaseFolders.filter(f => !f.parentId).map(f => (
                        <button key={f.id} onClick={() => { setTab('documents'); setCurrentFolderId(f.id) }}
                          className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg hover:bg-amber-100 transition-colors">
                          <span className="material-symbols-outlined text-amber-500 text-lg" style={{fontVariationSettings:"'FILL' 1"}}>folder</span>
                          <span className="text-xs font-semibold text-on-surface">{f.name}</span>
                          <span className="text-[10px] text-on-surface-variant">({allCaseDocs.filter(d => d.folderId === f.id).length})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {allCaseDocs.filter(d => !d.folderId).length === 0 && allCaseFolders.filter(f => !f.parentId).length === 0 ? (
                  <p className="p-5 text-sm text-on-surface-variant italic">No documents uploaded yet.</p>
                ) : allCaseDocs.filter(d => !d.folderId).slice(0,3).map(d => (
                  <div key={d.id} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-container-low/30 transition-colors">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${FILE_COLORS[d.type] || 'text-slate-500 bg-slate-50'}`}>
                      <span className="material-symbols-outlined text-lg" style={{fontVariationSettings:"'FILL' 1"}}>{FILE_ICONS[d.type] || 'description'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <button onClick={() => openFile(d)} className="text-sm font-semibold text-on-surface truncate hover:text-secondary hover:underline transition-colors text-left block">{d.name}</button>
                      <p className="text-xs text-on-surface-variant">{fmtFileSize(d.size)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Events */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
              <div className="p-5 flex items-center justify-between border-b border-surface-container-low">
                <h3 className="font-headline font-bold text-base">Upcoming Events</h3>
                <button onClick={() => navigate('/calendar')} className="text-xs font-bold text-secondary hover:underline">Calendar</button>
              </div>
              <div className="p-3 space-y-2 divide-y divide-surface-container-low">
                {events.length === 0 ? (
                  <p className="p-2 text-sm text-on-surface-variant italic">No events for this case.</p>
                ) : events.slice(0,3).map(ev => {
                  const typeColors = { HEARING:'bg-red-100 text-red-700', MEETING:'bg-blue-100 text-blue-700', REMINDER:'bg-amber-100 text-amber-700' }
                  return (
                    <div key={ev.id} className="flex items-center gap-4 py-3 px-2">
                      <div className={`px-2 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${typeColors[ev.type] || 'bg-slate-100 text-slate-600'}`}>{ev.type}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-on-surface">{ev.title}</p>
                        <p className="text-xs text-on-surface-variant">{ev.date} • {ev.time} • {ev.location}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="space-y-5">
            {/* Summary */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm p-5">
              <h3 className="font-headline font-bold text-base mb-4">Case Summary</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-on-surface-variant">Filed</span><span className="font-semibold">{fmtDate(caseData.filedAt)}</span></div>
                <div className="flex justify-between"><span className="text-on-surface-variant">Documents</span><span className="font-semibold">{docs.length}</span></div>
                <div className="flex justify-between"><span className="text-on-surface-variant">Events</span><span className="font-semibold">{events.length}</span></div>
                <div className="flex justify-between"><span className="text-on-surface-variant">Team</span><span className="font-semibold">{team.length}</span></div>
                <div className="flex justify-between"><span className="text-on-surface-variant">Priority</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${priorityBadge[caseData.priority] || priorityBadge.MEDIUM}`}>{caseData.priority}</span>
                </div>
              </div>
            </div>
            {/* Schedule event */}
            <button onClick={() => setShowEvent(true)}
              className="w-full flex items-center gap-3 p-4 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/20 hover:shadow-md transition-all text-left">
              <span className="material-symbols-outlined text-secondary">calendar_month</span>
              <span className="text-sm font-semibold text-on-surface">Schedule an Event</span>
            </button>
          </div>
        </div>
      )}

      {/* DOCUMENTS TAB */}
      {tab === 'documents' && (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <p className="text-sm text-on-surface-variant">{allCaseDocs.length} document{allCaseDocs.length !== 1 ? 's' : ''} · {allCaseFolders.length} folder{allCaseFolders.length !== 1 ? 's' : ''} — drag files anywhere to upload</p>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => setShowFolder(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-outline-variant/50 bg-white hover:bg-surface-container-low transition-all">
                <span className="material-symbols-outlined text-base">create_new_folder</span>New Folder
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white shadow-sm hover:opacity-90 transition-all ai-gradient">
                <span className="material-symbols-outlined text-base">upload_file</span>Upload Files
              </button>
              <button onClick={() => folderInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-outline-variant/50 bg-white hover:bg-surface-container-low transition-all">
                <span className="material-symbols-outlined text-base">drive_folder_upload</span>Upload Folder
              </button>
            </div>
          </div>

          {/* Breadcrumb navigation */}
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
                {visibleFolders.map(folder => {
                  const docCount = allCaseDocs.filter(d => d.folderId === folder.id).length
                  const subCount = allCaseFolders.filter(f => f.parentId === folder.id).length
                  return (
                    <div key={folder.id}
                      className="group relative bg-white rounded-xl border border-surface-container-low shadow-sm hover:shadow-md hover:border-amber-200 transition-all cursor-pointer p-4 flex flex-col items-center text-center"
                      onClick={() => setCurrentFolderId(folder.id)}>
                      <span className="material-symbols-outlined text-5xl text-amber-400 mb-2" style={{fontVariationSettings:"'FILL' 1"}}>folder</span>
                      <p className="text-xs font-bold text-on-surface truncate w-full">{folder.name}</p>
                      <p className="text-[10px] text-on-surface-variant mt-0.5">
                        {docCount} file{docCount !== 1 ? 's' : ''}
                        {subCount > 0 ? ` · ${subCount} folder${subCount !== 1 ? 's' : ''}` : ''}
                      </p>
                      <button
                        onClick={e => { e.stopPropagation(); deleteFolder(folder) }}
                        title="Delete folder"
                        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all">
                        <span className="material-symbols-outlined text-[14px]">delete</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Files table */}
          {visibleDocs.length > 0 && (
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-3">Files</p>
              <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-5 py-2 border-b border-surface-container-low text-[11px] font-bold uppercase tracking-wider text-on-primary-container/50">
                  <div className="col-span-5">Name</div><div className="col-span-2 text-right">Size</div><div className="col-span-2">Tags</div><div className="col-span-2">Uploaded</div><div className="col-span-1 text-right">Actions</div>
                </div>
                <div className="divide-y divide-surface-container-low">
                  {visibleDocs.map(d => (
                    <div key={d.id} className="grid grid-cols-12 gap-2 px-5 py-3.5 hover:bg-surface-container-low/30 transition-colors items-center group">
                      <div className="col-span-5 flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${FILE_COLORS[d.type] || 'text-slate-500 bg-slate-50'}`}>
                          <span className="material-symbols-outlined text-lg" style={{fontVariationSettings:"'FILL' 1"}}>{FILE_ICONS[d.type] || 'description'}</span>
                        </div>
                        <button onClick={() => openFile(d)} className="text-sm font-semibold text-on-surface truncate hover:text-secondary hover:underline transition-colors text-left" title="Click to open">{d.name}</button>
                      </div>
                      <div className="col-span-2 text-right text-xs text-on-surface-variant">{fmtFileSize(d.size)}</div>
                      <div className="col-span-2">
                        <div className="flex flex-wrap gap-1">
                          {(d.tags||[]).slice(0,2).map(t => (
                            <span key={t} className="px-1.5 py-0.5 bg-surface-container rounded text-[10px] font-medium text-on-surface-variant">{t}</span>
                          ))}
                        </div>
                      </div>
                      <div className="col-span-2 text-xs text-on-surface-variant">{relTime(d.uploadedAt)}</div>
                      <div className="col-span-1 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => toast.info('Download started (demo)')} title="Download"
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors">
                          <span className="material-symbols-outlined text-[16px]">download</span>
                        </button>
                        <button onClick={() => { DB.documents.delete(d.id); toast.success('File deleted.'); forceUpdate(n=>n+1) }} title="Delete"
                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors">
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {visibleFolders.length === 0 && visibleDocs.length === 0 && (
            <div className="py-14 text-center">
              <span className="material-symbols-outlined text-5xl text-slate-200 block mb-2">folder_open</span>
              <p className="text-sm font-semibold text-on-surface-variant">{currentFolderId ? 'This folder is empty' : 'No documents yet'}</p>
              <p className="text-xs text-slate-400 mt-1">Upload files or create a folder to get started</p>
            </div>
          )}
        </div>
      )}

      {/* TEAM TAB */}
      {tab === 'team' && (
        <div className="max-w-2xl">
          <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-surface-container-low">
              <h3 className="font-headline font-bold text-primary-container">Assigned Team</h3>
              <p className="text-xs text-on-surface-variant mt-1">{team.length} member{team.length !== 1 ? 's' : ''} assigned to this case</p>
            </div>
            <div className="divide-y divide-surface-container-low">
              {team.length === 0 ? (
                <p className="p-6 text-sm text-on-surface-variant italic">No team members assigned.</p>
              ) : team.map(m => (
                <div key={m.id} className="flex items-center gap-4 px-6 py-4">
                  <div className="w-10 h-10 rounded-full ai-gradient flex items-center justify-center text-amber-400 font-bold text-sm flex-shrink-0">
                    {initials(m.name)}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-on-surface">{m.name}</p>
                    <p className="text-xs text-on-surface-variant">{m.email}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${m.role === 'ADMIN' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{m.role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit Case">
        <div className="space-y-4">
          <Field label="Case Title"><Input value={editForm.title||''} onChange={e=>setEditForm(f=>({...f,title:e.target.value}))}/></Field>
          <Field label="Client Name"><Input value={editForm.clientName||''} onChange={e=>setEditForm(f=>({...f,clientName:e.target.value}))}/></Field>
          <Field label="Court Name"><Input value={editForm.courtName||''} onChange={e=>setEditForm(f=>({...f,courtName:e.target.value}))}/></Field>
          <Field label="Next Hearing Date"><Input type="date" value={editForm.nextHearing?.split('T')[0]||''} onChange={e=>setEditForm(f=>({...f,nextHearing:e.target.value}))}/></Field>
          <Field label="Description"><Textarea value={editForm.description||''} onChange={e=>setEditForm(f=>({...f,description:e.target.value}))} rows={3}/></Field>
          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" onClick={() => setShowEdit(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={saveEdit}>Save Changes</Btn>
          </div>
        </div>
      </Modal>

      {/* Upload Modal */}
      <Modal open={showUpload} onClose={() => { setShowUpload(false); setSelectedFiles([]) }} title="Upload Documents" subtitle="Select files from your device to upload to this case">
        <div className="space-y-4">
          {/* Drop zone / file list */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = Array.from(e.dataTransfer.files); if (f.length) setSelectedFiles(f) }}
            className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-secondary/50 hover:bg-blue-50/30 transition-all group">
            {selectedFiles.length > 0 ? (
              <div>
                <div className="flex items-center justify-center gap-2 mb-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <span className="material-symbols-outlined text-emerald-600 text-xl" style={{fontVariationSettings:"'FILL' 1"}}>task_alt</span>
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm text-on-surface">{selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} ready</p>
                    <p className="text-xs text-secondary font-semibold">Click to change selection</p>
                  </div>
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
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
                <p className="text-xs text-slate-400 mt-1">PDF, Word, Excel, images and more</p>
              </div>
            )}
          </div>

          {/* Tags */}
          <Field label="Tags (optional, comma separated)">
            <Input value={uploadTags} onChange={e => setUploadTags(e.target.value)} placeholder="e.g. evidence, contract, exhibit" />
          </Field>

          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" onClick={() => { setShowUpload(false); setSelectedFiles([]) }}>Cancel</Btn>
            <Btn variant="primary" onClick={uploadDoc} disabled={!selectedFiles.length}>
              <span className="material-symbols-outlined text-base">upload</span>
              Upload {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* Folder Modal */}
      <Modal open={showFolder} onClose={() => setShowFolder(false)} title="New Folder" subtitle="Create a folder to organize case documents">
        <div className="space-y-4">
          <Field label="Folder Name"><Input autoFocus value={folderName} onChange={e=>setFolderName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createFolder()} placeholder="e.g. Witness Statements"/></Field>
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">
            <span className="material-symbols-outlined text-amber-500 text-lg" style={{fontVariationSettings:"'FILL' 1"}}>folder</span>
            <p className="text-sm font-semibold text-on-surface">Inside: <span className="text-secondary">{caseData.title}</span></p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" onClick={() => setShowFolder(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={createFolder}>
              <span className="material-symbols-outlined text-base">create_new_folder</span>Create Folder
            </Btn>
          </div>
        </div>
      </Modal>

      {/* Event Modal */}
      <Modal open={showEvent} onClose={() => setShowEvent(false)} title="Schedule Event">
        <div className="space-y-4">
          <Field label="Title"><Input value={eventForm.title} onChange={e=>setEventForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Pre-trial Hearing"/></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date"><Input type="date" value={eventForm.date} min={new Date().toISOString().split('T')[0]} onChange={e=>setEventForm(f=>({...f,date:e.target.value}))}/></Field>
            <Field label="Time"><Input type="time" value={eventForm.time} onChange={e=>setEventForm(f=>({...f,time:e.target.value}))}/></Field>
          </div>
          <Field label="Type">
            <Select value={eventForm.type} onChange={e=>setEventForm(f=>({...f,type:e.target.value}))}>
              <option value="HEARING">Hearing</option><option value="MEETING">Meeting</option><option value="REMINDER">Reminder</option>
            </Select>
          </Field>
          <Field label="Location"><Input value={eventForm.location} onChange={e=>setEventForm(f=>({...f,location:e.target.value}))} placeholder="e.g. US District Court"/></Field>
          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" onClick={() => setShowEvent(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={createEvent}>Schedule</Btn>
          </div>
        </div>
      </Modal>
    </div>
  )
}
