import { useState, useEffect } from 'react'
import { supabase } from './lib/supabaseClient'
import { subscribe, invoke } from './lib/ipc'

// =============================================================================
// AuthScreen — Login / Register with email+password or Google OAuth.
// Google flow: opens system browser → Google → Supabase → briefos://auth/callback
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
      // Open inside a child BrowserWindow so we can intercept the briefos:// redirect.
      await invoke('auth:openOAuthWindow', data.url)
      // Loading stays true until auth:deeplink arrives (see useEffect above).
    } catch (err) {
      setError((err as Error).message)
      setGoogleLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex font-body text-text">
      {/* ── Left panel ── */}
      <div className="w-[420px] flex-shrink-0 bg-blue-deep flex flex-col justify-between p-10">
        {/* Logos */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-[22px] h-[22px] rounded-md bg-white/10 flex items-center justify-center">
              <i className="ti ti-code text-[13px] text-white/70" />
            </div>
            <span className="text-[12px] font-semibold text-white/50 tracking-wide uppercase">Developer</span>
            <span className="text-white/20 mx-1">·</span>
            <span className="text-[12px] font-bold text-white/70">Nocodly</span>
          </div>

          <div className="flex items-center gap-2.5 mt-6">
            <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center shadow-[0_4px_16px_rgba(26,86,219,.5)]">
              <i className="ti ti-broadcast text-[22px] text-white" />
            </div>
            <span className="font-display font-extrabold text-[26px] text-white">
              Brief<span className="text-[#7CB9FF]">OS</span>
            </span>
          </div>

          <p className="text-[13px] text-white/50 mt-3 leading-relaxed max-w-[280px]">
            AI meeting recorder that runs entirely on your computer.
          </p>
        </div>

        {/* Trust features */}
        <div className="space-y-5">
          {[
            { icon: 'device-laptop', title: 'Stored on your device', desc: 'All recordings and transcripts stay on your computer. Never uploaded.' },
            { icon: 'lock', title: 'Direct API calls only', desc: 'Audio goes straight to OpenAI or Anthropic — no middleman server.' },
            { icon: 'eye-off', title: 'Zero telemetry', desc: 'We don\'t track what you record, who you speak with, or when.' },
          ].map((f) => (
            <div key={f.icon} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <i className={`ti ti-${f.icon} text-[16px] text-[#7CB9FF]`} />
              </div>
              <div>
                <div className="text-[12px] font-semibold text-white">{f.title}</div>
                <div className="text-[11px] text-white/45 mt-0.5 leading-relaxed">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 mt-8">
          <span className="text-[11px] text-white/30">Built by</span>
          <button
            onClick={() => window.open('https://nocodly.com', '_blank')}
            className="text-[11px] text-white/50 hover:text-white/80 transition-all underline underline-offset-2"
          >
            nocodly.com
          </button>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex items-center justify-center p-10">
        <div className="w-full max-w-[380px]">
          <h2 className="font-display font-extrabold text-[24px] text-blue-deep mb-1">
            {tab === 'register' ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="text-[13px] text-text-3 mb-7">
            {tab === 'register' ? '10 free meetings included — no card needed.' : 'Sign in to continue to BriefOS.'}
          </p>

          {/* Tabs */}
          <div className="flex gap-1 bg-bg-2 rounded-lg p-1 mb-6">
            {(['register', 'login'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError('') }}
                className={`flex-1 py-2 rounded-md text-[12px] font-semibold transition-all ${
                  tab === t ? 'bg-surface shadow text-text' : 'text-text-3 hover:text-text-2'
                }`}
              >
                {t === 'register' ? 'Create account' : 'Sign in'}
              </button>
            ))}
          </div>

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={googleLoading || loading}
            className="w-full flex items-center justify-center gap-2.5 border border-border hover:border-accent/50 bg-surface hover:bg-blue-tint/30 rounded-lg py-2.5 text-[13px] font-medium text-text transition-all mb-5 disabled:opacity-60"
          >
            {googleLoading ? <i className="ti ti-loader-2 animate-spin-slow text-[16px] text-accent" /> : <GoogleIcon />}
            {googleLoading ? 'Waiting for browser…' : 'Continue with Google'}
          </button>

          <Divider />

          <form onSubmit={handleSubmit} className="space-y-4 mt-5">
            <div>
              <label className="block text-[12px] font-medium text-text mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                className="w-full text-[13px] bg-bg border border-border rounded-lg px-3.5 py-2.5 text-text placeholder:text-text-4 focus:border-accent focus:outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-text mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  required
                  className="w-full text-[13px] bg-bg border border-border rounded-lg px-3.5 py-2.5 pr-10 text-text placeholder:text-text-4 focus:border-accent focus:outline-none transition-all"
                />
                <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-2">
                  <i className={`ti ti-${showPass ? 'eye-off' : 'eye'} text-[15px]`} />
                </button>
              </div>
            </div>

            {tab === 'register' && (
              <div>
                <label className="block text-[12px] font-medium text-text mb-1.5">Confirm password</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  required
                  className="w-full text-[13px] bg-bg border border-border rounded-lg px-3.5 py-2.5 text-text placeholder:text-text-4 focus:border-accent focus:outline-none transition-all"
                />
              </div>
            )}

            {error && (
              <div className="text-[12px] text-red bg-red-soft border border-red/20 rounded-lg px-3 py-2 flex items-center gap-1.5">
                <i className="ti ti-alert-circle text-[14px] flex-shrink-0" />{error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full bg-accent hover:bg-blue-mid text-white rounded-lg py-2.5 text-[13px] font-semibold flex items-center justify-center gap-2 transition-all shadow-[0_2px_8px_rgba(26,86,219,.25)] active:scale-[.98] disabled:opacity-60"
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
