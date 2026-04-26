import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DB, Auth, initials, fmtDate } from '../store/db.js'
import { Modal, Field, Input, Select, Btn, ConfirmModal, toast } from '../components/UI.jsx'

export default function UserManagement() {
  const navigate = useNavigate()
  const user = Auth.currentUser() || {}
  if (user.role !== 'ADMIN') {
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

  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [showNew, setShowNew] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [, forceUpdate] = useState(0)
  const refresh = () => forceUpdate(n=>n+1)

  const [form, setForm] = useState({ name:'', email:'', password:'', role:'LAWYER', status:'ACTIVE' })

  const allUsers = DB.users.all()
  const users = allUsers.filter(u => {
    const q = query.toLowerCase()
    const matchQ = !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    const matchR = roleFilter === 'ALL' || u.role === roleFilter
    return matchQ && matchR
  })

  const createUser = () => {
    if (!form.name || !form.email || !form.password) { toast.warning('Name, email and password are required.'); return }
    DB.users.create({ ...form })
    toast.success('User created successfully!')
    setShowNew(false)
    setForm({ name:'', email:'', password:'', role:'LAWYER', status:'ACTIVE' })
    refresh()
  }

  const saveEdit = () => {
    if (!editUser.name || !editUser.email) { toast.warning('Name and email are required.'); return }
    DB.users.update(editUser.id, { name: editUser.name, email: editUser.email, role: editUser.role, status: editUser.status })
    toast.success('User updated.')
    setEditUser(null)
    refresh()
  }

  const toggleStatus = (u) => {
    const next = u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    DB.users.update(u.id, { status: next })
    toast.info(`User ${next === 'ACTIVE' ? 'activated' : 'deactivated'}.`)
    refresh()
  }

  const stats = {
    total:   allUsers.length,
    admins:  allUsers.filter(u=>u.role==='ADMIN').length,
    lawyers: allUsers.filter(u=>u.role==='LAWYER').length,
    active:  allUsers.filter(u=>u.status==='ACTIVE').length,
  }

  return (
    <div className="p-6 min-h-screen bg-background">
      

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="font-headline font-extrabold tracking-tight text-on-surface mb-1" style={{fontSize:'1.5rem'}}>Admin Panel</h2>
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
          { label:'Total Users',   value: stats.total,   icon:'group', color:'bg-blue-50 text-blue-600' },
          { label:'Administrators',value: stats.admins,  icon:'admin_panel_settings', color:'bg-amber-50 text-amber-600' },
          { label:'Attorneys',     value: stats.lawyers, icon:'gavel', color:'bg-purple-50 text-purple-600' },
          { label:'Active',        value: stats.active,  icon:'check_circle', color:'bg-emerald-50 text-emerald-600' },
        ].map(s => (
          <div key={s.label} className="bg-surface-container-lowest rounded-xl shadow-sm p-5">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${s.color}`}>
              <span className="material-symbols-outlined text-[20px]" style={{fontVariationSettings:"'FILL' 1"}}>{s.icon}</span>
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{s.label}</p>
            <p className="font-black font-headline text-2xl text-on-surface">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-5">
        <div className="flex bg-surface-container-lowest rounded-lg border border-outline-variant/30 overflow-hidden shadow-sm">
          {['ALL','ADMIN','LAWYER'].map(r => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={`px-4 py-2 text-sm font-bold transition-colors ${roleFilter===r ? 'bg-[#0D1F3C] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              {r === 'ALL' ? 'All Roles' : r.charAt(0)+r.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
          <input value={query} onChange={e=>setQuery(e.target.value)}
            className="w-full bg-white border border-outline-variant/30 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary-container/50 shadow-sm"
            placeholder="Search users..." />
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface-container-lowest rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-surface-container-low bg-surface-container-low/40">
              {['User','Email','Role','Status','Cases','Actions'].map((h,i) => (
                <th key={h} className={`px-6 py-4 text-xs font-black uppercase tracking-wider text-on-surface-variant ${i>=4 ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container-low">
            {users.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-on-surface-variant">No users found.</td></tr>
            ) : users.map(u => {
              const caseCount = DB.cases.all().filter(c => c.assignedTo?.includes(u.id)).length
              const isMe = u.id === user.id
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
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${u.role==='ADMIN' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${u.status==='ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.status==='ACTIVE' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      {u.status || 'ACTIVE'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-bold text-on-surface">{caseCount}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditUser({...u})} title="Edit"
                        className="p-2 hover:bg-surface-container-high rounded-lg transition-colors text-on-surface-variant hover:text-primary-container">
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                      </button>
                      <button onClick={() => toggleStatus(u)} title={u.status==='ACTIVE' ? 'Deactivate' : 'Activate'}
                        className={`p-2 rounded-lg transition-colors ${u.status==='ACTIVE' ? 'hover:bg-amber-50 text-amber-600' : 'hover:bg-emerald-50 text-emerald-600'}`}>
                        <span className="material-symbols-outlined text-[18px]">{u.status==='ACTIVE' ? 'block' : 'check_circle'}</span>
                      </button>
                      {!isMe && (
                        <button onClick={() => setConfirm(u)} title="Delete"
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
        <div className="px-6 py-3 bg-surface-container-low/30 text-xs font-medium text-on-surface-variant">
          {users.length} user{users.length!==1?'s':''} shown
        </div>
      </div>

      {/* Add User Modal */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="Add New User">
        <div className="space-y-4">
          <Field label="Full Name *"><Input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Jane Hartwell, Esq."/></Field>
          <Field label="Email *"><Input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="jane@firm.com"/></Field>
          <Field label="Password *"><Input type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="Min 8 characters"/></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Role">
              <Select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}>
                <option value="LAWYER">Lawyer</option><option value="ADMIN">Admin</option>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" onClick={() => setShowNew(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={createUser}>Create User</Btn>
          </div>
        </div>
      </Modal>

      {/* Edit User Modal */}
      {editUser && (
        <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Edit User">
          <div className="space-y-4">
            <Field label="Full Name"><Input value={editUser.name} onChange={e=>setEditUser(f=>({...f,name:e.target.value}))}/></Field>
            <Field label="Email"><Input type="email" value={editUser.email} onChange={e=>setEditUser(f=>({...f,email:e.target.value}))}/></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Role">
                <Select value={editUser.role} onChange={e=>setEditUser(f=>({...f,role:e.target.value}))}>
                  <option value="LAWYER">Lawyer</option><option value="ADMIN">Admin</option>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={editUser.status||'ACTIVE'} onChange={e=>setEditUser(f=>({...f,status:e.target.value}))}>
                  <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
                </Select>
              </Field>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Btn variant="secondary" onClick={() => setEditUser(null)}>Cancel</Btn>
              <Btn variant="primary" onClick={saveEdit}>Save Changes</Btn>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => { DB.users.delete(confirm.id); toast.success('User deleted.'); refresh() }}
        title="Delete User"
        message={`Permanently delete "${confirm?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}
