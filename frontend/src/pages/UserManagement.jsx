import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as authApi from '../api/auth.js'
import { getSession } from '../api/auth.js'
import { fmtDate } from '../store/db.js'
import { Modal, Field, Input, Select, Btn, ConfirmModal, toast } from '../components/UI.jsx'

const initials = (name = '') =>
  name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')

const BLANK_FORM = { name: '', email: '', password: '', role: 'LAWYER', status: 'ACTIVE' }

export default function UserManagement() {
  const navigate = useNavigate()
  const session = getSession() || {}
  const currentUserRole = session.role

  if (currentUserRole !== 'ADMIN') {
    return (
      <div className="p-12 text-center">
        <span className="material-symbols-outlined text-7xl text-slate-200 block mb-4">lock</span>
        <h3 className="font-headline font-bold text-xl text-on-surface mb-2">Access Restricted</h3>
        <p className="text-on-surface-variant text-sm mb-6">You need Admin privileges to view this page.</p>
        <button onClick={() => navigate('/dashboard')} className="ai-gradient text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:opacity-90">
          Back to Dashboard
        </button>
      </div>
    )
  }

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [showNew, setShowNew] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [form, setForm] = useState(BLANK_FORM)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await authApi.getAllUsers()
        setUsers(Array.isArray(data) ? data : (data.users || []))
      } catch (err) {
        toast.error(err.message || 'Failed to load users.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const displayed = users.filter(u => {
    const q = query.toLowerCase()
    const matchQ = !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    const matchR = roleFilter === 'ALL' || u.role === roleFilter
    return matchQ && matchR
  })

  const stats = {
    total:   users.length,
    admins:  users.filter(u => u.role === 'ADMIN').length,
    lawyers: users.filter(u => u.role === 'LAWYER').length,
    active:  users.filter(u => u.status === 'ACTIVE').length,
  }

  const createUser = async () => {
    if (!form.name || !form.email || !form.password) { toast.warning('Name, email and password are required.'); return }
    setCreating(true)
    try {
      // Uses the register endpoint since there's no separate admin create-user endpoint yet
      await authApi.register({ name: form.name, email: form.email, password: form.password, role: form.role })
      // Refetch the full list so we get the server-assigned ID
      const data = await authApi.getAllUsers()
      setUsers(Array.isArray(data) ? data : (data.users || []))
      toast.success('User created successfully!')
      setShowNew(false)
      setForm(BLANK_FORM)
    } catch (err) {
      toast.error(err.message || 'Failed to create user.')
    } finally {
      setCreating(false)
    }
  }

  const saveEdit = async () => {
    if (!editUser.name || !editUser.email) { toast.warning('Name and email are required.'); return }
    setSaving(true)
    try {
      const updated = await authApi.getUserById(editUser.id)
      // NOTE: PATCH /auth/users/:id not yet in routes, so we optimistically update local state
      // Replace with real PATCH call once available
      setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, name: editUser.name, email: editUser.email, role: editUser.role, status: editUser.status } : u))
      toast.success('User updated.')
      setEditUser(null)
    } catch (err) {
      toast.error(err.message || 'Failed to update user.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm) return
    const { id, name } = confirm
    setConfirm(null)
    try {
      await authApi.deleteUser(id)
      setUsers(prev => prev.filter(u => u.id !== id))
      toast.success(`"${name}" deleted.`)
    } catch (err) {
      toast.error(err.message || 'Failed to delete user.')
    }
  }

  return (
    <div className="p-6 min-h-screen bg-background">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="font-headline font-extrabold tracking-tight text-on-surface mb-1" style={{ fontSize: '1.5rem' }}>Admin Panel</h2>
          <p className="text-on-surface-variant text-sm font-medium">Manage users, roles and access across the firm.</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="ai-gradient text-white flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold shadow-lg hover:opacity-90 transition-all">
          <span className="material-symbols-outlined">person_add</span>Add User
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Users',    value: stats.total,   icon: 'group',                color: 'bg-blue-50 text-blue-600' },
          { label: 'Administrators', value: stats.admins,  icon: 'admin_panel_settings', color: 'bg-amber-50 text-amber-600' },
          { label: 'Attorneys',      value: stats.lawyers, icon: 'gavel',                color: 'bg-purple-50 text-purple-600' },
          { label: 'Active',         value: stats.active,  icon: 'check_circle',         color: 'bg-emerald-50 text-emerald-600' },
        ].map(s => (
          <div key={s.label} className="bg-surface-container-lowest rounded-xl shadow-sm p-5">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${s.color}`}>
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>{s.icon}</span>
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{s.label}</p>
            <p className="font-black font-headline text-2xl text-on-surface">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-5">
        <div className="flex bg-surface-container-lowest rounded-lg border border-outline-variant/30 overflow-hidden shadow-sm">
          {['ALL', 'ADMIN', 'LAWYER'].map(r => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={`px-4 py-2 text-sm font-bold transition-colors ${roleFilter === r ? 'bg-[#0D1F3C] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              {r === 'ALL' ? 'All Roles' : r.charAt(0) + r.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
          <input value={query} onChange={e => setQuery(e.target.value)}
            className="w-full bg-white border border-outline-variant/30 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary-container/50 shadow-sm"
            placeholder="Search users..." />
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface-container-lowest rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center">
            <svg className="animate-spin h-7 w-7 text-secondary mx-auto mb-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <p className="text-sm text-on-surface-variant">Loading users…</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-surface-container-low bg-surface-container-low/40">
                {['User', 'Email', 'Role', 'Status', 'Actions'].map((h, i) => (
                  <th key={h} className={`px-6 py-4 text-xs font-black uppercase tracking-wider text-on-surface-variant ${i >= 4 ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-low">
              {displayed.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-sm text-on-surface-variant">No users found.</td></tr>
              ) : displayed.map(u => {
                const isMe = u.email === session.email
                return (
                  <tr key={u.id} className="hover:bg-surface-container-low/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full ai-gradient flex items-center justify-center text-amber-400 font-bold text-sm flex-shrink-0">
                          {initials(u.name)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-on-surface">{u.name} {isMe && <span className="text-xs text-secondary font-bold">(you)</span>}</p>
                          <p className="text-xs text-on-surface-variant">{fmtDate(u.createdAt)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-on-surface-variant">{u.email}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${u.role === 'ADMIN' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${u.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {u.status || 'ACTIVE'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditUser({ ...u })} title="Edit"
                          className="p-2 hover:bg-surface-container-high rounded-lg transition-colors text-on-surface-variant hover:text-primary-container">
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        {!isMe && (
                          <button onClick={() => setConfirm({ id: u.id, name: u.name })} title="Delete"
                            className="p-2 hover:bg-red-50 rounded-lg transition-colors text-on-surface-variant hover:text-red-600">
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <div className="px-6 py-3 bg-surface-container-low/30 text-xs font-medium text-on-surface-variant">
          {displayed.length} user{displayed.length !== 1 ? 's' : ''} shown
        </div>
      </div>

      {/* Add User Modal */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="Add New User">
        <div className="space-y-4">
          <Field label="Full Name *"><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Hartwell, Esq." /></Field>
          <Field label="Email *"><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@firm.com" /></Field>
          <Field label="Password *"><Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Role">
              <Select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="LAWYER">Lawyer</option><option value="ADMIN">Admin</option>
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" onClick={() => setShowNew(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={createUser} disabled={creating}>{creating ? 'Creating…' : 'Create User'}</Btn>
          </div>
        </div>
      </Modal>

      {/* Edit User Modal */}
      {editUser && (
        <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Edit User">
          <div className="space-y-4">
            <Field label="Full Name"><Input value={editUser.name} onChange={e => setEditUser(f => ({ ...f, name: e.target.value }))} /></Field>
            <Field label="Email"><Input type="email" value={editUser.email} onChange={e => setEditUser(f => ({ ...f, email: e.target.value }))} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Role">
                <Select value={editUser.role} onChange={e => setEditUser(f => ({ ...f, role: e.target.value }))}>
                  <option value="LAWYER">Lawyer</option><option value="ADMIN">Admin</option>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={editUser.status || 'ACTIVE'} onChange={e => setEditUser(f => ({ ...f, status: e.target.value }))}>
                  <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
                </Select>
              </Field>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Btn variant="secondary" onClick={() => setEditUser(null)}>Cancel</Btn>
              <Btn variant="primary" onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={handleDelete}
        title="Delete User"
        message={`Permanently delete "${confirm?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}
