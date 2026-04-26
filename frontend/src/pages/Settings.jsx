import React, { useState } from 'react'
import { Auth, DB, initials } from '../store/db.js'
import { Field, Input, Select, Btn, toast } from '../components/UI.jsx'

const TABS = [
  { key:'profile',    label:'Profile',        icon:'manage_accounts' },
  { key:'security',   label:'Security',       icon:'shield' },
  { key:'notifs',     label:'Notifications',  icon:'notifications' },
  { key:'appearance', label:'Appearance',     icon:'palette' },
]

export default function Settings() {
  const user = Auth.currentUser() || {}
  const [tab, setTab] = useState('profile')
  const [profileForm, setProfileForm] = useState({ name: user.name||'', email: user.email||'', phone:'', title:'Senior Attorney', firmName:'LawLibra Legal Partners', bio:'' })
  const [pwForm, setPwForm] = useState({ current:'', next:'', confirm:'' })
  const [tfa, setTfa] = useState(false)
  const [notifPrefs, setNotifPrefs] = useState({ hearings:true, documents:true, cases:true, ai:false, email:true, push:true })
  const [theme, setTheme] = useState('system')
  const [density, setDensity] = useState('comfortable')
  const [showPw, setShowPw] = useState(false)
  const [saved, setSaved] = useState(false)

  const saveProfile = () => {
    if (!profileForm.name || !profileForm.email) { toast.warning('Name and email are required.'); return }
    DB.users.update(user.id, { name: profileForm.name, email: profileForm.email })
    toast.success('Profile updated successfully!')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const changePw = () => {
    if (!pwForm.current) { toast.error('Enter your current password.'); return }
    if (pwForm.next.length < 8) { toast.error('New password must be at least 8 characters.'); return }
    if (pwForm.next !== pwForm.confirm) { toast.error('Passwords do not match.'); return }
    toast.success('Password changed successfully!')
    setPwForm({ current:'', next:'', confirm:'' })
  }

  return (
    <div className="p-6 min-h-screen bg-background">
      

      <div className="mb-8">
        <h2 className="font-headline font-extrabold tracking-tight text-on-surface mb-1" style={{fontSize:'1.5rem'}}>Settings</h2>
        <p className="text-on-surface-variant text-sm font-medium">Manage your profile, security and preferences.</p>
      </div>

      <div className="flex gap-8">
        {/* Sidebar */}
        <aside className="w-56 flex-shrink-0">
          {/* Avatar card */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-5 mb-4 text-center">
            <div className="w-20 h-20 rounded-full ai-gradient flex items-center justify-center text-amber-400 font-black text-2xl mx-auto mb-3 ring-4 ring-amber-400/20">
              {initials(user.name)}
            </div>
            <p className="font-bold text-sm text-on-surface">{user.name}</p>
            <p className="text-xs text-on-surface-variant">{user.email}</p>
            <span className={`inline-block mt-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${user.role==='ADMIN' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
              {user.role}
            </span>
          </div>

          <nav className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-sm transition-colors text-left ${tab === t.key ? 'bg-[#0D1F3C] text-white font-bold' : 'font-semibold text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}`}>
                <span className="material-symbols-outlined text-[18px]" style={tab === t.key ? {fontVariationSettings:"'FILL' 1"} : {}}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0">

          {/* PROFILE */}
          {tab === 'profile' && (
            <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-surface-container-low ai-gradient">
                <h3 className="font-headline font-bold text-white">Profile Information</h3>
                <p className="text-slate-300 text-xs mt-1">Update your personal and professional details.</p>
              </div>
              <div className="p-6 space-y-5">
                <div className="grid grid-cols-2 gap-5">
                  <Field label="Full Name *"><Input value={profileForm.name} onChange={e=>setProfileForm(f=>({...f,name:e.target.value}))} placeholder="Jane Hartwell, Esq."/></Field>
                  <Field label="Email Address *"><Input type="email" value={profileForm.email} onChange={e=>setProfileForm(f=>({...f,email:e.target.value}))} placeholder="jane@lawfirm.com"/></Field>
                  <Field label="Phone Number"><Input type="tel" value={profileForm.phone} onChange={e=>setProfileForm(f=>({...f,phone:e.target.value}))} placeholder="+1 (555) 000-0000"/></Field>
                  <Field label="Title / Position"><Input value={profileForm.title} onChange={e=>setProfileForm(f=>({...f,title:e.target.value}))} placeholder="Senior Attorney"/></Field>
                  <div className="col-span-2">
                    <Field label="Firm Name"><Input value={profileForm.firmName} onChange={e=>setProfileForm(f=>({...f,firmName:e.target.value}))} placeholder="LawLibra Legal Partners"/></Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="Professional Bio">
                      <textarea value={profileForm.bio} onChange={e=>setProfileForm(f=>({...f,bio:e.target.value}))}
                        className="w-full rounded-lg border border-outline-variant/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-secondary/30 transition-all resize-none"
                        rows={3} placeholder="Tell clients about your expertise…"/>
                    </Field>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-surface-container-low">
                  {saved && <span className="text-sm text-emerald-600 font-bold flex items-center gap-1"><span className="material-symbols-outlined text-base">check_circle</span>Saved!</span>}
                  <Btn variant="primary" onClick={saveProfile}>Save Profile</Btn>
                </div>
              </div>
            </div>
          )}

          {/* SECURITY */}
          {tab === 'security' && (
            <div className="space-y-5">
              <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-surface-container-low ai-gradient">
                  <h3 className="font-headline font-bold text-white">Change Password</h3>
                  <p className="text-slate-300 text-xs mt-1">Use a strong, unique password.</p>
                </div>
                <div className="p-6 space-y-4">
                  <Field label="Current Password">
                    <div className="relative">
                      <input type={showPw ? 'text' : 'password'} value={pwForm.current} onChange={e=>setPwForm(f=>({...f,current:e.target.value}))}
                        className="w-full rounded-lg border border-outline-variant/50 px-3 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-secondary/30 transition-all" placeholder="••••••••"/>
                      <button type="button" onClick={() => setShowPw(v=>!v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        <span className="material-symbols-outlined text-lg">{showPw ? 'visibility_off' : 'visibility'}</span>
                      </button>
                    </div>
                  </Field>
                  <Field label="New Password"><Input type="password" value={pwForm.next} onChange={e=>setPwForm(f=>({...f,next:e.target.value}))} placeholder="Min. 8 characters"/></Field>
                  <Field label="Confirm New Password"><Input type="password" value={pwForm.confirm} onChange={e=>setPwForm(f=>({...f,confirm:e.target.value}))} placeholder="Repeat new password"/></Field>
                  <div className="flex justify-end pt-2">
                    <Btn variant="primary" onClick={changePw}>Update Password</Btn>
                  </div>
                </div>
              </div>

              <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-surface-container-low">
                  <h3 className="font-headline font-bold text-on-surface">Two-Factor Authentication</h3>
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm text-on-surface">2FA Status</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">{tfa ? 'Your account is secured with 2FA.' : 'Enable 2FA for extra security.'}</p>
                    </div>
                    <button onClick={() => { setTfa(v=>!v); toast.info(tfa ? '2FA disabled.' : '2FA enabled!') }}
                      className={`relative w-14 h-7 rounded-full transition-all ${tfa ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                      <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform ${tfa ? 'translate-x-7' : ''}`} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden border border-red-100">
                <div className="px-6 py-5 border-b border-red-100">
                  <h3 className="font-headline font-bold text-red-700">Danger Zone</h3>
                </div>
                <div className="p-6 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm text-on-surface">Delete Account</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">This will permanently delete all your data.</p>
                  </div>
                  <button onClick={() => toast.warning('Account deletion is disabled in demo mode.')}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition-colors">
                    Delete Account
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* NOTIFICATIONS */}
          {tab === 'notifs' && (
            <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-surface-container-low ai-gradient">
                <h3 className="font-headline font-bold text-white">Notification Preferences</h3>
                <p className="text-slate-300 text-xs mt-1">Choose what you'd like to be notified about.</p>
              </div>
              <div className="p-6 space-y-1 divide-y divide-surface-container-low">
                {[
                  { key:'hearings',  label:'Hearing Reminders', desc:'Get reminders before court hearings.' },
                  { key:'documents', label:'Document Activity',  desc:'Notify when documents are uploaded or updated.' },
                  { key:'cases',     label:'Case Updates',       desc:'Alerts for status changes to assigned cases.' },
                  { key:'ai',        label:'AI Counsel Activity',desc:'Notifications from Libra AI responses.' },
                  { key:'email',     label:'Email Digest',       desc:'Daily summary via email.' },
                  { key:'push',      label:'Push Notifications', desc:'Real-time browser push alerts.' },
                ].map(p => (
                  <div key={p.key} className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-semibold text-sm text-on-surface">{p.label}</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">{p.desc}</p>
                    </div>
                    <button onClick={() => { setNotifPrefs(f=>({...f,[p.key]:!f[p.key]})); toast.info('Preference saved.') }}
                      className={`relative w-12 h-6 rounded-full transition-all flex-shrink-0 ${notifPrefs[p.key] ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform ${notifPrefs[p.key] ? 'translate-x-6' : ''}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* APPEARANCE */}
          {tab === 'appearance' && (
            <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-surface-container-low ai-gradient">
                <h3 className="font-headline font-bold text-white">Appearance</h3>
                <p className="text-slate-300 text-xs mt-1">Customise your workspace theme and layout density.</p>
              </div>
              <div className="p-6 space-y-8">
                <div>
                  <p className="font-semibold text-sm text-on-surface mb-4">Theme</p>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { key:'light',  label:'Light',  preview:'bg-white border-2' },
                      { key:'dark',   label:'Dark',   preview:'bg-slate-900 border-2' },
                      { key:'system', label:'System', preview:'bg-gradient-to-br from-white to-slate-900 border-2' },
                    ].map(t => (
                      <button key={t.key} onClick={() => { setTheme(t.key); toast.info(`Theme: ${t.label}`) }}
                        className={`p-4 rounded-xl border-2 transition-all ${theme===t.key ? 'border-secondary shadow-md' : 'border-outline-variant/40 hover:border-outline-variant'}`}>
                        <div className={`h-16 rounded-lg mb-3 ${t.preview} ${theme===t.key ? 'border-secondary' : 'border-slate-200'}`} />
                        <p className={`text-xs font-bold text-center ${theme===t.key ? 'text-secondary' : 'text-on-surface-variant'}`}>{t.label}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-sm text-on-surface mb-4">Density</p>
                  <div className="flex gap-3">
                    {['compact','comfortable','spacious'].map(d => (
                      <button key={d} onClick={() => { setDensity(d); toast.info(`Density: ${d}`) }}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-bold capitalize border-2 transition-all ${density===d ? 'border-secondary text-secondary bg-secondary-container/20' : 'border-outline-variant/40 text-on-surface-variant hover:border-outline-variant'}`}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
