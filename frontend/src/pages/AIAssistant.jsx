import React, { useState, useRef, useEffect } from 'react'
import { DB, Auth, mockAIResponse, delay, initials, relTime } from '../store/db.js'
import { Markdown, toast } from '../components/UI.jsx'

const SUGGESTIONS = [
  'What are the key deadlines in my open cases?',
  'Draft a letter of demand for breach of contract',
  'Summarize best practices for cross-examination',
  'What documents are typically needed for civil litigation?',
  'Explain the difference between arbitration and mediation',
  'How do I file a motion for summary judgment?',
]

export default function AIAssistant() {
  const user = Auth.currentUser() || {}
  const [threads, setThreads] = useState(() => DB.threads.all())
  const [activeThread, setActiveThread] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [renaming, setRenaming] = useState(null)
  const [renameVal, setRenameVal] = useState('')
  const [chatMode, setChatMode] = useState('general')   // 'general' | 'case'
  const [selectedCaseId, setSelectedCaseId] = useState('')
  const [, forceUpdate] = useState(0)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages, loading])

  const cases = DB.cases.all()

  const openThread = (t) => {
    setActiveThread(t)
    setMessages(DB.messages.byThread(t.id))
    if (t.caseId) { setChatMode('case'); setSelectedCaseId(t.caseId) }
    inputRef.current?.focus()
  }

  const newThread = () => {
    const caseId = chatMode === 'case' && selectedCaseId ? selectedCaseId : null
    const caseTitle = caseId ? (DB.cases.byId(caseId)?.title || 'Case Chat') : null
    const t = DB.threads.create({ caseId, title: caseTitle || 'New Chat', createdBy: user.id })
    setThreads(DB.threads.all())
    openThread(t)
  }

  const deleteThread = (id) => {
    DB.threads.delete(id)
    if (activeThread?.id === id) { setActiveThread(null); setMessages([]) }
    setThreads(DB.threads.all())
  }

  const startRename = (t) => { setRenaming(t.id); setRenameVal(t.title) }
  const saveRename = () => {
    if (renameVal.trim()) {
      DB.threads.update(renaming, { title: renameVal.trim() })
      setThreads(DB.threads.all())
      if (activeThread?.id === renaming) setActiveThread(t => ({...t, title: renameVal.trim()}))
    }
    setRenaming(null)
  }

  const activeCaseId = activeThread?.caseId || (chatMode === 'case' ? selectedCaseId : null) || null

  const send = async (msg) => {
    const text = (msg || input).trim()
    if (!text) return
    const caseId = activeCaseId
    if (!activeThread) {
      const caseTitle = caseId ? (DB.cases.byId(caseId)?.title || 'Case Chat') : null
      const t = DB.threads.create({ caseId, title: caseTitle ? `${caseTitle.slice(0,30)}: ${text.slice(0,20)}` : text.slice(0, 42), createdBy: user.id })
      setThreads(DB.threads.all())
      setActiveThread(t)
      setMessages([])
      DB.messages.create({ threadId: t.id, role:'user', content: text })
      setMessages(DB.messages.byThread(t.id))
      setInput('')
      setLoading(true)
      await delay(1200 + Math.random()*600)
      const reply = mockAIResponse(text, caseId)
      DB.messages.create({ threadId: t.id, role:'assistant', content: reply })
      setMessages(DB.messages.byThread(t.id))
      setLoading(false)
      setThreads(DB.threads.all())
      return
    }
    DB.messages.create({ threadId: activeThread.id, role:'user', content: text })
    setMessages(DB.messages.byThread(activeThread.id))
    setInput('')
    setLoading(true)
    await delay(1200 + Math.random()*600)
    const reply = mockAIResponse(text, caseId)
    DB.messages.create({ threadId: activeThread.id, role:'assistant', content: reply })
    setMessages(DB.messages.byThread(activeThread.id))
    setLoading(false)
    if (activeThread.title === 'New Chat') {
      DB.threads.update(activeThread.id, { title: text.slice(0, 42) })
      setThreads(DB.threads.all())
      setActiveThread(t => ({...t, title: text.slice(0, 42)}))
    }
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-surface overflow-hidden">

      {/* Thread sidebar */}
      <aside className="w-64 flex-shrink-0 bg-surface-container-lowest border-r border-surface-container-low flex flex-col">
        <div className="p-4 border-b border-surface-container-low">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-xl ai-gradient flex items-center justify-center">
              <span className="material-symbols-outlined text-amber-400 text-lg" style={{fontVariationSettings:"'FILL' 1"}}>auto_awesome</span>
            </div>
            <div>
              <h2 className="font-headline font-bold text-sm text-on-surface">Libra AI</h2>
              <p className="text-[10px] text-on-surface-variant">Legal Intelligence</p>
            </div>
          </div>

          {/* Mode Toggle */}
          <div className="flex rounded-lg border border-outline-variant/40 overflow-hidden text-xs font-bold mb-3 bg-white">
            <button onClick={() => { setChatMode('general'); setSelectedCaseId('') }}
              className={`flex-1 py-2 transition-colors ${chatMode === 'general' ? 'bg-[#0D1F3C] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              General
            </button>
            <button onClick={() => setChatMode('case')}
              className={`flex-1 py-2 transition-colors ${chatMode === 'case' ? 'bg-[#0D1F3C] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              Case-Specific
            </button>
          </div>

          {/* Case selector (case mode only) */}
          {chatMode === 'case' && (
            <select value={selectedCaseId} onChange={e => setSelectedCaseId(e.target.value)}
              className="w-full mb-3 rounded-lg border border-outline-variant/40 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-secondary-container/50 bg-white">
              <option value="">— Select a case —</option>
              {cases.map(c => <option key={c.id} value={c.id}>{c.title.slice(0,35)}</option>)}
            </select>
          )}

          <button onClick={newThread}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white font-bold text-xs shadow-md hover:opacity-90 transition-opacity ai-gradient">
            <span className="material-symbols-outlined text-base">add</span>New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          <p className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Recent Chats</p>
          {threads.length === 0 && <p className="px-3 text-xs text-on-surface-variant italic">No chats yet.</p>}
          {threads.map(t => (
            <div key={t.id} className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${activeThread?.id === t.id ? 'bg-white shadow-sm border border-outline-variant/20' : 'hover:bg-surface-container-low'}`}
              onClick={() => openThread(t)}>
              {t.caseId && <span className="material-symbols-outlined text-[12px] text-secondary flex-shrink-0">folder_open</span>}
              {renaming === t.id ? (
                <input autoFocus value={renameVal} onChange={e=>setRenameVal(e.target.value)}
                  onBlur={saveRename} onKeyDown={e => { if (e.key==='Enter') saveRename(); if (e.key==='Escape') setRenaming(null) }}
                  className="flex-1 text-xs bg-transparent outline-none border-b border-secondary" onClick={e=>e.stopPropagation()} />
              ) : (
                <span className={`flex-1 text-xs truncate ${activeThread?.id===t.id ? 'font-bold text-primary-container' : 'font-medium text-on-surface-variant'}`}>{t.title}</span>
              )}
              <div className="flex-shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={e=>{e.stopPropagation();startRename(t)}} className="p-1 hover:text-primary-container rounded transition-colors text-on-surface-variant">
                  <span className="material-symbols-outlined text-[14px]">edit</span>
                </button>
                <button onClick={e=>{e.stopPropagation();deleteThread(t.id)}} className="p-1 hover:text-red-600 rounded transition-colors text-on-surface-variant">
                  <span className="material-symbols-outlined text-[14px]">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeThread ? (
          /* Welcome screen */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center overflow-y-auto">
            <div className="w-20 h-20 rounded-2xl ai-gradient flex items-center justify-center mb-6 shadow-2xl">
              <span className="material-symbols-outlined text-amber-400 text-4xl" style={{fontVariationSettings:"'FILL' 1"}}>balance</span>
            </div>
            <h2 className="font-headline font-black text-2xl text-on-surface mb-2">Libra AI Counsel</h2>
            <p className="text-on-surface-variant text-sm max-w-md mb-3 leading-relaxed">
              Your sovereign legal intelligence. Ask me anything about law, strategy, case analysis, drafting, or legal research.
            </p>

            {/* Mode indicator */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold mb-8 ${chatMode === 'case' && selectedCaseId ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-low text-on-surface-variant'}`}>
              <span className="material-symbols-outlined text-[14px]">{chatMode === 'case' && selectedCaseId ? 'folder_open' : 'public'}</span>
              {chatMode === 'case' && selectedCaseId
                ? `Case: ${DB.cases.byId(selectedCaseId)?.title?.slice(0,40) || 'Unknown'}`
                : 'General Legal Questions'}
            </div>

            {chatMode === 'case' && !selectedCaseId && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-6">
                ← Select a case from the sidebar to get case-specific AI analysis
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl mb-10">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)}
                  className="text-left px-4 py-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm hover:shadow-md hover:border-secondary/30 transition-all text-sm text-on-surface-variant font-medium hover:text-on-surface group">
                  <span className="material-symbols-outlined text-secondary text-base mr-2 align-middle" style={{fontVariationSettings:"'FILL' 1"}}>auto_awesome</span>
                  {s}
                </button>
              ))}
            </div>
            <div className="w-full max-w-2xl flex gap-3">
              <input value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&send()}
                ref={inputRef}
                className="flex-1 bg-surface-container-lowest border border-outline-variant/40 shadow-sm rounded-2xl px-5 py-3.5 text-sm outline-none focus:ring-2 focus:ring-secondary-container/50 transition-all"
                placeholder="Ask Libra anything about law…"/>
              <button onClick={() => send()} disabled={!input.trim()}
                className="ai-gradient text-white px-5 py-3.5 rounded-2xl font-bold flex items-center gap-2 shadow-lg hover:opacity-90 disabled:opacity-50 transition-all">
                <span className="material-symbols-outlined">send</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="h-14 flex items-center px-6 border-b border-surface-container-low bg-surface-container-lowest/80 backdrop-blur-xl flex-shrink-0">
              <div className="w-8 h-8 rounded-lg ai-gradient flex items-center justify-center mr-3 flex-shrink-0">
                <span className="material-symbols-outlined text-amber-400 text-base" style={{fontVariationSettings:"'FILL' 1"}}>auto_awesome</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-headline text-sm font-bold text-on-surface truncate">{activeThread.title}</p>
                <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Libra AI · Sovereign Model</p>
              </div>
              {activeThread.caseId && (
                <span className="text-xs bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">folder_open</span>
                  {DB.cases.byId(activeThread.caseId)?.title?.slice(0,30)}
                </span>
              )}
              {!activeThread.caseId && (
                <span className="text-xs bg-surface-container-low text-on-surface-variant px-3 py-1 rounded-full font-semibold">General</span>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-on-surface-variant mb-4">Start the conversation. Ask me anything.</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.slice(0,4).map(s => (
                      <button key={s} onClick={() => send(s)}
                        className="px-3 py-1.5 bg-surface-container-low rounded-lg text-xs font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map(m => (
                <div key={m.id} className={`flex gap-4 ${m.role==='user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${m.role==='user' ? 'bg-secondary-container text-on-secondary-container' : 'ai-gradient text-amber-400'}`}>
                    {m.role==='user' ? initials(user.name) : <span className="material-symbols-outlined text-base" style={{fontVariationSettings:"'FILL' 1"}}>auto_awesome</span>}
                  </div>
                  <div className="max-w-[75%]">
                    <p className="text-[10px] font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                      {m.role==='user' ? user.name : 'Libra AI'} · {relTime(m.createdAt)}
                    </p>
                    <div className={`px-5 py-4 text-sm leading-relaxed ${m.role==='user' ? 'msg-user' : 'msg-ai text-on-surface'}`}>
                      {m.role==='assistant' ? <Markdown text={m.content}/> : m.content}
                    </div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-4">
                  <div className="w-9 h-9 rounded-full ai-gradient flex-shrink-0 flex items-center justify-center">
                    <span className="material-symbols-outlined text-amber-400 text-base" style={{fontVariationSettings:"'FILL' 1"}}>auto_awesome</span>
                  </div>
                  <div className="msg-ai px-5 py-4 flex items-center gap-2">
                    <span className="typing-dot"/><span className="typing-dot"/><span className="typing-dot"/>
                    <span className="text-xs text-on-surface-variant ml-2 italic">Libra AI is thinking…</span>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-surface-container-low bg-surface-container-lowest/80 backdrop-blur-xl flex-shrink-0">
              <div className="flex gap-3 items-end">
                <div className="flex-1 bg-surface-container-low rounded-2xl border border-outline-variant/20 shadow-sm">
                  <textarea value={input} onChange={e=>setInput(e.target.value)}
                    onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()} }}
                    ref={inputRef}
                    rows={1}
                    className="w-full bg-transparent rounded-2xl px-5 py-3.5 text-sm outline-none resize-none"
                    style={{maxHeight:'120px'}}
                    placeholder="Message Libra AI… (Enter to send, Shift+Enter for new line)"/>
                </div>
                <button onClick={() => send()} disabled={loading || !input.trim()}
                  className="ai-gradient text-white w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg hover:opacity-90 disabled:opacity-50 transition-all flex-shrink-0">
                  <span className="material-symbols-outlined">send</span>
                </button>
              </div>
              <p className="text-center text-[10px] text-on-surface-variant mt-2">
                Libra AI provides general legal information, not professional legal advice.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
