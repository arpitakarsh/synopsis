import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'

function InputField({ label, type = 'text', placeholder, value, onChange, error }) {
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'

  return (
    <div className="space-y-2 animate-fade-up">
      <label className="block text-sm font-semibold text-gray-700">{label}</label>
      <div className="relative group">
        <input
          type={isPassword && showPassword ? 'text' : type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          className={`w-full px-4 py-3 text-sm rounded-lg border bg-white text-gray-900 placeholder-gray-400 transition-colors duration-200 outline-none ${
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/10'
              : 'border-gray-300 hover:border-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10'
          }`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-colors p-1"
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        )}
      </div>
      {error && <p className="text-xs font-medium text-red-500 mt-1.5 pl-1 animate-fade-up">{error}</p>}
    </div>
  )
}

export default function AuthPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [registerForm, setRegisterForm] = useState({
    companyName: '', name: '', email: '', password: '', confirmPassword: '',
  })

  function validateLogin() {
    const e = {}
    if (!loginForm.email) e.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(loginForm.email)) e.email = 'Enter a valid email'
    if (!loginForm.password) e.password = 'Password is required'
    return e
  }

  function validateRegister() {
    const e = {}
    if (!registerForm.companyName) e.companyName = 'Company name is required'
    if (!registerForm.name) e.name = 'Your name is required'
    if (!registerForm.email) e.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(registerForm.email)) e.email = 'Enter a valid email'
    if (!registerForm.password) e.password = 'Password is required'
    else if (registerForm.password.length < 8) e.password = 'Minimum 8 characters'
    if (registerForm.confirmPassword !== registerForm.password) e.confirmPassword = "Passwords don't match"
    return e
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setApiError('')
    const errs = mode === 'login' ? validateLogin() : validateRegister()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})
    setLoading(true)

    try {
      if (mode === 'login') {
        const res = await api.post('/auth/login', {
          email: loginForm.email,
          password: loginForm.password,
        })
        localStorage.setItem('token', res.data.token)
        localStorage.setItem('user', JSON.stringify(res.data.user))
        navigate('/app/dashboard')
      } else {
        const res = await api.post('/auth/register', {
          companyName: registerForm.companyName,
          name: registerForm.name,
          email: registerForm.email,
          password: registerForm.password,
        })
        localStorage.setItem('token', res.data.token)
        localStorage.setItem('user', JSON.stringify(res.data.user))
        navigate('/app/dashboard')
      }
    } catch (err) {
      setApiError(err.response?.data?.error || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function switchMode(m) {
    setMode(m)
    setErrors({})
    setApiError('')
  }

  function handleBack() {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  const stats = [
    { value: '60s', label: 'Average analysis time' },
    { value: '17+', label: 'Clause types detected' },
    { value: '$299', label: 'Per month, all features' },
  ]

  return (
    <div className="auth-shell min-h-screen flex items-center justify-center p-4 sm:p-7 lg:p-10 selection:bg-blue-100 selection:text-blue-900 relative z-0">
      <div
        className="w-full max-w-6xl bg-white rounded-[24px] border border-gray-200 overflow-hidden flex relative z-10 animate-fade-up auth-card"
        style={{ minHeight: '670px' }}
      >
        <div className="flex-1 flex flex-col justify-center px-6 sm:px-10 lg:px-14 py-10 lg:py-12 relative z-10">
          <button
            type="button"
            onClick={handleBack}
            className="w-fit mb-7 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-all duration-150"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Back
          </button>

          <div className="flex items-center gap-3 mb-8 lg:mb-10 cursor-pointer group w-fit" onClick={() => navigate('/')}>
            <svg width="32" height="32" viewBox="0 0 28 28" fill="none" className="transition-transform duration-300 group-hover:scale-105">
              <rect width="28" height="28" rx="7" fill="#2563EB" />
              <path d="M7 9h14M7 14h10M7 19h7" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <circle cx="20" cy="19" r="3" fill="#60A5FA" />
            </svg>
            <span className="font-extrabold text-gray-900 text-xl tracking-tight">ContractScan</span>
            <span className="text-[11px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full shadow-sm">AI</span>
          </div>

          <div className="mb-7 lg:mb-8 animate-fade-up delay-100">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-2 tracking-tight">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h1>
            <p className="text-[15px] text-gray-500 font-medium">
              {mode === 'login'
                ? 'Sign in to your workspace to continue.'
                : 'Start analyzing contracts in under 60 seconds.'}
            </p>
          </div>

          <div className="w-full flex justify-center mb-7 lg:mb-8 animate-fade-up delay-100">
            <div className="auth-switch relative grid grid-cols-2 rounded-2xl p-1.5 w-full max-w-[320px] bg-gray-100 border border-gray-200">
              <span
                className="auth-switch-pill absolute top-1.5 left-1.5 bottom-1.5 rounded-xl bg-white shadow-sm"
                style={{
                  width: 'calc(50% - 6px)',
                  transform: mode === 'login' ? 'translateX(0)' : 'translateX(100%)',
                }}
              />
              {['login', 'register'].map((m) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={`relative z-10 px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
                    mode === m
                      ? 'text-blue-700'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {m === 'login' ? 'Sign In' : 'Sign Up'}
                </button>
              ))}
            </div>
          </div>

          {apiError && (
            <div className="mb-6 px-5 py-4 bg-red-50 border border-red-200 rounded-lg text-sm font-medium text-red-600 animate-fade-up flex items-center gap-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {apiError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-4 animate-fade-up delay-200">
              {mode === 'register' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <InputField
                    label="Company Name"
                    placeholder="Acme Corporation"
                    value={registerForm.companyName}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, companyName: e.target.value }))}
                    error={errors.companyName}
                  />
                  <InputField
                    label="Your Full Name"
                    placeholder="Arpit Sharma"
                    value={registerForm.name}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, name: e.target.value }))}
                    error={errors.name}
                  />
                </div>
              )}
              <InputField
                label="Work Email"
                type="email"
                placeholder="you@company.com"
                value={mode === 'login' ? loginForm.email : registerForm.email}
                onChange={(e) => (
                  mode === 'login'
                    ? setLoginForm((f) => ({ ...f, email: e.target.value }))
                    : setRegisterForm((f) => ({ ...f, email: e.target.value }))
                )}
                error={errors.email}
              />
              <InputField
                label="Password"
                type="password"
                placeholder={mode === 'register' ? 'Min. 8 characters' : 'Enter your password'}
                value={mode === 'login' ? loginForm.password : registerForm.password}
                onChange={(e) => (
                  mode === 'login'
                    ? setLoginForm((f) => ({ ...f, password: e.target.value }))
                    : setRegisterForm((f) => ({ ...f, password: e.target.value }))
                )}
                error={errors.password}
              />
              {mode === 'register' && (
                <InputField
                  label="Confirm Password"
                  type="password"
                  placeholder="Repeat your password"
                  value={registerForm.confirmPassword}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  error={errors.confirmPassword}
                />
              )}
            </div>

            {mode === 'login' && (
              <div className="flex justify-end animate-fade-up delay-300">
                <button type="button" className="text-sm text-blue-600 hover:text-blue-800 font-bold transition-colors duration-200">
                  Forgot password?
                </button>
              </div>
            )}

            <div className="pt-3 animate-fade-up delay-300">
              <button
                type="submit"
                disabled={loading}
                className={`w-full py-3.5 px-4 rounded-xl text-sm font-bold text-white transition-colors duration-200 ${
                  loading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-3">
                    <svg className="animate-spin w-5 h-5 text-white/80" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                      <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                  </span>
                ) : (
                  mode === 'login' ? 'Sign In' : 'Create Account'
                )}
              </button>
            </div>
          </form>

          <p className="mt-7 lg:mt-8 text-center text-sm font-medium text-gray-500 animate-fade-up delay-300">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
              className="text-blue-600 font-bold hover:text-blue-800 transition-colors duration-200 ml-1"
            >
              {mode === 'login' ? 'Sign up free' : 'Sign in'}
            </button>
          </p>
        </div>

        <div className="hidden lg:flex w-[460px] bg-gradient-to-br from-blue-600 to-indigo-800 flex-col justify-between p-12 xl:p-14 relative overflow-hidden text-white auth-side">
          <div className="absolute top-0 right-0 -mt-24 -mr-24 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -mb-24 -ml-24 w-72 h-72 bg-indigo-900/40 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 animate-fade-up">
            <div className="w-12 h-12 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl flex items-center justify-center mb-10 shadow-xl">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <h2 className="text-3xl font-extrabold text-white mb-4 leading-[1.2] tracking-tight">
              Know your contract risks before you sign.
            </h2>
            <p className="text-base text-blue-100/90 leading-relaxed font-medium">
              ContractScan AI analyzes vendor contracts in seconds, flagging risky clauses, scoring liability exposure, and giving your team actionable negotiation language.
            </p>
          </div>

          <div className="space-y-4 relative z-10 animate-fade-up delay-200">
            {stats.map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-5 bg-white/10 border border-white/20 hover:bg-white/15 transition-colors duration-300 rounded-2xl px-5 py-4"
              >
                <span className="text-2xl font-extrabold text-white tracking-tight w-16">{s.value}</span>
                <span className="text-sm font-semibold text-blue-100">{s.label}</span>
              </div>
            ))}
          </div>

          <p className="text-sm font-medium text-blue-200/80 relative z-10 animate-fade-up delay-300 pt-8 border-t border-white/10">
            Trusted by procurement teams at growth-stage companies.
          </p>
        </div>
      </div>

      <style>{`
        .auth-shell {
          background:
            radial-gradient(1100px 580px at -5% -12%, rgba(191, 219, 254, 0.55) 0%, rgba(191, 219, 254, 0) 65%),
            radial-gradient(900px 520px at 108% 108%, rgba(224, 231, 255, 0.6) 0%, rgba(224, 231, 255, 0) 62%),
            #f9fafb;
        }
        .auth-card { box-shadow: none; }
        .auth-switch-pill {
          transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .auth-side::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.01) 36%, rgba(30,64,175,0.17) 100%);
          pointer-events: none;
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-up {
          animation: fadeUp 0.54s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
          will-change: transform, opacity;
        }
        .delay-100 { animation-delay: 100ms; }
        .delay-200 { animation-delay: 200ms; }
        .delay-300 { animation-delay: 300ms; }
        @media (max-width: 1023px) {
          .auth-card { min-height: auto !important; }
        }
      `}</style>
    </div>
  )
}