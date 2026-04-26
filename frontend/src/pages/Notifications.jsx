import React, { useState } from 'react'
import { DB, relTime } from '../store/db.js'
import { ConfirmModal, toast } from '../components/UI.jsx'

const TYPE_ICON  = { hearing:'gavel', document:'description', case:'folder_open', ai:'auto_awesome', general:'notifications' }
const TYPE_COLOR = {
  hearing:  'bg-red-100 text-red-600',
  document: 'bg-blue-100 text-blue-600',
  case:     'bg-emerald-100 text-emerald-600',
  ai:       'bg-purple-100 text-purple-600',
  general:  'bg-slate-100 text-slate-500',
}

const FILTERS = ['ALL','UNREAD','hearing','document','case','ai']

export default function Notifications() {
  const [filter, setFilter] = useState('ALL')
  const [, forceUpdate] = useState(0)
  const [clearAll, setClearAll] = useState(false)
  const refresh = () => forceUpdate(n=>n+1)

  const all = DB.notifications.all()
  const unreadCount = all.filter(n => !n.read).length

  const filtered = all.filter(n => {
    if (filter === 'ALL')    return true
    if (filter === 'UNREAD') return !n.read
    return n.type === filter
  })

  const markRead = (id) => { DB.notifications.markRead(id); refresh() }
  const markAllRead = () => { DB.notifications.markAllRead(); refresh() }
  const deleteNotif = (id) => { DB.notifications.delete(id); refresh() }
  const deleteAll = () => { DB.notifications.deleteAll(); toast.info('All notifications cleared.'); refresh() }

  return (
    <div className="p-6 min-h-screen bg-background">
      

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="font-headline font-extrabold tracking-tight text-on-surface" style={{fontSize:'1.5rem'}}>Notifications</h2>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-black rounded-full px-2.5 py-0.5 min-w-[26px] text-center">
                {unreadCount}
              </span>
            )}
          </div>
          <p className="text-on-surface-variant text-sm font-medium">Stay up to date with case activity.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={markAllRead}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-outline-variant/50 text-sm font-semibold text-on-surface-variant hover:bg-white hover:shadow-sm transition-all">
            <span className="material-symbols-outlined text-base">done_all</span>Mark all read
          </button>
          <button onClick={() => setClearAll(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 transition-all">
            <span className="material-symbols-outlined text-base">delete_sweep</span>Clear all
          </button>
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map(f => {
          const label = f === 'ALL' ? 'All' : f === 'UNREAD' ? `Unread (${unreadCount})` : f.charAt(0).toUpperCase()+f.slice(1)
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all border ${filter === f ? 'bg-[#0D1F3C] text-white border-transparent shadow-md' : 'border-outline-variant/40 text-on-surface-variant bg-white hover:bg-surface-container-low'}`}>
              {label}
            </button>
          )
        })}
      </div>

      {/* Notifications List */}
      <div className="bg-surface-container-lowest rounded-2xl shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-20 text-center">
            <span className="material-symbols-outlined text-6xl text-slate-200 block mb-3" style={{fontVariationSettings:"'FILL' 1"}}>notifications_off</span>
            <p className="font-semibold text-on-surface-variant">No notifications here</p>
            <p className="text-xs text-slate-400 mt-1">You're all caught up!</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-container-low">
            {filtered.map(n => {
              const tc = TYPE_COLOR[n.type] || TYPE_COLOR.general
              const ic = TYPE_ICON[n.type] || 'notifications'
              return (
                <div key={n.id} className={`flex items-start gap-4 px-6 py-4 hover:bg-surface-container-low/30 transition-colors group ${n.read ? 'opacity-70' : ''}`}>
                  {/* Unread dot */}
                  <div className="mt-1 flex-shrink-0 w-2">
                    {!n.read && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                  </div>

                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ${tc}`}>
                    <span className="material-symbols-outlined text-[18px]" style={{fontVariationSettings:"'FILL' 1"}}>{ic}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
                      <p className={`text-sm ${n.read ? 'font-medium text-on-surface/80' : 'font-bold text-on-surface'}`}>{n.title}</p>
                      <span className="text-[10px] text-on-surface-variant font-medium flex-shrink-0">{relTime(n.createdAt)}</span>
                    </div>
                    <p className="text-xs text-on-surface-variant leading-relaxed">{n.message}</p>
                    <div className="flex items-center gap-1 mt-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${tc}`}>{n.type}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!n.read && (
                      <button onClick={() => markRead(n.id)} title="Mark as read"
                        className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant hover:text-primary-container">
                        <span className="material-symbols-outlined text-[18px]">check_circle</span>
                      </button>
                    )}
                    <button onClick={() => deleteNotif(n.id)} title="Delete"
                      className="p-2 rounded-lg hover:bg-red-50 transition-colors text-on-surface-variant hover:text-red-600">
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <p className="text-center text-xs text-on-surface-variant mt-4 font-medium">
          {filtered.length} notification{filtered.length !== 1 ? 's' : ''}
        </p>
      )}

      <ConfirmModal
        open={clearAll}
        onClose={() => setClearAll(false)}
        onConfirm={deleteAll}
        title="Clear All Notifications"
        message="This will permanently delete all notifications. This cannot be undone."
        confirmLabel="Clear All"
        danger
      />
    </div>
  )
}
