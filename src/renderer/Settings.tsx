import { useEffect, useState, useCallback } from 'react'
import type { NavigateFn } from './App'
import { invoke } from './lib/ipc'
import { supabase } from './lib/supabaseClient'
import { getUsage, type UsageInfo } from './lib/usage'
import { openBillingPortal, openCheckout, usePrices, type Checkout } from './lib/billing'
import { AGENT_NAMES, detectAgents, type AgentId, type AgentInfo } from './components/Agent'
import { LanguageFields } from './components/LanguageFields'

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
  detectCalls: boolean
  replyHints: boolean
  agentProvider: AgentId
  agentAutonomy: 'safe' | 'full'
  meetingLanguage: string
  nativeLanguage: string
  clientLanguage: string
  myCallLanguage: string
  answerHints: boolean
  aboutMe: string
}

const DEFAULTS: SettingsState = {
  launchAtStartup: false,
  hotkeyRecord: 'CmdOrCtrl+Shift+B',
  retentionDays: 90,
  notionToken: '',
  notionParentPageId: '',
  slackWebhookUrl: '',
  detectCalls: true,
  replyHints: true,
  agentProvider: 'claude',
  agentAutonomy: 'safe',
  meetingLanguage: '',
  nativeLanguage: '',
  clientLanguage: 'en',
  myCallLanguage: '',
  answerHints: false,
  aboutMe: ''
}

/** Load + save app settings (shared by Settings, Agent and Integrations pages). */
export function useAppSettings() {
  const [s, setS] = useState<SettingsState>(DEFAULTS)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    invoke<Partial<SettingsState>>('settings:getAll')
      .then((all) => setS({ ...DEFAULTS, ...(all || {}) }))
      .catch((err) => setError((err as Error).message))
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

  return { s, set, saved, error }
}

export default function Settings({ navigate }: { navigate: NavigateFn }) {
  const { s, set, saved, error: settingsError } = useAppSettings()
  const [upgradeError, setError] = useState('')
  const error = settingsError || upgradeError
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const [email, setEmail] = useState('')
  const updater = useUpdater()

  useEffect(() => {
    getUsage().then(setUsage).catch(() => {})
    supabase.auth.getUser().then(({ data: { user } }) => setEmail(user?.email ?? ''))
  }, [])




  return (
    <div className="min-h-screen bg-bg font-body text-text">
      <div className="sticky top-0 z-10 bg-paper/80 backdrop-blur border-b border-border px-8 py-5 flex items-center justify-between">
        <h1 className="font-display font-extrabold text-[24px] text-text">Settings</h1>
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
          <PlanCard usage={usage} onError={setError} />
        </Panel>

        <Panel title="Languages" icon="language" desc="Set once — change any time.">
          <LanguageFields
            value={{ nativeLanguage: s.nativeLanguage, clientLanguage: s.clientLanguage, myCallLanguage: s.myCallLanguage }}
            onChange={(k, v) => set(k, v)}
          />
        </Panel>

        <Panel title="During calls" icon="sparkles" desc="What the capsule shows while you talk.">
          <AboutMe value={s.aboutMe} onSave={(v) => set('aboutMe', v)} />
          <Toggle label="Offer to take notes when a call starts" value={s.detectCalls} onSave={(v) => set('detectCalls', v)} />
          <Toggle label="Show a card when the client asks a question" value={s.replyHints} onSave={(v) => set('replyHints', v)} />
          <Toggle
            label="Cards also suggest what to mention (off — you answer in your own words)"
            value={s.answerHints}
            onSave={(v) => set('answerHints', v)}
          />
        </Panel>

        <Panel title="Recording" icon="microphone" desc="Minutama records your microphone and your computer's audio — no bot joins the call, no drivers needed.">
          <Text label="Start / stop hotkey" value={s.hotkeyRecord} saved={saved === 'hotkeyRecord'} onSave={(v) => set('hotkeyRecord', v)} placeholder="CmdOrCtrl+Shift+B" mono />
          <Toggle label="Launch at startup" value={s.launchAtStartup} onSave={(v) => set('launchAtStartup', v)} />
          <p className="text-[11px] text-text-3">Tip: use headphones for the cleanest "You / Them" separation.</p>
        </Panel>

        <Panel title="Data" icon="database" desc="Notes and transcripts are stored on this computer. Audio is never kept.">
          <NumberField label="Delete calls after (days)" value={s.retentionDays} saved={saved === 'retentionDays'} onSave={(v) => set('retentionDays', v)} />
        </Panel>

        <Panel title="Advanced" icon="adjustments" desc="Optional extras. You don't need them for calls.">
          <div className="grid gap-2">
            {(
              [
                ['agent', 'robot', 'Coding agent', 'Send tasks from calls to Claude Code or Codex'],
                ['integrations', 'plug-connected', 'Integrations', 'Notion, Slack, webhooks'],
                ['period', 'chart-bar', 'Period reports', 'Summary across many calls']
              ] as const
            ).map(([to, icon, title, desc]) => (
              <button
                key={to}
                onClick={() => navigate(to)}
                className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-left hover:bg-bg-2 transition-all"
              >
                <i className={`ti ti-${icon} text-[17px] text-text-3`} />
                <span className="flex-1">
                  <span className="block text-[12.5px] font-medium text-text">{title}</span>
                  <span className="block text-[11px] text-text-3">{desc}</span>
                </span>
                <i className="ti ti-chevron-right text-[14px] text-text-4" />
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}

// ── Update Banner ────────────────────────────────────────────────────────────

// ── AI agents panel ─────────────────────────────────────────────────────────
// ── Plan & hours ────────────────────────────────────────────────────────────
function PlanCard({ usage, onError }: { usage: UsageInfo | null; onError: (m: string) => void }) {
  const go = (kind: Checkout) => openCheckout(kind).catch((e) => onError((e as Error).message))
  const PRICES = usePrices()
  if (!usage) return <div className="text-[12px] text-text-3">Loading usage…</div>

  const name = usage.tier === 'max' ? 'Pro Max' : usage.tier === 'pro' ? 'Pro' : 'Free'
  const limited = usage.hoursLimit !== null
  const pct = limited ? Math.min(1, usage.hoursUsed / Math.max(usage.hoursLimit!, 0.01)) : 0

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-display text-[18px] font-bold text-text">{name}</div>
          <div className="mt-0.5 text-[12px] text-text-3">
            {usage.tier === 'free'
              ? `${usage.meetingsUsed} of ${usage.meetingsLimit} meetings used this month`
              : usage.tier === 'max'
                ? '100 hours a month, everything in Pro'
                : '25 hours a month, all templates, exports, question cards and agent'}
          </div>
        </div>
      </div>

      {limited && (
        <div>
          <div className="mb-1.5 flex justify-between text-[11.5px] text-text-2">
            <span>
              {usage.hoursUsed.toFixed(1)} of {usage.hoursLimit!.toFixed(0)} h used this month
              {usage.bonusHours > 0 ? ` (incl. +${usage.bonusHours.toFixed(0)} h added)` : ''}
            </span>
            <span className={pct >= 0.8 ? 'text-amber' : 'text-text-3'}>{Math.round(pct * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/[.06]">
            <div
              className={`h-full rounded-full ${pct >= 1 ? 'bg-red' : pct >= 0.8 ? 'bg-amber' : 'bg-accent'}`}
              style={{ width: `${pct * 100}%` }}
            />
          </div>
          {pct >= 0.8 && (
            <p className="mt-1.5 text-[11.5px] text-amber">
              {pct >= 1
                ? 'Hours used up — meetings in progress always finish; add hours to start new ones.'
                : 'Running low — add 10 hours any time, they last until the end of the month.'}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {usage.tier === 'free' && (
          <button onClick={() => void go('pro')} className="btn-accent rounded-xl px-4 py-2 text-[13px] font-semibold">
            <i className="ti ti-crown text-[15px]" /> Upgrade to Pro — {PRICES.pro}
          </button>
        )}
        {usage.tier !== 'max' && (
          <button
            onClick={() => void go('max')}
            className={`${usage.tier === 'free' ? 'border border-border bg-white/[.06] text-text' : 'btn-accent'} rounded-xl px-4 py-2 text-[13px] font-semibold`}
          >
            Pro Max — {PRICES.max} · 100 h
          </button>
        )}
        {limited && (
          <button
            onClick={() => void go('topup')}
            className="rounded-xl border border-border bg-white/[.06] px-4 py-2 text-[13px] font-semibold text-text hover:border-accent/50"
          >
            <i className="ti ti-plus text-[14px]" /> Add 10 hours — {PRICES.topup}
          </button>
        )}
        {usage.tier !== 'free' && (
          <button
            onClick={() => void openBillingPortal().catch((e) => onError((e as Error).message))}
            className="rounded-xl border border-border bg-white/[.06] px-4 py-2 text-[13px] font-semibold text-text hover:border-accent/50"
          >
            <i className="ti ti-settings text-[14px]" /> Manage or cancel subscription
          </button>
        )}
      </div>
    </div>
  )
}

export function AgentsSettings({
  provider,
  autonomy,
  onProvider,
  onAutonomy
}: {
  provider: AgentId
  autonomy: 'safe' | 'full'
  onProvider: (v: AgentId) => void
  onAutonomy: (v: 'safe' | 'full') => void
}) {
  const [agents, setAgents] = useState<AgentInfo[] | null>(null)
  const [workdir, setWorkdir] = useState('')
  const [checking, setChecking] = useState(false)

  const refresh = useCallback(() => {
    setChecking(true)
    detectAgents()
      .then((d) => {
        setAgents(d.agents)
        setWorkdir(d.workdir)
      })
      .catch(() => setAgents([]))
      .finally(() => setChecking(false))
  }, [])
  useEffect(refresh, [refresh])

  const INSTALL: Record<AgentId, string> = {
    claude: 'https://claude.com/claude-code',
    codex: 'https://developers.openai.com/codex/cli'
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        {(['claude', 'codex'] as AgentId[]).map((id) => {
          const a = agents?.find((x) => x.id === id)
          const selected = provider === id
          return (
            <div
              key={id}
              className={`rounded-xl border p-3.5 transition-all ${selected ? 'border-accent bg-accent-soft/60' : 'border-border bg-white/[.06]'}`}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[13px] flex-1">{AGENT_NAMES[id]}</span>
                {a?.installed ? (
                  <span className="text-[10.5px] font-semibold text-green flex items-center gap-1">
                    <i className="ti ti-circle-check-filled" /> Connected
                  </span>
                ) : (
                  <span className="text-[10.5px] text-text-3">{agents === null ? 'Checking…' : 'Not found'}</span>
                )}
              </div>
              <div className="text-[11px] text-text-3 mt-1 truncate">{a?.version ?? (a?.installed ? 'Ready' : 'Install it, sign in once in a terminal')}</div>
              <div className="mt-2.5">
                {a?.installed ? (
                  <button
                    onClick={() => onProvider(id)}
                    disabled={selected}
                    className={`rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold ${selected ? 'bg-white/[.06] text-accent-ink' : 'btn-accent'}`}
                  >
                    {selected ? 'Default agent' : 'Use this agent'}
                  </button>
                ) : (
                  <button
                    onClick={() => window.open(INSTALL[id], '_blank')}
                    className="rounded-lg border border-border bg-white/[.06] px-2.5 py-1.5 text-[11.5px] font-medium text-text-2 hover:text-text"
                  >
                    Install {AGENT_NAMES[id]} <i className="ti ti-external-link text-[12px]" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 text-[11.5px] text-text-3">
        <button onClick={refresh} className="underline hover:text-text-2" disabled={checking}>
          {checking ? 'Checking…' : 'Check again'}
        </button>
        <span>·</span>
        <span className="truncate">Works in: {workdir || '…'}</span>
        <button
          onClick={() => invoke<string | null>('agent:chooseWorkdir').then((d) => d && setWorkdir(d)).catch(() => {})}
          className="underline hover:text-text-2 flex-shrink-0"
        >
          Change
        </button>
      </div>

      <div className="rounded-xl border border-border bg-white/[.06] p-3">
        <div className="text-[12px] font-medium text-text mb-2">What the agent may do</div>
        {([
          ['safe', 'Ask first (recommended)', 'Reads and drafts. Anything else follows the permissions you set in Claude Code / Codex.'],
          ['full', 'Edit files', 'May create and change files in the folder above. It never bypasses your agent\'s own safety checks.']
        ] as const).map(([v, title, desc]) => (
          <label key={v} className="flex items-start gap-2.5 py-1.5 cursor-pointer">
            <input type="radio" checked={autonomy === v} onChange={() => onAutonomy(v)} className="mt-0.5 accent-[#FF6A3D]" />
            <span>
              <span className="block text-[12.5px] font-medium text-text">{title}</span>
              <span className="block text-[11px] text-text-3">{desc}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

function UpdateBanner({ updater }: { updater: ReturnType<typeof useUpdater> }) {
  const { state, version, percent, check, install } = updater

  if (state === 'idle') {
    return (
      <div className="flex items-center justify-between glass rounded-xl px-4 py-3">
        <div className="flex items-center gap-2 text-[12px] text-text-3">
          <i className="ti ti-refresh text-[15px] text-accent" />
          Check for app updates
        </div>
        <button
          onClick={check}
          className="text-[12px] font-medium text-accent hover:text-accent-ink bg-accent-soft hover:bg-accent-soft/80 px-3 py-1.5 rounded-lg transition-all"
        >
          Check now
        </button>
      </div>
    )
  }

  if (state === 'checking') {
    return (
      <div className="flex items-center gap-2 glass rounded-xl px-4 py-3 text-[12px] text-text-3">
        <i className="ti ti-loader-2 animate-spin-slow text-[15px] text-accent" />
        Checking for updates…
      </div>
    )
  }

  if (state === 'none') {
    return (
      <div className="flex items-center justify-between glass rounded-xl px-4 py-3">
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
      <div className="bg-accent-soft border border-accent/20 rounded-lg px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-text">
            <i className="ti ti-download text-[15px] text-accent" />
            Update available{version ? ` — v${version}` : ''}
          </div>
          {state === 'downloading' && (
            <span className="text-[11px] text-accent font-medium">{percent}%</span>
          )}
        </div>
        {state === 'downloading' && (
          <div className="w-full h-1.5 bg-accent-soft border border-accent/20 rounded-full overflow-hidden">
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
          <p className="text-[11px] text-text-3">Updates in a few seconds and opens again.</p>
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

export function Panel({
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
    <div className="glass rounded-panel overflow-hidden">
      <div className="px-[18px] py-3.5 border-b border-border-soft bg-bg flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-accent-soft flex items-center justify-center">
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

export function Text({
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

export function Password(props: {
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

export function NumberField({
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

export function Toggle({
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

function AboutMe({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-text">About you (used on every call)</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && onSave(text.slice(0, 2000))}
        rows={3}
        placeholder="e.g. Full-stack developer: Next.js, Node, AWS (Lambda, API Gateway), Stripe. Rate $45/h."
        className="w-full resize-y rounded-xl border border-border bg-white/[.06] px-3 py-2.5 text-[12.5px] leading-snug text-text placeholder:text-text-4 focus:border-accent focus:outline-none"
      />
      <p className="mt-1 text-[11px] text-text-3">Helps Minutama get your terms right and write a realistic estimate.</p>
    </div>
  )
}
