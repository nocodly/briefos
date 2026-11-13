import { useEffect, useState, useCallback, useRef } from 'react'
import Dashboard from './Dashboard'
import MeetingView from './MeetingView'
import PeriodReport from './PeriodReport'
import Settings from './Settings'
import Onboarding from './Onboarding'
import Processing from './Processing'
import AuthScreen from './AuthScreen'
import LiveMeeting from './LiveMeeting'
import { handleRecordingCommand, startMeetingSession, useMeetingSession } from './recording/meetingSession'
import { invoke, subscribe } from './lib/ipc'
import { supabase, getProfile } from './lib/supabaseClient'

export type Page = 'dashboard' | 'live' | 'meeting' | 'period' | 'settings' | 'onboarding'

export interface NavigateFn {
  (page: Page, meetingId?: string | null): void
}

// Top-level routing stages (before reaching the main app).
type Stage = 'loading' | 'auth' | 'onboarding' | 'app'

export default function App() {
  const [stage, setStage] = useState<Stage>('loading')
  const [page, setPage] = useState<Page>('dashboard')
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStep, setProcessingStep] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const navigate = useCallback<NavigateFn>((p, id = null) => {
    setPage(p)
    if (id !== undefined && id !== null) setActiveMeetingId(id)
  }, [])

  // ── Auth bootstrap ──────────────────────────────────────────────────────────
  // On every launch: check if there's a Supabase session, then decide where to route.
  useEffect(() => {
    const boot = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
          setStage('auth')
          return
        }

        // Fetch profile to sync plan with electron-store.
        const profile = await getProfile(session.user.id)
        if (profile) {
          await invoke('settings:set', { key: 'plan', value: profile.plan })
        }

        // Check if user still needs onboarding (API keys not set).
        const onboardingComplete = await invoke<boolean>('settings:get', 'onboardingComplete')
        setStage(onboardingComplete ? 'app' : 'onboarding')
      } catch (err) {
        console.error('[app] boot error', err)
        setStage('auth')
      }
    }

    boot()

    // Keep session fresh; if user signs out from another tab → back to auth.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setStage('auth')
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Real-time profile sync ──────────────────────────────────────────────────
  // When you change a user's plan in Supabase → the client updates immediately.
  useEffect(() => {
    if (stage !== 'app') return
    let channel: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      channel = supabase
        .channel(`profile:${user.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
          async (payload) => {
            const newPlan = (payload.new as { plan: string }).plan
            console.log('[realtime] plan updated to', newPlan)
            await invoke('settings:set', { key: 'plan', value: newPlan })
          }
        )
        .subscribe()
    })

    return () => {
      channel?.unsubscribe()
    }
  }, [stage])

  // ── Progress / hotkey events ────────────────────────────────────────────────
  useEffect(() => {
    const unsubs = [
      subscribe('progress:transcription', ({ step }) => {
        setIsProcessing(true)
        setProcessingStep(step)
      }),
      subscribe('progress:summary', ({ step }) => {
        setIsProcessing(true)
        setProcessingStep(step)
      }),
      subscribe('progress:done', ({ meetingId }) => {
        setIsProcessing(false)
        if (meetingId) {
          setActiveMeetingId(meetingId)
          setPage('meeting')
        }
      }),
      subscribe('navigate', (route: string) => {
        if (route === '/settings') setPage('settings')
      }),
      subscribe('progress:error', ({ message }) => {
        setIsProcessing(false)
        setErrorMsg(message || 'Something went wrong during processing.')
        setTimeout(() => setErrorMsg(''), 6000)
      })
    ]
    return () => unsubs.forEach((u) => u())
  }, [])

  // Tray / overlay / hotkey commands are relayed by main; the session lives here.
  useEffect(() => {
    const unsub = subscribe('recording:command', (cmd) => {
      const idle = useMeetingSession.getState().status === 'idle'
      if (cmd === 'start' || (cmd === 'toggle' && idle)) setPage('live')
      handleRecordingCommand(cmd)
    })
    return unsub
  }, [])


  // ── Auth callbacks ──────────────────────────────────────────────────────────
  const handleAuthSuccess = useCallback(async (isNew: boolean) => {
    if (isNew) {
      setStage('onboarding')
    } else {
      const onboardingComplete = await invoke<boolean>('settings:get', 'onboardingComplete')
      setStage(onboardingComplete ? 'app' : 'onboarding')
    }
  }, [])

  const handleOnboardingDone = useCallback(() => setStage('app'), [])

  // ── Render ──────────────────────────────────────────────────────────────────
  if (stage === 'loading') {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center font-body">
        <div className="flex flex-col items-center gap-3 text-text-3">
          <div className="w-10 h-10 bg-blue-tint rounded-xl flex items-center justify-center">
            <i className="ti ti-broadcast text-[22px] text-accent" />
          </div>
          <i className="ti ti-loader-2 text-[22px] animate-spin-slow" />
        </div>
      </div>
    )
  }

  if (stage === 'auth') return <AuthScreen onAuthSuccess={handleAuthSuccess} />
  if (stage === 'onboarding') return <Onboarding onDone={handleOnboardingDone} />

  return (
    <div className="flex min-h-screen bg-bg font-body text-text">
      <Sidebar page={page} navigate={navigate} />
      <main className="flex-1 overflow-auto">
        <RecordingBanner page={page} onOpen={() => setPage('live')} />
        {page === 'dashboard' && <Dashboard navigate={navigate} />}
        {page === 'live' && <LiveMeeting navigate={(p, id) => navigate(p, id)} />}
        {page === 'meeting' && <MeetingView id={activeMeetingId} navigate={navigate} />}
        {page === 'period' && <PeriodReport />}
        {page === 'settings' && <Settings navigate={navigate} />}
      </main>
      {isProcessing && <Processing step={processingStep} />}
      {errorMsg && (
        <div className="fixed bottom-6 right-6 max-w-[360px] px-4 py-3 rounded-card shadow-lg text-[13px] z-[60] bg-red-soft border border-red/20 text-red animate-fade-up">
          <div className="flex items-start gap-2">
            <i className="ti ti-alert-circle text-[16px] mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        </div>
      )}
      <UpdateToast />
    </div>
  )
}

function Sidebar({
  page,
  navigate,
}: {
  page: Page
  navigate: NavigateFn
}) {
  const handleSignOut = async () => {
    await supabase.auth.signOut()
    await invoke('settings:set', { key: 'plan', value: 'trial' as never }).catch(() => {})
    await invoke('settings:set', { key: 'onboardingComplete', value: false as never }).catch(() => {})
  }

  return (
    <aside className="w-[200px] bg-blue-deep flex flex-col h-screen sticky top-0">
      <div className="flex items-center gap-2 px-4 py-5 border-b border-white/10">
        <div className="w-[26px] h-[26px] bg-accent rounded-md flex items-center justify-center flex-shrink-0">
          <i className="ti ti-broadcast text-[16px] text-white" />
        </div>
        <span className="font-display font-bold text-[14px] text-white">
          Minutama
        </span>
      </div>

      <nav className="p-2 flex-1">
        <NavItem
          icon="microphone"
          label="New meeting"
          active={page === 'live'}
          onClick={() => {
            navigate('live')
            if (useMeetingSession.getState().status === 'idle') void startMeetingSession()
          }}
        />
        <NavItem
          icon="layout-dashboard"
          label="Dashboard"
          active={page === 'dashboard' || page === 'meeting'}
          onClick={() => navigate('dashboard')}
        />
        <NavItem
          icon="chart-bar"
          label="Period Reports"
          active={page === 'period'}
          onClick={() => navigate('period')}
        />
      </nav>

      <div className="p-2 border-t border-white/10 space-y-0.5">
        <NavItem
          icon="settings"
          label="Settings"
          active={page === 'settings'}
          onClick={() => navigate('settings')}
        />
        <NavItem
          icon="logout"
          label="Sign out"
          onClick={handleSignOut}
        />
      </div>
    </aside>
  )
}

// ── Global update toast (shown on every page) ──────────────────────────────
function UpdateToast() {
  const [state, setState] = useState<'hidden' | 'downloading' | 'ready'>('hidden')
  const [version, setVersion] = useState('')
  const [percent, setPercent] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const installRef = useRef(invoke)

  useEffect(() => {
    const unsub = subscribe('updater:status', (data: { state: string; version?: string; percent?: number }) => {
      if (data.state === 'downloading') {
        setState('downloading')
        setPercent(data.percent ?? 0)
        setDismissed(false)
      } else if (data.state === 'downloaded') {
        setState('ready')
        setVersion(data.version ?? '')
        setDismissed(false)
      } else if (data.state === 'none' || data.state === 'error') {
        setState('hidden')
      }
    })
    return unsub
  }, [])

  if (dismissed || state === 'hidden') return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] animate-fade-up">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-card shadow-xl border text-[13px] min-w-[320px] max-w-[420px]
        ${state === 'ready'
          ? 'bg-white border-accent/30 shadow-accent/10'
          : 'bg-white border-border'}`}>

        {state === 'downloading' ? (
          <>
            <i className="ti ti-loader-2 text-[18px] text-accent animate-spin-slow flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-text">Downloading update…</span>
                <span className="text-text-3">{percent}%</span>
              </div>
              <div className="h-1.5 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${percent}%` }} />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="w-8 h-8 rounded-lg bg-blue-tint flex items-center justify-center flex-shrink-0">
              <i className="ti ti-refresh text-[17px] text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-text">New version ready{version ? ` — v${version}` : ''}</div>
              <div className="text-[11px] text-text-3 mt-0.5">Restart Minutama to apply the update</div>
            </div>
            <button
              onClick={() => installRef.current('updater:install')}
              className="flex-shrink-0 px-3 py-1.5 bg-accent text-white text-[12px] font-semibold rounded-lg hover:bg-accent/90 transition-all"
            >
              Restart
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="flex-shrink-0 text-text-3 hover:text-text transition-colors"
            >
              <i className="ti ti-x text-[14px]" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function NavItem({
  icon,
  label,
  active,
  alert,
  onClick
}: {
  icon: string
  label: string
  active?: boolean
  alert?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] mb-0.5 transition-all ${
        active ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/80'
      }`}
    >
      <i className={`ti ti-${icon} text-[16px] w-[18px] text-center`} />
      {label}
      {alert && !active && (
        <span className="ml-auto w-2 h-2 rounded-full bg-amber animate-pulse-dot" title="Action needed" />
      )}
    </button>
  )
}

// Thin bar shown on other pages while a meeting is being recorded.
function RecordingBanner({ page, onOpen }: { page: Page; onOpen: () => void }) {
  const status = useMeetingSession((st) => st.status)
  if (page === 'live' || (status !== 'recording' && status !== 'paused')) return null
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center justify-center gap-2 py-1.5 bg-red text-white text-[12px] font-semibold"
    >
      <span className="w-2 h-2 rounded-full bg-white animate-pulse-dot" />
      {status === 'paused' ? 'Meeting paused' : 'Recording meeting'} — open notes
    </button>
  )
}
