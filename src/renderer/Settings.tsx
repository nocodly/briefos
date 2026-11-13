import { useEffect, useState, useCallback } from 'react'
import type { NavigateFn } from './App'
import { invoke } from './lib/ipc'
import { supabase, STRIPE_PRO_LINK } from './lib/supabaseClient'
import { getUsage, type UsageInfo } from './lib/usage'

// ── Updater hook ─────────────────────────────────────────────────────────────
type UpdaterState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'none' | 'error'
function useUpdater() {
  const [state, setState] = useState<UpdaterState>('idle')
  const [version, setVersion] = useState('')
  const [percent, setPercent] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    const sub = window.electron.on('updater:status', (data: any) => {
      setState(data.state)
      if (data.version) setVersion(data.version)
      if (data.percent !== undefined) setPercent(data.percent)
      if (data.error) setError(data.error)
    })
    return () => window.electron.off('updater:status', sub)
  }, [])

  const check = async () => {
    setState('checking')
    await invoke('updater:check')
  }

  const install = async () => {
    await invoke('updater:install')
  }

  return { state, version, percent, error, check, install }
}

// =============================================================================
// Settings — Minutama. No API keys, no audio devices: AI runs on our server and
// audio is captured automatically (microphone + system audio, no drivers).
// Panels: Plan & usage · Recording · Integrations (Pro) · Data · Updates.
// =============================================================================

interface SettingsState {
  launchAtStartup: boolean
  hotkeyRecord: string
  retentionDays: number
  notionToken: string
  notionParentPageId: string
  slackWebhookUrl: string
}

const DEFAULTS: SettingsState = {
  launchAtStartup: false,
  hotkeyRecord: 'CmdOrCtrl+Shift+B',
  retentionDays: 90,
  notionToken: '',
  notionParentPageId: '',
  slackWebhookUrl: ''
}

export default function Settings({ navigate }: { navigate: NavigateFn }) {
  const [s, setS] = useState<SettingsState>(DEFAULTS)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const [email, setEmail] = useState('')
  const updater = useUpdater()

  useEffect(() => {
    invoke<Partial<SettingsState>>('settings:getAll')
      .then((all) => setS({ ...DEFAULTS, ...(all || {}) }))
      .catch((err) => setError((err as Error).message))
    getUsage().then(setUsage).catch(() => {})
    supabase.auth.getUser().then(({ data: { user } }) => setEmail(user?.email ?? ''))
  }, [])

  const set = useCallback(async <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setS((prev) => ({ ...prev, [key]: value }))
    try {
      await invoke('settings:set', { key, value })
      setSaved(key)
      setTimeout(() => setSaved((cur) => (cur === key ? null : cur)), 1500)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  const upgrade = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!STRIPE_PRO_LINK || !user) {
      setError('Upgrade is not available right now. Please try again later.')
      return
    }
    const url = new URL(STRIPE_PRO_LINK)
    url.searchParams.set('client_reference_id', user.id)
    if (user.email) url.searchParams.set('prefilled_email', user.email)
    window.open(url.toString(), '_blank')
  }

  const isPro = usage?.tier === 'pro'

  return (
    <div className="min-h-screen bg-bg font-body text-text">
      <div className="sticky top-0 z-10 bg-bg/90 backdrop-blur border-b border-border px-8 py-5 flex items-center justify-between">
        <h1 className="font-display font-extrabold text-[24px] text-blue-deep">Settings</h1>
        <button
          onClick={() => navigate('dashboard')}
          className="text-text-3 hover:text-text-2 hover:bg-bg-2 rounded-lg px-3 py-2 text-[12px] flex items-center gap-1.5 transition-all"
        >
          <i className="ti ti-arrow-left text-[14px]" /> Back
        </button>
      </div>

      <div className="max-w-[680px] mx-auto p-8 space-y-5">
        {error && (
          <div className="text-[12px] text-red bg-red-soft border border-red/20 rounded-lg px-3 py-2">{error}</div>
        )}

        <UpdateBanner updater={updater} />

        <Panel title="Plan" icon="crown" desc={email ? `Signed in as ${email}` : 'Your Minutama plan.'}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-display font-bold text-[16px] text-blue-deep">
                {isPro ? 'Pro' : 'Free'}
              </div>
              <div className="text-[12px] text-text-3 mt-0.5">
                {usage === null
                  ? 'Loading usage…'
                  : isPro
                    ? 'Unlimited meetings, all templates, exports and history.'
                    : `${usage.meetingsUsed} of ${usage.meetingsLimit} meetings used this month · notes kept 30 days`}
              </div>
            </div>
            {!isPro && (
              <button
                onClick={upgrade}
                className="bg-accent hover:bg-blue-mid text-white rounded-lg px-4 py-2 text-[13px] font-semibold flex items-center gap-1.5 transition-all"
              >
                <i className="ti ti-crown text-[15px]" /> Upgrade — $12/mo
              </button>
            )}
          </div>
        </Panel>

        <Panel title="Recording" icon="microphone" desc="Minutama records your microphone and your computer's audio — no bot joins the call, no drivers needed.">
          <Text label="Start / stop hotkey" value={s.hotkeyRecord} saved={saved === 'hotkeyRecord'} onSave={(v) => set('hotkeyRecord', v)} placeholder="CmdOrCtrl+Shift+B" mono />
          <Toggle label="Launch at startup" value={s.launchAtStartup} onSave={(v) => set('launchAtStartup', v)} />
          <p className="text-[11px] text-text-3">Tip: use headphones for the cleanest "You / Them" separation.</p>
        </Panel>

        <Panel title="Integrations" icon="plug" desc={isPro ? 'Send notes to your tools.' : 'Available on Pro.'}>
          <Password label="Notion integration token" value={s.notionToken} saved={saved === 'notionToken'} onSave={(v) => set('notionToken', v)} placeholder="secret_…" />
          <Text label="Notion parent page ID" value={s.notionParentPageId} saved={saved === 'notionParentPageId'} onSave={(v) => set('notionParentPageId', v)} placeholder="32-char page id" mono />
          <Text label="Slack webhook URL" value={s.slackWebhookUrl} saved={saved === 'slackWebhookUrl'} onSave={(v) => set('slackWebhookUrl', v)} placeholder="https://hooks.slack.com/…" mono />
        </Panel>

        <Panel title="Data" icon="database" desc="Notes and transcripts are stored on this computer. Audio is never kept.">
          <NumberField label="Delete meetings after (days)" value={s.retentionDays} saved={saved === 'retentionDays'} onSave={(v) => set('retentionDays', v)} />
        </Panel>
      </div>
    </div>
  )
}

// ── Update Banner ────────────────────────────────────────────────────────────

function UpdateBanner({ updater }: { updater: ReturnType<typeof useUpdater> }) {
  const { state, version, percent, check, install } = updater

  if (state === 'idle') {
    return (
      <div className="flex items-center justify-between bg-surface border border-border-soft rounded-lg px-4 py-3">
        <div className="flex items-center gap-2 text-[12px] text-text-3">
          <i className="ti ti-refresh text-[15px] text-accent" />
          Check for app updates
        </div>
        <button
          onClick={check}
          className="text-[12px] font-medium text-accent hover:text-blue-mid bg-blue-tint hover:bg-blue-tint/80 px-3 py-1.5 rounded-lg transition-all"
        >
          Check now
        </button>
      </div>
    )
  }

  if (state === 'checking') {
    return (
      <div className="flex items-center gap-2 bg-surface border border-border-soft rounded-lg px-4 py-3 text-[12px] text-text-3">
        <i className="ti ti-loader-2 animate-spin-slow text-[15px] text-accent" />
        Checking for updates…
      </div>
    )
  }

  if (state === 'none') {
    return (
      <div className="flex items-center justify-between bg-surface border border-border-soft rounded-lg px-4 py-3">
        <div className="flex items-center gap-2 text-[12px] text-green">
          <i className="ti ti-circle-check text-[15px]" />
          You're on the latest version
        </div>
        <button onClick={check} className="text-[11px] text-text-4 hover:text-text-2 transition-all">Check again</button>
      </div>
    )
  }

  if (state === 'available' || state === 'downloading') {
    return (
      <div className="bg-blue-tint border border-accent/20 rounded-lg px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-blue-deep">
            <i className="ti ti-download text-[15px] text-accent" />
            Update available{version ? ` — v${version}` : ''}
          </div>
          {state === 'downloading' && (
            <span className="text-[11px] text-accent font-medium">{percent}%</span>
          )}
        </div>
        {state === 'downloading' && (
          <div className="w-full h-1.5 bg-blue-tint border border-accent/20 rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${percent}%` }} />
          </div>
        )}
        <p className="text-[11px] text-text-3">
          {state === 'downloading' ? 'Downloading… the app will restart automatically when done.' : 'Downloading update in the background…'}
        </p>
      </div>
    )
  }

  if (state === 'downloaded') {
    return (
      <div className="bg-green-soft border border-green/20 rounded-lg px-4 py-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[12px] font-semibold text-green mb-0.5">
            <i className="ti ti-circle-check text-[15px]" />
            Update ready{version ? ` — v${version}` : ''}
          </div>
          <p className="text-[11px] text-text-3">Restart the app to apply the update.</p>
        </div>
        <button
          onClick={install}
          className="bg-green hover:opacity-90 text-white rounded-lg px-4 py-2 text-[12px] font-semibold flex items-center gap-1.5 transition-all active:scale-[.97] shadow-sm"
        >
          <i className="ti ti-refresh text-[14px]" /> Restart & update
        </button>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="flex items-center justify-between bg-red-soft border border-red/20 rounded-lg px-4 py-3">
        <div className="flex items-center gap-2 text-[12px] text-red">
          <i className="ti ti-alert-circle text-[14px]" />
          Update check failed
        </div>
        <button onClick={check} className="text-[11px] text-red hover:text-red/80 transition-all">Retry</button>
      </div>
    )
  }

  return null
}

function Panel({
  title,
  icon,
  desc,
  children
}: {
  title: string
  icon: string
  desc?: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-surface border border-border-soft rounded-panel shadow-sm overflow-hidden">
      <div className="px-[18px] py-3.5 border-b border-border-soft bg-bg flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-blue-tint flex items-center justify-center">
          <i className={`ti ti-${icon} text-[15px] text-accent`} />
        </div>
        <div>
          <div className="text-[13px] font-semibold text-text">{title}</div>
          {desc && <div className="text-[11px] text-text-3">{desc}</div>}
        </div>
      </div>
      <div className="p-[18px] space-y-3.5">{children}</div>
    </div>
  )
}

function Label({ children, saved }: { children: React.ReactNode; saved?: boolean }) {
  return (
    <label className="flex items-center gap-1.5 text-[12px] font-medium text-text mb-1">
      {children}
      {saved && (
        <span className="text-[10px] text-green flex items-center gap-0.5">
          <i className="ti ti-check text-[12px]" /> saved
        </span>
      )}
    </label>
  )
}

const inputCls =
  'w-full text-[12px] bg-bg border border-border rounded-lg px-3 py-2.5 text-text placeholder:text-text-4 focus:border-accent focus:outline-none transition-all'

function Text({
  label,
  value,
  onSave,
  saved,
  placeholder,
  mono
}: {
  label: string
  value: string
  onSave: (v: string) => void
  saved?: boolean
  placeholder?: string
  mono?: boolean
}) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return (
    <div>
      <Label saved={saved}>{label}</Label>
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => local !== value && onSave(local)}
        onKeyDown={(e) => e.key === 'Enter' && local !== value && onSave(local)}
        placeholder={placeholder}
        className={`${inputCls} ${mono ? 'font-mono' : ''}`}
      />
    </div>
  )
}

function Password(props: {
  label: string
  value: string
  onSave: (v: string) => void
  saved?: boolean
  placeholder?: string
}) {
  const [local, setLocal] = useState(props.value)
  const [show, setShow] = useState(false)
  useEffect(() => setLocal(props.value), [props.value])
  return (
    <div>
      <Label saved={props.saved}>{props.label}</Label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => local !== props.value && props.onSave(local)}
          onKeyDown={(e) => e.key === 'Enter' && local !== props.value && props.onSave(local)}
          placeholder={props.placeholder}
          className={`${inputCls} font-mono pr-9`}
        />
        <button
          onClick={() => setShow((v) => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-2"
          title={show ? 'Hide' : 'Show'}
        >
          <i className={`ti ti-${show ? 'eye-off' : 'eye'} text-[15px]`} />
        </button>
      </div>
    </div>
  )
}

function NumberField({
  label,
  value,
  onSave,
  saved
}: {
  label: string
  value: number
  onSave: (v: number) => void
  saved?: boolean
}) {
  const [local, setLocal] = useState(String(value))
  useEffect(() => setLocal(String(value)), [value])

  const commit = () => {
    const n = parseInt(local, 10)
    if (!Number.isNaN(n) && n !== value) onSave(n)
  }

  return (
    <div>
      <Label saved={saved}>{label}</Label>
      <input
        type="number"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className={inputCls}
      />
    </div>
  )
}

function Toggle({
  label,
  value,
  onSave
}: {
  label: string
  value: boolean
  onSave: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] font-medium text-text">{label}</span>
      <button
        onClick={() => onSave(!value)}
        className={`w-10 h-6 rounded-full transition-all relative ${value ? 'bg-accent' : 'bg-border'}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
            value ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  )
}
