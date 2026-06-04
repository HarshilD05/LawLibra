import React, { useState, useEffect, useCallback } from 'react'
import { ConfirmModal, toast } from '../components/UI.jsx'
import * as notificationsApi from '../api/notifications.js'

/* ─── Constants ─────────────────────────────────────────────────────────────── */

/**
 * Backend notificationType → icon mapping
 * notificationType values: CASE_ASSIGNED, CASE_UNASSIGNED, CASE_UPDATED,
 *   HEARING_SCHEDULED, DOCUMENT_PROCESSED, DOCUMENT_ERROR,
 *   CHAT_RESPONSE_READY, CHAT_ERROR, CHAT_DOCUMENT_PROCESSED,
 *   CHAT_DOCUMENT_ERROR, EVENT_REMINDER
 */
const TYPE_ICON = {
  CASE_ASSIGNED:           'folder_open',
  CASE_UNASSIGNED:         'folder_off',
  CASE_UPDATED:            'edit_note',
  HEARING_SCHEDULED:       'gavel',
  DOCUMENT_PROCESSED:      'task',
  DOCUMENT_ERROR:          'error',
  CHAT_RESPONSE_READY:     'auto_awesome',
  CHAT_ERROR:              'error_outline',
  CHAT_DOCUMENT_PROCESSED: 'description',
  CHAT_DOCUMENT_ERROR:     'broken_image',
  EVENT_REMINDER:          'notifications_active',
}

/**
 * entityType → color mapping
 * entityType values: CASE, CHAT, EVENT
 */
const ENTITY_COLOR = {
  CASE:  'bg-emerald-100 text-emerald-600',
  CHAT:  'bg-purple-100 text-purple-600',
  EVENT: 'bg-amber-100 text-amber-600',
}

// Filter tabs shown in the UI — ALL, UNREAD, then entityTypes
const FILTERS = ['ALL', 'UNREAD', 'CASE', 'CHAT', 'EVENT']

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
const relTime = (iso) => {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d < 7)  return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function Notifications() {
  const [filter, setFilter]               = useState('ALL')
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading]             = useState(true)
  const [clearAll, setClearAll]           = useState(false)

  /* ── Fetch ─────────────────────────────────────────────────────────────── */
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await notificationsApi.getNotifications()
      // GET /api/notifications → { data: [...], total, limit, offset }
      setNotifications(Array.isArray(res) ? res : (res.data ?? []))
    } catch (err) {
      toast.error(err.message || 'Failed to load notifications.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  /* ── Derived values ────────────────────────────────────────────────────── */
  // Backend uses `isRead` (boolean)
  const unreadCount = notifications.filter(n => !n.isRead).length

  const filtered = notifications.filter(n => {
    if (filter === 'ALL')    return true
    if (filter === 'UNREAD') return !n.isRead
    return n.entityType === filter   // CASE | CHAT | EVENT
  })

  /* ── Mutations ─────────────────────────────────────────────────────────── */
  const handleMarkRead = async (id) => {
    // Optimistic update
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
    try {
      await notificationsApi.markRead(id)
    } catch (err) {
      toast.error(err.message || 'Failed to mark as read.')
      fetchNotifications()
    }
  }

  const handleMarkAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
    try {
      await notificationsApi.markAllRead()
    } catch (err) {
      toast.error(err.message || 'Failed to mark all as read.')
      fetchNotifications()
    }
  }

  const handleDelete = async (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
    try {
      await notificationsApi.deleteNotification(id)
    } catch (err) {
      toast.error(err.message || 'Failed to delete notification.')
      fetchNotifications()
    }
  }

  const handleDeleteAll = async () => {
    const ids = notifications.map(n => n.id)
    setNotifications([])
    try {
      await Promise.all(ids.map(id => notificationsApi.deleteNotification(id)))
      toast.info('All notifications cleared.')
    } catch (err) {
      toast.error(err.message || 'Failed to clear all notifications.')
      fetchNotifications()
    }
  }

  return (
    <div className="p-6 min-h-screen bg-background">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="font-headline font-extrabold tracking-tight text-on-surface" style={{ fontSize: '1.5rem' }}>Notifications</h2>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-black rounded-full px-2.5 py-0.5 min-w-[26px] text-center">
                {unreadCount}
              </span>
            )}
          </div>
          <p className="text-on-surface-variant text-sm font-medium">Stay up to date with case activity.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleMarkAllRead}
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
          const label = f === 'ALL' ? 'All' : f === 'UNREAD' ? `Unread (${unreadCount})` : f.charAt(0) + f.slice(1).toLowerCase()
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
        {loading ? (
          <div className="py-20 text-center">
            <svg className="animate-spin h-8 w-8 text-secondary mx-auto mb-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <p className="text-sm text-on-surface-variant">Loading notifications…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <span className="material-symbols-outlined text-6xl text-slate-200 block mb-3" style={{ fontVariationSettings: "'FILL' 1" }}>notifications_off</span>
            <p className="font-semibold text-on-surface-variant">No notifications here</p>
            <p className="text-xs text-slate-400 mt-1">You're all caught up!</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-container-low">
            {filtered.map(n => {
              // Backend fields: isRead, msg, notificationType, entityType, createdAt
              const entityColor = ENTITY_COLOR[n.entityType] || 'bg-slate-100 text-slate-500'
              const icon        = TYPE_ICON[n.notificationType] || 'notifications'
              return (
                <div key={n.id} className={`flex items-start gap-4 px-6 py-4 hover:bg-surface-container-low/30 transition-colors group ${n.isRead ? 'opacity-70' : ''}`}>
                  {/* Unread dot */}
                  <div className="mt-1 flex-shrink-0 w-2">
                    {!n.isRead && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                  </div>
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ${entityColor}`}>
                    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
                      <p className={`text-sm ${n.isRead ? 'font-medium text-on-surface/80' : 'font-bold text-on-surface'}`}>
                        {n.msg}
                      </p>
                      <span className="text-[10px] text-on-surface-variant font-medium flex-shrink-0">{relTime(n.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${entityColor}`}>
                        {n.entityType}
                      </span>
                      <span className="text-[10px] text-on-surface-variant/60 font-medium">{n.notificationType?.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!n.isRead && (
                      <button onClick={() => handleMarkRead(n.id)} title="Mark as read"
                        className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant hover:text-primary-container">
                        <span className="material-symbols-outlined text-[18px]">check_circle</span>
                      </button>
                    )}
                    <button onClick={() => handleDelete(n.id)} title="Delete"
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
        onConfirm={() => { setClearAll(false); handleDeleteAll() }}
        title="Clear All Notifications"
        message="This will permanently delete all notifications. This cannot be undone."
        confirmLabel="Clear All"
        danger
      />
    </div>
  )
}
