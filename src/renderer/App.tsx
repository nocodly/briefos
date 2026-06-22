import { useEffect, useState, useCallback } from 'react'
import Dashboard from './Dashboard'
import MeetingView from './MeetingView'
import PeriodReport from './PeriodReport'
import Settings from './Settings'
import Onboarding from './Onboarding'
import Processing from './Processing'
import AuthScreen from './AuthScreen'
import PlanPicker from './PlanPicker'
import Transcribe from './Transcribe'
import { invoke, subscribe } from './lib/ipc'
import { supabase, getProfile } from './lib/supabaseClient'

export type Page = 'dashboard' | 'meeting' | 'period' | 'settings' | 'onboarding' | 'transcribe'

export interface NavigateFn {
  (page: Page, meetingId?: string | null): void
}

// Top-level routing stages (before reaching the main app).
type Stage = 'loading' | 'auth' | 'plan' | 'onboarding' | 'app'

export default function App() {
  const [stage, setStage] = useState<Stage>('loading')
  const [page, setPage] = useState<Page>('dashboard')
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStep, setProcessingStep] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [vbCableNeeded, setVbCableNeeded] = useState(false)

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

  useEffect(() => {
    const unsub = subscribe('hotkey:toggleRecording', async () => {
      try {
        const status = await invoke<{ recording: boolean }>('recording:status')
        if (status?.recording) {
          await invoke('recording:stop')
        } else {
          await invoke('recording:start', {})
        }
      } catch (err) {
        console.error('[app] toggle recording failed', err)
        setErrorMsg((err as Error).message)
        setTimeout(() => setErrorMsg(''), 6000)
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      invoke<string[]>('audio:listDevices').catch(() => [] as string[]),
      invoke<boolean>('settings:get', 'micOnly').catch(() => false)
    ]).then(([devices, micOnly]) => {
      if (cancelled) return
      const detected = Array.isArray(devices) && devices.some((d) => /cable/i.test(d))
      setVbCableNeeded(!detected && !micOnly)
    })
    return () => { cancelled = true }
  }, [page])

  // ── Auth callbacks ──────────────────────────────────────────────────────────
  const handleAuthSuccess = useCallback(async (isNew: boolean) => {
    if (isNew) {
      setStage('plan')
    } else {
      const onboardingComplete = await invoke<boolean>('settings:get', 'onboardingComplete')
      setStage(onboardingComplete ? 'app' : 'onboarding')
    }
  }, [])

  const handlePlanDone = useCallback(() => setStage('onboarding'), [])
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
  if (stage === 'plan') return <PlanPicker onDone={handlePlanDone} />
  if (stage === 'onboarding') return <Onboarding onDone={handleOnboardingDone} />

  return (
    <div className="flex min-h-screen bg-bg font-body text-text">
      <Sidebar page={page} navigate={navigate} settingsAlert={vbCableNeeded} />
      <main className="flex-1 overflow-auto">
        {page === 'dashboard' && <Dashboard navigate={navigate} />}
        {page === 'meeting' && <MeetingView id={activeMeetingId} navigate={navigate} />}
        {page === 'period' && <PeriodReport />}
        {page === 'transcribe' && <Transcribe />}
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
    </div>
  )
}

function Sidebar({
  page,
  navigate,
  settingsAlert
}: {
  page: Page
  navigate: NavigateFn
  settingsAlert?: boolean
}) {
  const [refCopied, setRefCopied] = useState(false)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    // Clear key/token fields with empty strings; reset plan to valid default 'trial'.
    for (const key of ['openaiApiKey', 'anthropicApiKey', 'huggingfaceToken', 'licenseKey'] as const) {
      await invoke('settings:set', { key, value: '' as never }).catch(() => {})
    }
    await invoke('settings:set', { key: 'plan', value: 'trial' as never }).catch(() => {})
    await invoke('settings:set', { key: 'onboardingComplete', value: false as never }).catch(() => {})
  }

  const handleCopyRef = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const link = `https://nocodly.com/briefos?ref=${user.id}`
    await navigator.clipboard.writeText(link)
    setRefCopied(true)
    setTimeout(() => setRefCopied(false), 2000)
  }

  return (
    <aside className="w-[200px] bg-blue-deep flex flex-col h-screen sticky top-0">
      <div className="flex items-center gap-2 px-4 py-5 border-b border-white/10">
        <div className="w-[26px] h-[26px] bg-accent rounded-md flex items-center justify-center flex-shrink-0">
          <i className="ti ti-broadcast text-[16px] text-white" />
        </div>
        <span className="font-display font-bold text-[14px] text-white">
          Brief<span className="text-[#7CB9FF]">OS</span>
        </span>
      </div>

      <nav className="p-2 flex-1">
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
        <NavItem
          icon="file-text"
          label="Transcribe"
          active={page === 'transcribe'}
          onClick={() => navigate('transcribe')}
        />
      </nav>

      {/* Referral */}
      <div className="mx-2 mb-2 bg-white/5 rounded-lg p-3 border border-white/10">
        <div className="flex items-center gap-1.5 mb-1">
          <i className="ti ti-gift text-[13px] text-[#7CB9FF]" />
          <span className="text-[11px] font-semibold text-white/80">Invite a friend</span>
        </div>
        <p className="text-[10px] text-white/40 mb-2 leading-relaxed">Get 3 months Pro free for each friend who signs up.</p>
        <button
          onClick={handleCopyRef}
          className="w-full text-[10px] font-semibold bg-accent/80 hover:bg-accent text-white rounded-md py-1.5 transition-all flex items-center justify-center gap-1.5"
        >
          {refCopied ? (
            <><i className="ti ti-check text-[12px]" /> Copied!</>
          ) : (
            <><i className="ti ti-copy text-[12px]" /> Copy invite link</>
          )}
        </button>
      </div>

      <div className="p-2 border-t border-white/10 space-y-0.5">
        <NavItem
          icon="settings"
          label="Settings"
          active={page === 'settings'}
          alert={settingsAlert}
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
