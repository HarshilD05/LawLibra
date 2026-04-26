import React, { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { DB, Auth, fmtFileSize, relTime } from '../store/db.js'
import { ConfirmModal, toast } from '../components/UI.jsx'

const FILE_ICONS  = { pdf:'picture_as_pdf', docx:'article', xlsx:'table_chart', txt:'text_snippet', img:'image', default:'description' }
const FILE_COLORS = {
  pdf:'text-red-500 bg-red-50', docx:'text-blue-500 bg-blue-50',
  xlsx:'text-emerald-500 bg-emerald-50', txt:'text-slate-500 bg-slate-100',
  img:'text-purple-500 bg-purple-50', default:'text-slate-400 bg-slate-50',
}
const EXT_TO_TYPE = { pdf:'pdf', doc:'docx', docx:'docx', xls:'xlsx', xlsx:'xlsx', txt:'txt', png:'img', jpg:'img', jpeg:'img', gif:'img', webp:'img' }

// In-memory store for actual file blobs (keyed by document id)
const fileStore = window.__lawlibraFileStore || (window.__lawlibraFileStore = new Map())

const openFile = (doc) => {
  const blobUrl = fileStore.get(doc.id)
  if (blobUrl) {
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

/* ─── Small modal shell ─── */
function Dialog({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[8000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-headline font-bold text-base text-on-surface">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
            <span className="material-symbols-outlined text-slate-400 text-lg">close</span>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

export default function Documents() {
  const navigate = useNavigate()
  const user = Auth.currentUser() || {}
  const [, forceUpdate] = useState(0)
  const refresh = () => forceUpdate(n => n + 1)

  /* ── Navigation ── */
  const [currentFolderId, setCurrentFolderId] = useState(null)

  /* ── Dropdown "New+" ── */
  const [showNewMenu, setShowNewMenu] = useState(false)
  const newMenuRef = useRef(null)

  /* ── Modals ── */
  const [modal, setModal] = useState(null) // 'upload' | 'folder' | 'move'
  const [moveTarget, setMoveTarget] = useState(null)
  const [confirmDoc, setConfirmDoc] = useState(null)
  const [confirmFolder, setConfirmFolder] = useState(null)

  /* ── Upload state ── */
  const [selectedFiles, setSelectedFiles] = useState([])
  const [uploadCaseId, setUploadCaseId] = useState('')
  const [uploadTags, setUploadTags] = useState('')
  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)

  /* ── Folder create ── */
  const [newFolderName, setNewFolderName] = useState('')

  /* ── Search ── */
  const [query, setQuery] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const cases      = DB.cases.all()
  const allDocs    = DB.documents.all()
  const allFolders = DB.folders.all()

  /* ── Folder helpers ── */
  const currentFolder  = currentFolderId ? allFolders.find(f => f.id === currentFolderId) : null
  const visibleFolders = allFolders.filter(f => (f.parentId || null) === currentFolderId)
  const visibleDocs    = allDocs.filter(d => {
    const inFolder = (d.folderId || null) === currentFolderId
    const q = query.toLowerCase()
    return inFolder && (!q || d.name?.toLowerCase().includes(q))
  })

  /* Breadcrumb */
  const buildCrumbs = (id) => {
    const path = []; let cur = id
    while (cur) { const f = allFolders.find(x => x.id === cur); if (!f) break; path.unshift(f); cur = f.parentId || null }
    return path
  }
  const crumbs = buildCrumbs(currentFolderId)

  /* Stats (global) */
  const totalSize = allDocs.reduce((s, d) => s + (d.size || 0), 0)

  /* ── Drag & drop ── */
  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) { setSelectedFiles(files); setModal('upload') }
  }, [])

  /* ── Upload ── */
  const doUpload = () => {
    if (!selectedFiles.length) { toast.warning('Select at least one file.'); return }
    const tags = uploadTags ? uploadTags.split(',').map(t => t.trim()).filter(Boolean) : []
    selectedFiles.forEach(file => {
      const ext  = file.name.split('.').pop().toLowerCase()
      const newDoc = DB.documents.create({ name: file.name, caseId: uploadCaseId || null, folderId: currentFolderId, size: file.size, type: EXT_TO_TYPE[ext] || 'pdf', uploadedBy: user.id, tags })
      fileStore.set(newDoc.id, URL.createObjectURL(file))
    })
    toast.success(`${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} uploaded!`)
    setModal(null); setSelectedFiles([]); setUploadCaseId(''); setUploadTags('')
    if (fileInputRef.current)   fileInputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''
    refresh()
  }

  /* ── Create folder ── */
  const doCreateFolder = () => {
    if (!newFolderName.trim()) { toast.warning('Folder name required.'); return }
    DB.folders.create({ name: newFolderName.trim(), parentId: currentFolderId, caseId: null })
    toast.success('Folder created!'); setModal(null); setNewFolderName(''); refresh()
  }

  /* ── Move doc to folder ── */
  const doMove = (folderId) => {
    if (!moveTarget) return
    DB.documents.update(moveTarget.id, { folderId })
    toast.success('File moved!'); setModal(null); setMoveTarget(null); refresh()
  }

  const fc = (t) => FILE_COLORS[t] || FILE_COLORS.default
  const fi = (t) => FILE_ICONS[t]  || FILE_ICONS.default

  return (
    <div
      className={`p-6 min-h-screen bg-background ${dragOver ? 'outline-dashed outline-4 outline-secondary/40 outline-offset-[-8px]' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false) }}
      onDrop={onDrop}
      onClick={() => showNewMenu && setShowNewMenu(false)}>

      {/* Drag overlay */}
      {dragOver && (
        <div className="fixed inset-0 z-50 bg-[#0D1F3C]/40 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-2xl p-12 shadow-2xl text-center">
            <span className="material-symbols-outlined text-7xl text-secondary mb-4 block" style={{fontVariationSettings:"'FILL' 1"}}>cloud_upload</span>
            <p className="font-headline font-bold text-2xl text-on-surface">Drop to upload</p>
            <p className="text-sm text-on-surface-variant mt-1">Files will be added to the current folder</p>
          </div>
        </div>
      )}

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" multiple className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.webp"
        onChange={e => { const f = Array.from(e.target.files); if (f.length) { setSelectedFiles(f); setModal('upload') } }} />
      <input ref={folderInputRef} type="file" className="hidden"
        webkitdirectory="" mozdirectory="" directory=""
        onChange={e => { const f = Array.from(e.target.files); if (f.length) { setSelectedFiles(f); setModal('upload') } }} />

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="font-headline font-extrabold text-2xl text-on-surface">Documents</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            {allDocs.length} files · {allFolders.length} folders · {fmtFileSize(totalSize)} total — drag files anywhere to upload
          </p>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
            <input value={query} onChange={e => setQuery(e.target.value)}
              className="w-52 bg-white border border-outline-variant/30 rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-secondary-container/50 shadow-sm"
              placeholder="Search files…" />
          </div>

          {/* "New +" dropdown button */}
          <div className="relative" ref={newMenuRef} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowNewMenu(v => !v)}
              className="ai-gradient text-white flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold shadow-lg hover:opacity-90 transition-all select-none">
              <span className="material-symbols-outlined text-lg">add</span>
              New
              <span className="material-symbols-outlined text-base">{showNewMenu ? 'expand_less' : 'expand_more'}</span>
            </button>

            {showNewMenu && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-2xl border border-outline-variant/20 overflow-hidden z-50">
                <p className="px-4 pt-3 pb-1 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Create</p>
                <button
                  onClick={() => { setShowNewMenu(false); setModal('folder') }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors text-left">
                  <span className="material-symbols-outlined text-xl text-amber-500" style={{fontVariationSettings:"'FILL' 1"}}>create_new_folder</span>
                  <span className="text-sm font-semibold text-on-surface">New Folder</span>
                </button>

                <hr className="border-surface-container-low mx-3" />
                <p className="px-4 pt-3 pb-1 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Upload</p>
                <button
                  onClick={() => { setShowNewMenu(false); fileInputRef.current?.click() }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors text-left">
                  <span className="material-symbols-outlined text-xl text-blue-500" style={{fontVariationSettings:"'FILL' 1"}}>upload_file</span>
                  <span className="text-sm font-semibold text-on-surface">Upload Files</span>
                </button>
                <button
                  onClick={() => { setShowNewMenu(false); folderInputRef.current?.click() }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors text-left">
                  <span className="material-symbols-outlined text-xl text-emerald-500" style={{fontVariationSettings:"'FILL' 1"}}>drive_folder_upload</span>
                  <span className="text-sm font-semibold text-on-surface">Upload Folder</span>
                </button>
                <div className="h-2" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-1 text-sm font-semibold mb-5 flex-wrap">
        <button onClick={() => setCurrentFolderId(null)}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-colors ${!currentFolderId ? 'text-on-surface bg-surface-container-low' : 'text-secondary hover:bg-surface-container-low'}`}>
          <span className="material-symbols-outlined text-base" style={{fontVariationSettings:"'FILL' 1"}}>home</span>
          <span>My Drive</span>
        </button>
        {crumbs.map(f => (
          <React.Fragment key={f.id}>
            <span className="material-symbols-outlined text-slate-300 text-base">chevron_right</span>
            <button onClick={() => setCurrentFolderId(f.id)}
              className={`px-2 py-1 rounded-lg transition-colors ${currentFolderId === f.id ? 'text-on-surface bg-surface-container-low font-bold' : 'text-secondary hover:bg-surface-container-low'}`}>
              {f.name}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* ── Empty state ── */}
      {visibleFolders.length === 0 && visibleDocs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <span className="material-symbols-outlined text-8xl text-slate-200 block mb-4" style={{fontVariationSettings:"'FILL' 1"}}>folder_open</span>
          <p className="text-lg font-bold text-on-surface-variant">{query ? 'No files match your search' : 'This folder is empty'}</p>
          <p className="text-sm text-slate-400 mt-1 mb-6">Drop files here, or use the New button above</p>
          <button onClick={() => setShowNewMenu(true)}
            className="ai-gradient text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:opacity-90 transition-all flex items-center gap-2">
            <span className="material-symbols-outlined">add</span>New
          </button>
        </div>
      )}

      {/* ── Folders section ── */}
      {visibleFolders.length > 0 && (
        <div className="mb-8">
          <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-3">Folders</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {visibleFolders.map(folder => {
              const docCount = allDocs.filter(d => d.folderId === folder.id).length
              const subCount = allFolders.filter(f => f.parentId === folder.id).length
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
                  {/* Actions */}
                  <button
                    onClick={e => { e.stopPropagation(); setConfirmFolder(folder) }}
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

      {/* ── Files section ── */}
      {visibleDocs.length > 0 && (
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-3">Files</p>
          <div className="bg-white rounded-2xl shadow-sm border border-surface-container-low overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-surface-container-low bg-slate-50/60 text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
              <div className="col-span-5">Name</div>
              <div className="col-span-2">Linked Case</div>
              <div className="col-span-2 text-right">Size</div>
              <div className="col-span-2">Uploaded</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>
            <div className="divide-y divide-surface-container-low/60">
              {visibleDocs.map(d => {
                const c = DB.cases.byId(d.caseId)
                return (
                  <div key={d.id} className="grid grid-cols-12 gap-2 px-5 py-3.5 hover:bg-slate-50/50 transition-colors items-center group">
                    <div className="col-span-5 flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${fc(d.type)}`}>
                        <span className="material-symbols-outlined text-lg" style={{fontVariationSettings:"'FILL' 1"}}>{fi(d.type)}</span>
                      </div>
                      <div className="min-w-0">
                        <button onClick={() => openFile(d)} className="text-sm font-semibold text-on-surface truncate hover:text-secondary hover:underline transition-colors text-left" title="Click to open">{d.name}</button>
                        <div className="flex gap-1 mt-0.5 flex-wrap">
                          {(d.tags || []).slice(0, 2).map(t => (
                            <span key={t} className="px-1 py-0.5 bg-surface-container rounded text-[9px] font-bold text-on-surface-variant uppercase">{t}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2 min-w-0">
                      {c
                        ? <button onClick={() => navigate(`/cases/${c.id}`)} className="text-xs font-semibold text-secondary hover:underline truncate block">{c.title}</button>
                        : <span className="text-xs text-slate-400 italic">—</span>}
                    </div>
                    <div className="col-span-2 text-right text-xs text-on-surface-variant">{fmtFileSize(d.size)}</div>
                    <div className="col-span-2 text-xs text-on-surface-variant">{relTime(d.uploadedAt)}</div>
                    <div className="col-span-1 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setMoveTarget(d); setModal('move') }} title="Move to folder"
                        className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors">
                        <span className="material-symbols-outlined text-[16px]">drive_file_move</span>
                      </button>
                      <button onClick={() => toast.info('Download started (demo)')} title="Download"
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors">
                        <span className="material-symbols-outlined text-[16px]">download</span>
                      </button>
                      <button onClick={() => setConfirmDoc(d)} title="Delete"
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors">
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="px-5 py-2.5 border-t border-surface-container-low bg-slate-50/40 text-xs text-on-surface-variant font-medium">
              {visibleDocs.length} file{visibleDocs.length !== 1 ? 's' : ''} · {fmtFileSize(visibleDocs.reduce((s, d) => s + (d.size || 0), 0))}
            </div>
          </div>
        </div>
      )}

      {/* ══ UPLOAD MODAL ══ */}
      <Dialog open={modal === 'upload'} onClose={() => { setModal(null); setSelectedFiles([]) }} title="Upload Files">
        <div className="space-y-4">
          {/* Drop zone */}
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
                    <p className="text-xs text-secondary font-semibold cursor-pointer">Click to change</p>
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

          {/* Destination folder (read-only, shows current) */}
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
            <span className="material-symbols-outlined text-amber-500 text-xl" style={{fontVariationSettings:"'FILL' 1"}}>folder</span>
            <div>
              <p className="text-[10px] font-bold uppercase text-amber-700">Uploading to</p>
              <p className="text-sm font-semibold text-on-surface">{currentFolder ? currentFolder.name : 'My Drive (Root)'}</p>
            </div>
          </div>

          {/* Link to case */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">Link to Case (optional)</label>
            <select value={uploadCaseId} onChange={e => setUploadCaseId(e.target.value)}
              className="w-full border border-outline-variant/30 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-secondary-container/50 bg-white">
              <option value="">— None —</option>
              {cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">Tags (comma separated)</label>
            <input value={uploadTags} onChange={e => setUploadTags(e.target.value)}
              placeholder="e.g. evidence, contract, 2025"
              className="w-full border border-outline-variant/30 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-secondary-container/50" />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button onClick={() => { setModal(null); setSelectedFiles([]) }}
              className="px-4 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-semibold hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button onClick={doUpload} disabled={!selectedFiles.length}
              className="px-5 py-2.5 ai-gradient text-white rounded-xl text-sm font-bold shadow hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-2">
              <span className="material-symbols-outlined text-base">upload</span>
              Upload {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''}
            </button>
          </div>
        </div>
      </Dialog>

      {/* ══ NEW FOLDER MODAL ══ */}
      <Dialog open={modal === 'folder'} onClose={() => { setModal(null); setNewFolderName('') }} title="Create New Folder">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">Folder Name</label>
            <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doCreateFolder()}
              placeholder="e.g. Witness Statements"
              className="w-full border border-outline-variant/30 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-secondary-container/50" />
          </div>
          {/* Location chip */}
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">
            <span className="material-symbols-outlined text-amber-500 text-lg" style={{fontVariationSettings:"'FILL' 1"}}>folder</span>
            <p className="text-sm font-semibold text-on-surface">Inside: <span className="text-secondary">{currentFolder ? currentFolder.name : 'My Drive (Root)'}</span></p>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button onClick={() => { setModal(null); setNewFolderName('') }}
              className="px-4 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-semibold hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={doCreateFolder}
              className="px-5 py-2.5 ai-gradient text-white rounded-xl text-sm font-bold shadow hover:opacity-90 transition-all flex items-center gap-2">
              <span className="material-symbols-outlined text-base">create_new_folder</span>Create Folder
            </button>
          </div>
        </div>
      </Dialog>

      {/* ══ MOVE TO FOLDER MODAL ══ */}
      <Dialog open={modal === 'move'} onClose={() => { setModal(null); setMoveTarget(null) }}
        title={`Move "${moveTarget?.name?.slice(0, 30) || 'File'}"`}>
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {/* Root option */}
          <button onClick={() => doMove(null)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${(moveTarget?.folderId || null) === null ? 'border-secondary bg-secondary-container/10 font-bold' : 'border-slate-100 hover:border-secondary/30 hover:bg-slate-50'}`}>
            <span className="material-symbols-outlined text-2xl text-slate-400">home</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-on-surface">My Drive (Root)</p>
              <p className="text-xs text-on-surface-variant">Top level, no folder</p>
            </div>
            {(moveTarget?.folderId || null) === null && <span className="material-symbols-outlined text-secondary">check_circle</span>}
          </button>

          {allFolders.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-on-surface-variant">No folders yet.</p>
              <button onClick={() => { setModal('folder'); setMoveTarget(null) }}
                className="mt-2 text-xs text-secondary font-bold hover:underline">Create a folder first →</button>
            </div>
          )}

          {allFolders.map(folder => (
            <button key={folder.id} onClick={() => doMove(folder.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${moveTarget?.folderId === folder.id ? 'border-secondary bg-secondary-container/10 font-bold' : 'border-slate-100 hover:border-secondary/30 hover:bg-slate-50'}`}>
              <span className="material-symbols-outlined text-2xl text-amber-400" style={{fontVariationSettings:"'FILL' 1"}}>folder</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-on-surface">{folder.name}</p>
                <p className="text-xs text-on-surface-variant">{allDocs.filter(d => d.folderId === folder.id).length} files</p>
              </div>
              {moveTarget?.folderId === folder.id && <span className="material-symbols-outlined text-secondary">check_circle</span>}
            </button>
          ))}
        </div>
        <div className="flex justify-end pt-4 mt-2 border-t border-slate-100">
          <button onClick={() => { setModal(null); setMoveTarget(null) }}
            className="px-4 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-semibold hover:bg-slate-50 transition-colors">Cancel</button>
        </div>
      </Dialog>

      {/* ── Confirm delete file ── */}
      <ConfirmModal open={!!confirmDoc} onClose={() => setConfirmDoc(null)}
        onConfirm={() => { DB.documents.delete(confirmDoc.id); toast.success('File deleted.'); refresh() }}
        title="Delete File" message={`Permanently delete "${confirmDoc?.name}"?`} confirmLabel="Delete" danger />

      {/* ── Confirm delete folder ── */}
      <ConfirmModal open={!!confirmFolder} onClose={() => setConfirmFolder(null)}
        onConfirm={() => {
          const deleteFolderRecursive = (folderId) => {
            DB.documents.all().filter(d => d.folderId === folderId).forEach(d => {
              fileStore.delete(d.id)
              DB.documents.delete(d.id)
            })
            DB.folders.all().filter(f => f.parentId === folderId).forEach(f => {
              deleteFolderRecursive(f.id)
              DB.folders.delete(f.id)
            })
          }
          deleteFolderRecursive(confirmFolder.id)
          DB.folders.delete(confirmFolder.id)
          if (currentFolderId === confirmFolder.id) setCurrentFolderId(null)
          toast.success('Folder deleted.'); refresh()
        }}
        title="Delete Folder" message={`Delete "${confirmFolder?.name}"? This will permanently delete all files and subfolders inside.`} confirmLabel="Delete" danger />
    </div>
  )
}
