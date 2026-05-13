import React, { useState, useEffect, useRef } from 'react'

/* ─── Toast ──────────────────────────────────────────────────────────────── */
let _setToasts = null

export function ToastContainer() {
  const [toasts, setToasts] = useState([])
  _setToasts = setToasts
  return (
    <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border border-white/10 text-sm font-medium text-white max-w-xs transition-all duration-300 ${
          t.type === 'success' ? 'bg-emerald-600' : t.type === 'error' ? 'bg-red-600' : t.type === 'warning' ? 'bg-amber-500' : 'bg-[#101c2e]'
        }`}>
          <span className="material-symbols-outlined text-[20px] flex-shrink-0" style={{fontVariationSettings:"'FILL' 1"}}>
            {t.type === 'success' ? 'check_circle' : t.type === 'error' ? 'error' : t.type === 'warning' ? 'warning' : 'info'}
          </span>
          <span className="flex-1">{t.msg}</span>
          <button onClick={() => _setToasts(prev => prev.filter(x => x.id !== t.id))} className="opacity-70 hover:opacity-100 flex-shrink-0">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      ))}
    </div>
  )
}

const uid = () => Math.random().toString(36).slice(2)

export const toast = {
  show: (msg, type = 'info') => {
    if (!_setToasts) return
    const id = uid()
    _setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => _setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  },
  success: (msg) => toast.show(msg, 'success'),
  error: (msg) => toast.show(msg, 'error'),
  warning: (msg) => toast.show(msg, 'warning'),
  info: (msg) => toast.show(msg, 'info'),
}

/* ─── Status Badge ───────────────────────────────────────────────────────── */
export function StatusBadge({ status }) {
  const map = {
    OPEN:     'bg-emerald-100 text-emerald-700 border border-emerald-200',
    CLOSED:   'bg-slate-100 text-slate-600 border border-slate-200',
    ARCHIVED: 'bg-amber-100 text-amber-700 border border-amber-200',
    PENDING:  'bg-blue-100 text-blue-700 border border-blue-200',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${map[status] || map.PENDING}`}>
      {status}
    </span>
  )
}

/* ─── Modal ──────────────────────────────────────────────────────────────── */
export function Modal({ open, onClose, title, subtitle, children }) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[8000] bg-[#101c2e]/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="ai-gradient px-6 py-5">
          <h3 className="font-headline text-lg font-bold text-white">{title}</h3>
          {subtitle && <p className="text-slate-300 text-xs mt-1">{subtitle}</p>}
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

/* ─── Confirm Modal ──────────────────────────────────────────────────────── */
export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger = false }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[8000] bg-[#101c2e]/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
        <h3 className="font-headline font-bold text-lg text-slate-900 mb-2">{title}</h3>
        <p className="text-sm text-slate-600 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={() => { onConfirm(); onClose() }} className={`px-4 py-2 rounded-lg text-sm font-bold text-white transition-colors ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#101c2e] hover:bg-[#1e3a5f]'}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

/* ─── Form helpers ───────────────────────────────────────────────────────── */
export function Field({ label, required, children }) {
  return (
    <div>
      <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1 block">
        {label}{required && ' *'}
      </label>
      {children}
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-outline-variant/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-secondary/30 transition-all'

export function Input({ className = '', ...props }) {
  return <input className={`${inputCls} ${className}`} {...props} />
}

export function Select({ className = '', children, ...props }) {
  return <select className={`${inputCls} ${className}`} {...props}>{children}</select>
}

export function Textarea({ className = '', ...props }) {
  return <textarea className={`${inputCls} resize-none ${className}`} {...props} />
}

/* ─── Button ─────────────────────────────────────────────────────────────── */
export function Btn({ variant = 'primary', className = '', children, ...props }) {
  const base = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all'
  const variants = {
    primary: 'ai-gradient text-white hover:opacity-90',
    secondary: 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-low',
    ghost: 'text-on-surface-variant hover:bg-surface-container-high',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  }
  return <button className={`${base} ${variants[variant]} ${className}`} {...props}>{children}</button>
}

/* ─── Search Dropdown ────────────────────────────────────────────────────── */
export function SearchBar({ placeholder, onSearch, results, onSelect }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleChange = (e) => {
    setQ(e.target.value)
    if (onSearch) onSearch(e.target.value)
    setOpen(true)
  }

  return (
    <div className="relative w-full" ref={ref}>
      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">search</span>
      <input
        value={q}
        onChange={handleChange}
        className="w-full bg-surface-container-low border-none rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary-container/50 transition-all"
        placeholder={placeholder || 'Search…'}
      />
      {open && results && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden z-[999]">
          {results.map((r, i) => (
            <button key={i} onClick={() => { onSelect?.(r); setOpen(false); setQ('') }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left">
              <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[16px] text-slate-500">{r.icon || 'search'}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                <p className="text-xs text-slate-500">{r.subtitle}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Markdown renderer (simple) ─────────────────────────────────────────── */
export function Markdown({ text }) {
  if (!text) return null
  const html = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
  return <div className="ai-bubble" dangerouslySetInnerHTML={{ __html: `<p>${html}</p>` }} />
}
