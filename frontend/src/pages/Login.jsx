import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, register } from '../api/auth.js'

export default function Login() {
  const navigate = useNavigate()
  const [panel, setPanel] = useState('login')
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [regForm, setRegForm] = useState({ name: '', email: '', password: '', role: 'LAWYER' })
  const [loginError, setLoginError] = useState('')
  const [regError, setRegError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [showRegPw, setShowRegPw] = useState(false)
  const [pwStrength, setPwStrength] = useState(0)

  const calcStrength = (pw) => {
    let s = 0
    if (pw.length >= 8) s++
    if (/[A-Z]/.test(pw)) s++
    if (/[0-9]/.test(pw)) s++
    if (/[^A-Za-z0-9]/.test(pw)) s++
    return s
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!loginForm.email || !loginForm.password) { setLoginError('Please enter your email and password.'); return }
    setLoading(true)
    setLoginError('')
    try {
      await login({ email: loginForm.email, password: loginForm.password })
      // auth.js fires 'auth-change' and saves session to sessionStorage
      navigate('/dashboard')
    } catch (err) {
      setLoginError(err.message || 'Invalid credentials. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    if (!regForm.name || !regForm.email || !regForm.password) { setRegError('All fields are required.'); return }
    if (regForm.password.length < 8) { setRegError('Password must be at least 8 characters.'); return }
    setLoading(true)
    setRegError('')
    try {
      await register({ name: regForm.name, email: regForm.email, password: regForm.password, role: regForm.role })
      // On success switch to login panel so user can sign in with new credentials
      setPanel('login')
      setLoginForm(f => ({ ...f, email: regForm.email }))
    } catch (err) {
      setRegError(err.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const strengthColors = ['bg-red-400', 'bg-amber-400', 'bg-yellow-400', 'bg-emerald-400']
  const strengthLabels = ['Too weak', 'Fair', 'Good', 'Strong']

  return (
    <main className="flex min-h-screen font-body text-on-surface bg-surface antialiased">
      {/* Left panel */}
      <section className="hidden lg:flex lg:w-1/2 relative items-center justify-center p-12 overflow-hidden"
        style={{ background: 'linear-gradient(135deg,#101c2e 0%,#3c475b 100%)' }}>
        <div className="relative z-10 max-w-lg w-full">
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-4xl" style={{ color: '#fed977', fontVariationSettings: "'FILL' 1" }}>balance</span>
              <h1 className="font-headline font-extrabold text-4xl tracking-tight text-white">LawLibra</h1>
            </div>
            <div className="h-1 w-16 rounded-full" style={{ background: '#fed977' }} />
          </div>
          <div className="space-y-8">
            <blockquote className="text-white">
              <p className="font-headline text-3xl font-light leading-relaxed italic">
                "The law is not an end in itself, but a tireless quest for justice."
              </p>
              <footer className="mt-4 text-on-primary-container font-label uppercase tracking-widest text-sm">
                — The Sovereign Counsel
              </footer>
            </blockquote>
            <div className="pt-8 grid grid-cols-2 gap-6 border-t border-white/10">
              <div>
                <div className="font-headline text-2xl font-bold" style={{ color: '#fed977' }}>12k+</div>
                <div className="text-on-primary-container text-xs uppercase tracking-tighter">Cases Managed</div>
              </div>
              <div>
                <div className="font-headline text-2xl font-bold" style={{ color: '#fed977' }}>99.4%</div>
                <div className="text-on-primary-container text-xs uppercase tracking-tighter">Uptime Reliability</div>
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white/70 space-y-1">
              <p className="font-bold text-white/90 mb-2">⚡ Demo Credentials</p>
              <p>Admin: <span className="font-mono" style={{ color: '#fed977' }}>admin@lawlibra.pro</span> / <span className="font-mono">Admin@123</span></p>
              <p>Lawyer: <span className="font-mono" style={{ color: '#fed977' }}>lawyer@lawlibra.pro</span> / <span className="font-mono">Lawyer@123</span></p>
            </div>
          </div>
        </div>
      </section>

      {/* Right panel */}
      <section className="w-full lg:w-1/2 flex items-center justify-center bg-surface-container-lowest p-8 md:p-16">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex flex-col items-center mb-10">
            <span className="material-symbols-outlined text-5xl mb-2" style={{ color: '#755b00', fontVariationSettings: "'FILL' 1" }}>balance</span>
            <h1 className="font-headline font-black text-3xl text-primary-container">LawLibra</h1>
          </div>

          {/* Tabs */}
          <div className="flex mb-8 bg-surface-container rounded-xl p-1">
            <button
              onClick={() => setPanel('login')}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${panel === 'login' ? 'bg-white text-primary-container shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
            >Sign In</button>
            <button
              onClick={() => setPanel('register')}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${panel === 'register' ? 'bg-white text-primary-container shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
            >Register</button>
          </div>

          {/* Login Panel */}
          {panel === 'login' && (
            <div>
              <div className="mb-8">
                <h2 className="font-headline text-2xl font-bold text-primary-container mb-1">Access Your Chamber</h2>
                <p className="text-on-surface-variant text-sm">Sign in to manage your sovereign legal portfolio.</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-5" noValidate>
                {loginError && (
                  <div className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-4 py-3">{loginError}</div>
                )}
                <div className="space-y-1.5">
                  <label className="font-label text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Email Address</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-lg">mail</span>
                    <input type="email" value={loginForm.email} onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="name@lawlibra.pro"
                      className="w-full pl-12 pr-4 py-4 bg-surface-container-low border-none rounded-xl text-on-surface placeholder:text-outline-variant focus:ring-2 focus:ring-secondary-container transition-all outline-none" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="font-label text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Password</label>
                    <button type="button" className="text-secondary text-xs font-bold hover:underline">Forgot Password?</button>
                  </div>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-lg">lock</span>
                    <input type={showPw ? 'text' : 'password'} value={loginForm.password} onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="••••••••••••"
                      className="w-full pl-12 pr-12 py-4 bg-surface-container-low border-none rounded-xl text-on-surface placeholder:text-outline-variant focus:ring-2 focus:ring-secondary-container transition-all outline-none" />
                    <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface">
                      <span className="material-symbols-outlined text-lg">{showPw ? 'visibility_off' : 'visibility'}</span>
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full py-4 bg-secondary-container text-on-secondary-container font-headline font-bold text-lg rounded-xl shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70">
                  {loading ? (
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  ) : <><span>Sign In</span><span className="material-symbols-outlined">arrow_forward</span></>}
                </button>
              </form>
              <p className="text-center text-on-surface-variant text-sm mt-8">
                New counsel? <button onClick={() => setPanel('register')} className="text-primary-container font-bold hover:underline">Request Credentials</button>
              </p>
            </div>
          )}

          {/* Register Panel */}
          {panel === 'register' && (
            <div>
              <div className="mb-8">
                <h2 className="font-headline text-2xl font-bold text-primary-container mb-1">Join the Sovereign Counsel</h2>
                <p className="text-on-surface-variant text-sm">Create your secure legal practice account.</p>
              </div>
              <form onSubmit={handleRegister} className="space-y-4" noValidate>
                {regError && (
                  <div className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-4 py-3">{regError}</div>
                )}
                <div className="space-y-1.5">
                  <label className="font-label text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Full Name</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-lg">person</span>
                    <input type="text" value={regForm.name} onChange={e => setRegForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Jane Hartwell, Esq."
                      className="w-full pl-12 pr-4 py-3.5 bg-surface-container-low border-none rounded-xl text-on-surface placeholder:text-outline-variant focus:ring-2 focus:ring-secondary-container transition-all outline-none" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="font-label text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Email Address</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-lg">mail</span>
                    <input type="email" value={regForm.email} onChange={e => setRegForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="jane@lawfirm.com"
                      className="w-full pl-12 pr-4 py-3.5 bg-surface-container-low border-none rounded-xl text-on-surface placeholder:text-outline-variant focus:ring-2 focus:ring-secondary-container transition-all outline-none" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="font-label text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Password</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-lg">lock</span>
                    <input type={showRegPw ? 'text' : 'password'} value={regForm.password}
                      onChange={e => { setRegForm(f => ({ ...f, password: e.target.value })); setPwStrength(calcStrength(e.target.value)) }}
                      placeholder="Min. 8 characters"
                      className="w-full pl-12 pr-12 py-3.5 bg-surface-container-low border-none rounded-xl text-on-surface placeholder:text-outline-variant focus:ring-2 focus:ring-secondary-container transition-all outline-none" />
                    <button type="button" onClick={() => setShowRegPw(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface">
                      <span className="material-symbols-outlined text-lg">{showRegPw ? 'visibility_off' : 'visibility'}</span>
                    </button>
                  </div>
                  {regForm.password && (
                    <div className="space-y-1">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map(i => (
                          <div key={i} className={`h-1 flex-1 rounded-full ${i <= pwStrength ? strengthColors[pwStrength - 1] : 'bg-slate-200'}`} />
                        ))}
                      </div>
                      <p className="text-xs text-slate-500">{strengthLabels[pwStrength - 1] || ''}</p>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="font-label text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Role</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-lg">gavel</span>
                    <select value={regForm.role} onChange={e => setRegForm(f => ({ ...f, role: e.target.value }))}
                      className="w-full pl-12 pr-4 py-3.5 bg-surface-container-low border-none rounded-xl text-on-surface focus:ring-2 focus:ring-secondary-container transition-all outline-none appearance-none">
                      <option value="LAWYER">Attorney / Lawyer</option>
                      <option value="ADMIN">Firm Administrator</option>
                    </select>
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full py-4 text-white font-headline font-bold text-lg rounded-xl shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-70 ai-gradient">
                  {loading ? (
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  ) : <><span>Create Account</span><span className="material-symbols-outlined">how_to_reg</span></>}
                </button>
              </form>
              <p className="text-center text-on-surface-variant text-sm mt-6">
                Already registered? <button onClick={() => setPanel('login')} className="text-primary-container font-bold hover:underline">Sign In</button>
              </p>
            </div>
          )}

          <div className="mt-10 flex justify-center space-x-6 text-outline-variant text-xs font-label uppercase tracking-widest">
            <a className="hover:text-on-surface" href="#">Terms</a>
            <a className="hover:text-on-surface" href="#">Security</a>
            <a className="hover:text-on-surface" href="#">Support</a>
          </div>
        </div>
      </section>

    </main>
  )
}
