import { useState, useEffect } from 'react'
import { supabase } from './lib/supabaseClient'
import { subscribe, invoke } from './lib/ipc'
import { LogoMark } from './components/Logo'

// =============================================================================
// AuthScreen — Login / Register with email+password or Google OAuth.
// Google flow: in-app OAuth window → Google → Supabase → briefos://auth/callback.
// The redirect is intercepted inside that window (auth:openOAuthWindow), so users
// never see the scheme; it stays briefos:// because that URL is on the Supabase
// redirect allow-list.
// Main process catches the deep link and sends 'auth:deeplink' to the renderer.
// =============================================================================

const REDIRECT_URL = 'briefos://auth/callback'

type Tab = 'login' | 'register'

interface Props {
  onAuthSuccess: (isNew: boolean) => void
}

export default function AuthScreen({ onAuthSuccess }: Props) {
  const [tab, setTab] = useState<Tab>('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPass, setShowPass] = useState(false)

  // Listen for OAuth callback deep link from main process.
  useEffect(() => {
    const unsub = subscribe('auth:deeplink', async (url: string) => {
      console.log('[auth] deep link received:', url)
      setGoogleLoading(true)
      setError('')
      try {
        const parsed = new URL(url)
        // Implicit flow: tokens are in the URL fragment (#access_token=...&refresh_token=...)
        const fragment = new URLSearchParams(parsed.hash.slice(1))
        const accessToken = fragment.get('access_token')
        const refreshToken = fragment.get('refresh_token')

        if (accessToken && refreshToken) {
          const { error: err } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          if (err) throw new Error(err.message)
        } else {
          // PKCE flow: code is in query params (?code=...)
          const { error: err } = await supabase.auth.exchangeCodeForSession(url)
          if (err) throw new Error(err.message)
        }

        const { data: { user } } = await supabase.auth.getUser()
        const isNew = isNewUser(user?.created_at)
        onAuthSuccess(isNew)
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setGoogleLoading(false)
      }
    })
    return unsub
  }, [onAuthSuccess])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (tab === 'register' && password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    try {
      if (tab === 'register') {
        const { data, error: err } = await supabase.auth.signUp({ email, password })
        if (err) throw new Error(err.message)
        if (data.session) {
          onAuthSuccess(true)
        } else {
          setError('Check your email to confirm your account, then log in.')
        }
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) throw new Error(err.message)
        const isNew = isNewUser(data.user?.created_at)
        onAuthSuccess(isNew)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setError('')
    setGoogleLoading(true)
    try {
      // Get the OAuth URL without opening anything yet.
      const { data, error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: REDIRECT_URL,
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' }
        }
      })
      if (err) throw new Error(err.message)
      if (!data.url) throw new Error('No OAuth URL returned')
      // Installed app: opens the user's browser; dev: an in-app window.
      await invoke('auth:openOAuthWindow', data.url)
      // Loading stays true until auth:deeplink arrives (see useEffect above).
    } catch (err) {
      setError((err as Error).message)
      setGoogleLoading(false)
    }
  }

  const inputCls =
    'w-full text-[13px] bg-white/70 border border-border rounded-xl px-3.5 py-2.5 text-text placeholder:text-text-4 focus:border-accent focus:ring-4 focus:ring-accent/15 focus:outline-none transition-all'

  return (
    <div className="min-h-screen flex font-body text-text p-3 gap-3">
      {/* ── Left: brand panel ── */}
      <div className="bg-ink relative w-[420px] flex-shrink-0 rounded-panel overflow-hidden flex flex-col justify-between p-10 text-white">
        <div className="pointer-events-none absolute -top-28 -left-20 h-80 w-80 rounded-full bg-accent/55 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-[-80px] h-96 w-96 rounded-full bg-accent/30 blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-2.5">
            <LogoMark size={40} className="drop-shadow-[0_10px_24px_rgba(255,106,61,.55)]" />
            <span className="font-display font-bold text-[24px] tracking-[-0.02em]">Minutama</span>
            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.1em] text-accent-pale">
              Agent
            </span>
          </div>
          <h1 className="font-display font-bold text-[30px] leading-[1.1] mt-8">
            Your AI meeting agent.
            <span className="block text-white/55">No bot joins the call.</span>
          </h1>
          <p className="text-[13px] text-white/60 mt-4 leading-relaxed max-w-[300px]">
            Minutama listens on your computer, writes the notes, and sends decisions and next steps where you work.
          </p>
        </div>

        <div className="relative space-y-4">
          {[
            { icon: 'microphone-off', title: 'No meeting bot', desc: 'Captures your mic and computer audio — nobody sees a recorder join.' },
            { icon: 'sparkles', title: 'Notes that write themselves', desc: 'Type a few words; Minutama turns them into clear notes, decisions and action items.' },
            { icon: 'shield-lock', title: 'Private by default', desc: 'Audio is never stored. Notes live on your computer.' }
          ].map((f) => (
            <div key={f.icon} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <i className={`ti ti-${f.icon} text-[16px] text-accent-pale`} />
              </div>
              <div>
                <div className="text-[12.5px] font-semibold">{f.title}</div>
                <div className="text-[11.5px] text-white/50 mt-0.5 leading-relaxed">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => window.open('https://minutama.com', '_blank')}
          className="relative self-start text-[11px] text-white/40 hover:text-white/80 transition-all"
        >
          minutama.com
        </button>
      </div>

      {/* ── Right: form ── */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="glass-strong w-full max-w-[400px] rounded-panel p-8">
          <h2 className="font-display font-bold text-[24px] mb-1">
            {tab === 'register' ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="text-[13px] text-text-3 mb-6">
            {tab === 'register' ? '10 free meetings a month — no card needed.' : 'Sign in to continue to Minutama.'}
          </p>

          <div className="flex gap-1 bg-sand/70 rounded-xl p-1 mb-5">
            {(['register', 'login'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError('') }}
                className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all ${
                  tab === t ? 'bg-white shadow-[0_1px_3px_rgba(21,23,28,.1)] text-text' : 'text-text-3 hover:text-text-2'
                }`}
              >
                {t === 'register' ? 'Create account' : 'Sign in'}
              </button>
            ))}
          </div>

          <button
            onClick={handleGoogle}
            disabled={googleLoading || loading}
            className="w-full flex items-center justify-center gap-2.5 border border-border hover:border-accent/40 bg-white/80 hover:bg-white rounded-xl py-2.5 text-[13px] font-medium text-text transition-all mb-5 disabled:opacity-60"
          >
            {googleLoading ? <i className="ti ti-loader-2 animate-spin-slow text-[16px] text-accent" /> : <GoogleIcon />}
            {googleLoading ? 'Finish signing in in your browser…' : 'Continue with Google'}
          </button>
          {googleLoading && (
            <p className="-mt-3 mb-5 text-center text-[11.5px] text-text-3">
              Your browser opened Google sign-in. When it asks to open Minutama, click “Open”.{' '}
              <button type="button" onClick={() => setGoogleLoading(false)} className="underline hover:text-text-2">
                Cancel
              </button>
            </p>
          )}

          <Divider />

          <form onSubmit={handleSubmit} className="space-y-4 mt-5">
            <div>
              <label className="block text-[12px] font-medium text-text-2 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                className={inputCls}
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-text-2 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  required
                  className={`${inputCls} pr-10`}
                />
                <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-2">
                  <i className={`ti ti-${showPass ? 'eye-off' : 'eye'} text-[15px]`} />
                </button>
              </div>
            </div>

            {tab === 'register' && (
              <div>
                <label className="block text-[12px] font-medium text-text-2 mb-1.5">Confirm password</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  required
                  className={inputCls}
                />
              </div>
            )}

            {error && (
              <div className="text-[12px] text-red bg-red-soft border border-red/20 rounded-xl px-3 py-2 flex items-center gap-1.5">
                <i className="ti ti-alert-circle text-[14px] flex-shrink-0" />{error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="btn-accent w-full rounded-xl py-2.5 text-[13px] font-semibold flex items-center justify-center gap-2 transition-all active:scale-[.98] disabled:opacity-60"
            >
              {loading ? (
                <><i className="ti ti-loader-2 animate-spin-slow text-[15px]" /> Please wait…</>
              ) : tab === 'register' ? (
                <><i className="ti ti-user-plus text-[15px]" /> Create account</>
              ) : (
                <><i className="ti ti-login text-[15px]" /> Sign in</>
              )}
            </button>
          </form>

          <p className="text-[11px] text-text-3 mt-5 text-center leading-relaxed">
            By continuing you agree to the{' '}
            <button type="button" onClick={() => window.open('https://minutama.com/terms', '_blank')} className="underline hover:text-text-2">Terms</button>
            {' '}and{' '}
            <button type="button" onClick={() => window.open('https://minutama.com/privacy', '_blank')} className="underline hover:text-text-2">Privacy Policy</button>.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** A user is "new" if their account was created within the last 30 seconds. */
function isNewUser(createdAt?: string): boolean {
  if (!createdAt) return false
  return Date.now() - new Date(createdAt).getTime() < 30_000
}

function Divider() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[11px] text-text-4">or</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
