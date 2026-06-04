import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as eventsApi from '../api/events.js'
import * as casesApi from '../api/cases.js'
import { Modal, Field, Input, Select, Btn, ConfirmModal, toast } from '../components/UI.jsx'

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const TYPE_COLORS = {
  HEARING: { pill:'bg-red-100 text-red-700 border border-red-200',    dot:'bg-red-500',    icon:'gavel' },
  MEETING: { pill:'bg-blue-100 text-blue-700 border border-blue-200',  dot:'bg-blue-500',  icon:'groups' },
  REMINDER:{ pill:'bg-amber-100 text-amber-700 border border-amber-200',dot:'bg-amber-500', icon:'notifications_active' },
  DEADLINE:{ pill:'bg-purple-100 text-purple-700 border border-purple-200',dot:'bg-purple-500',icon:'schedule' },
}

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

/**
 * The backend stores events as:
 *   name, startTime (ISO 8601), endTime (ISO 8601), type, description, allDay
 *
 * The UI needs a display-friendly local date string and time string.
 * We derive them here so the rest of the component only deals with backend fields.
 */
const eventDate = (ev) => ev.startTime ? ev.startTime.slice(0, 10) : ''  // "YYYY-MM-DD"
const eventTime = (ev) => {
  if (!ev.startTime) return ''
  const d = new Date(ev.startTime)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

const fmtDate = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return String(iso) }
}

// Build ISO startTime from a local date string ("YYYY-MM-DD") and a time string ("HH:MM")
const toISO = (date, time) => {
  if (!date) return null
  const t = time || '09:00'
  return new Date(`${date}T${t}:00`).toISOString()
}

const EMPTY_FORM = { name: '', date: '', time: '09:00', type: 'HEARING', description: '', remindBeforeMinutes: null }

export default function Calendar() {
  const navigate   = useNavigate()
  const now        = new Date()
  const todayStr   = now.toISOString().slice(0, 10)

  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  // Data from the real API
  const [allEvents, setAllEvents] = useState([])
  const [cases, setCases]         = useState([])
  const [loading, setLoading]     = useState(true)

  // UI state
  const [showNew, setShowNew]       = useState(false)
  const [showDetail, setShowDetail] = useState(null)
  const [confirm, setConfirm]       = useState(null)
  const [saving, setSaving]         = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)

  /* ── Data fetching ─────────────────────────────────────────────────────── */
  const fetchEvents = useCallback(async () => {
    try {
      const res = await eventsApi.getEvents()
      // GET /api/events → { data: [...], total, limit, offset }
      setAllEvents(Array.isArray(res) ? res : (res.data ?? []))
    } catch (err) {
      toast.error(err.message || 'Failed to load events.')
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      try {
        const [evRes, caseRes] = await Promise.all([
          eventsApi.getEvents(),
          casesApi.getCases(),
        ])
        setAllEvents(Array.isArray(evRes)  ? evRes  : (evRes.data   ?? []))
        setCases(Array.isArray(caseRes) ? caseRes : (caseRes.data ?? []))
      } catch (err) {
        toast.error(err.message || 'Failed to load calendar data.')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  /* ── Calendar grid helpers ─────────────────────────────────────────────── */
  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y-1) } else setMonth(m => m-1) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y+1) } else setMonth(m => m+1) }

  const eventsOnDay = (d) => {
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    return allEvents.filter(ev => eventDate(ev) === ds)
  }

  /* ── Mutations ─────────────────────────────────────────────────────────── */
  const handleCreate = async () => {
    if (!form.name || !form.date) { toast.warning('Title and date are required.'); return }
    if (form.date < todayStr)     { toast.warning('Cannot schedule events in the past.'); return }
    setSaving(true)
    try {
      // Backend requires: type, name, startTime (ISO 8601)
      await eventsApi.createEvent({
        type:    form.type,
        name:    form.name,
        startTime: toISO(form.date, form.time),
        description: form.description || undefined,
        remindBeforeMinutes: form.remindBeforeMinutes || undefined,
      })
      toast.success('Event scheduled!')
      setShowNew(false)
      setForm(EMPTY_FORM)
      await fetchEvents()
    } catch (err) {
      toast.error(err.message || 'Failed to create event.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (ev) => {
    try {
      await eventsApi.deleteEvent(ev.id)
      toast.success('Event deleted.')
      setConfirm(null)
      await fetchEvents()
    } catch (err) {
      toast.error(err.message || 'Failed to delete event.')
    }
  }

  const initiateDelete = (ev) => { setShowDetail(null); setConfirm(ev) }

  /* ── Upcoming events strip ─────────────────────────────────────────────── */
  const in30     = new Date(now.getTime() + 30*86400000).toISOString().slice(0, 10)
  const upcoming = allEvents
    .filter(ev => eventDate(ev) >= todayStr && eventDate(ev) <= in30)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))

  const caseById = (id) => cases.find(c => c.id === id) || null

  return (
    <div className="p-6 min-h-screen bg-background">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="font-headline font-extrabold tracking-tight text-on-surface mb-1" style={{fontSize:'1.5rem'}}>Calendar</h2>
          <p className="text-on-surface-variant text-sm font-medium">Manage hearings, meetings &amp; deadlines</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-3 mr-2">
            {Object.entries(TYPE_COLORS).map(([type, tc]) => (
              <div key={type} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${tc.dot}`} />
                <span className="text-[11px] font-semibold text-on-surface-variant capitalize">{type.charAt(0)+type.slice(1).toLowerCase()}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setShowNew(true)}
            className="ai-gradient text-white flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold shadow-lg hover:opacity-90 transition-all">
            <span className="material-symbols-outlined text-lg">add</span>New Event
          </button>
        </div>
      </div>

      {/* Calendar card */}
      <div className="bg-white rounded-2xl shadow-sm border border-surface-container-low overflow-hidden">
        {/* Month navigation */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-container-low bg-surface-container-lowest/60">
          <button onClick={prevMonth} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors">
            <span className="material-symbols-outlined text-on-surface-variant">chevron_left</span>
          </button>
          <div className="flex items-center gap-4">
            <h3 className="font-headline font-extrabold text-xl text-on-surface">{MONTHS[month]} {year}</h3>
            <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}
              className="text-xs px-3 py-1 rounded-full border border-outline-variant/50 font-bold text-secondary hover:bg-surface-container-low transition-colors">
              Today
            </button>
          </div>
          <button onClick={nextMonth} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors">
            <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 border-b border-surface-container-low">
          {DAYS.map(d => (
            <div key={d} className="py-3 text-center text-[11px] font-black uppercase tracking-widest text-on-surface-variant border-r border-surface-container-low/60 last:border-r-0">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {loading
            ? Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="h-[130px] border-r border-b border-surface-container-low/60 animate-pulse bg-slate-50/60" />
              ))
            : <>
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-[130px] border-r border-b border-surface-container-low/60 last:border-r-0 bg-slate-50/40" />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const d       = i + 1
                  const ds      = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
                  const isToday = ds === todayStr
                  const isPast  = ds < todayStr
                  const evs     = eventsOnDay(d)
                  const colPos  = (firstDay + i) % 7
                  return (
                    <div key={d}
                      className={`h-[130px] border-r border-b border-surface-container-low/60 p-1.5 transition-colors cursor-pointer group ${colPos === 6 ? 'border-r-0' : ''} ${isToday ? 'bg-blue-50/60' : ''} ${isPast ? 'bg-slate-50/80 opacity-60' : 'hover:bg-blue-50/40'}`}
                      onClick={() => {
                        if (isPast) { toast.warning('This date has already passed.'); return }
                        setForm(f => ({...f, date: ds})); setShowNew(true)
                      }}>
                      <div className="flex items-center justify-between mb-1">
                        <div className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold transition-colors ${isToday ? 'ai-gradient text-white' : isPast ? 'text-slate-400' : 'text-on-surface group-hover:bg-blue-100'}`}>{d}</div>
                        {evs.length > 0 && <span className="text-[9px] font-bold text-on-surface-variant opacity-0 group-hover:opacity-100">{evs.length}</span>}
                      </div>
                      <div className="space-y-0.5 overflow-hidden" style={{maxHeight:'82px'}}>
                        {evs.slice(0,3).map(ev => {
                          const tc = TYPE_COLORS[ev.type] || TYPE_COLORS.MEETING
                          return (
                            <div key={ev.id}
                              className={`flex items-center gap-1 rounded-md px-1.5 py-[3px] text-[10px] font-semibold cursor-pointer hover:opacity-80 truncate ${tc.pill}`}
                              onClick={e => { e.stopPropagation(); setShowDetail(ev) }}>
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tc.dot}`} />
                              <span className="truncate">{eventTime(ev)} {ev.name}</span>
                            </div>
                          )
                        })}
                        {evs.length > 3 && (
                          <div className="text-[9px] font-bold text-secondary pl-1">+{evs.length-3} more</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </>
          }
        </div>
      </div>

      {/* Upcoming events strip */}
      {!loading && upcoming.length > 0 && (
        <div className="mt-5 bg-white rounded-2xl shadow-sm border border-surface-container-low overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-surface-container-low">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-lg" style={{fontVariationSettings:"'FILL' 1"}}>event_upcoming</span>
              <h3 className="font-headline font-bold text-sm text-on-surface">Upcoming — Next 30 Days</h3>
            </div>
            <span className="text-xs bg-secondary-container text-on-secondary-container px-2.5 py-0.5 rounded-full font-bold">{upcoming.length}</span>
          </div>
          <div className="overflow-x-auto">
            <div className="flex gap-3 p-4" style={{minWidth:'max-content'}}>
              {upcoming.slice(0, 12).map(ev => {
                const tc      = TYPE_COLORS[ev.type] || TYPE_COLORS.MEETING
                const ds      = eventDate(ev)
                const isToday = ds === todayStr
                const dateObj = new Date(ev.startTime)
                return (
                  <div key={ev.id}
                    className={`w-44 flex-shrink-0 rounded-xl border p-3 cursor-pointer hover:shadow-md transition-all ${isToday ? 'border-amber-300 bg-amber-50' : 'border-surface-container-low hover:border-secondary/30'}`}
                    onClick={() => setShowDetail(ev)}>
                    <div className={`text-[10px] font-black uppercase tracking-wider mb-1 ${isToday ? 'text-amber-600' : 'text-secondary'}`}>
                      {isToday ? 'TODAY' : dateObj.toLocaleDateString('en',{weekday:'short',month:'short',day:'numeric'})}
                    </div>
                    <p className="text-xs font-bold text-on-surface truncate leading-snug mb-1">{ev.name}</p>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${tc.dot}`} />
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tc.pill}`}>{ev.type}</span>
                    </div>
                    <p className="text-[10px] text-on-surface-variant mt-1">{eventTime(ev)}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* New Event Modal */}
      <Modal open={showNew} onClose={() => { setShowNew(false); setForm(EMPTY_FORM) }} title="Schedule New Event">
        <div className="space-y-4">
          <Field label="Event Title">
            <Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Pre-trial Hearing"/>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date">
              <Input type="date" value={form.date} min={todayStr} onChange={e => setForm(f => ({...f, date: e.target.value}))}/>
            </Field>
            <Field label="Time">
              <Input type="time" value={form.time} onChange={e => setForm(f => ({...f, time: e.target.value}))}/>
            </Field>
          </div>
          <Field label="Type">
            <Select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))}>
              <option>HEARING</option><option>MEETING</option><option>REMINDER</option><option>DEADLINE</option>
            </Select>
          </Field>
          <Field label="Notes (optional)">
            <Input value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Any additional details…"/>
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" onClick={() => { setShowNew(false); setForm(EMPTY_FORM) }}>Cancel</Btn>
            <Btn variant="primary" onClick={handleCreate} disabled={saving}>
              {saving ? 'Scheduling…' : 'Schedule'}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* Event Detail Modal */}
      {showDetail && (() => {
        const ev = showDetail
        const tc = TYPE_COLORS[ev.type] || TYPE_COLORS.MEETING
        return (
          <div className="fixed inset-0 z-[8000] bg-[#101c2e]/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowDetail(null) }}>
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
              <div className="ai-gradient px-6 py-5">
                <div className="flex items-start justify-between">
                  <div>
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold mb-2 ${tc.pill}`}>{ev.type}</span>
                    <h3 className="font-headline text-lg font-bold text-white">{ev.name}</h3>
                    <p className="text-slate-300 text-sm mt-1">{fmtDate(ev.startTime)} at {eventTime(ev)}</p>
                  </div>
                  <button onClick={() => setShowDetail(null)} className="text-slate-300 hover:text-white">
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                {[
                  { label:'End Time',    value: ev.endTime ? fmtDate(ev.endTime) + ' ' + eventTime({startTime: ev.endTime}) : '—', icon:'schedule' },
                  { label:'Description', value: ev.description || '—', icon:'notes' },
                  { label:'All Day',     value: ev.allDay ? 'Yes' : 'No', icon:'wb_sunny' },
                ].map(f => (
                  <div key={f.label} className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-on-surface-variant text-lg">{f.icon}</span>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-on-surface-variant">{f.label}</p>
                      <p className="text-sm font-semibold text-on-surface">{f.value}</p>
                    </div>
                  </div>
                ))}
                <div className="flex justify-end gap-3 pt-2 border-t border-surface-container-low">
                  <button onClick={() => initiateDelete(ev)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold text-red-600 hover:bg-red-50 transition-colors">
                    <span className="material-symbols-outlined text-base">delete</span>Delete
                  </button>
                  <button onClick={() => setShowDetail(null)} className="px-4 py-2 rounded-lg text-sm font-semibold border border-outline-variant/50 hover:bg-surface-container-low transition-colors">Close</button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => handleDelete(confirm)}
        title="Delete Event"
        message={`Delete "${confirm?.name}"?`}
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}
