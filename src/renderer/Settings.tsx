import { useEffect, useState, useCallback } from 'react'
import type { NavigateFn } from './App'
import { invoke } from './lib/ipc'
import { supabase, updateProfile, type PlanType, STRIPE_PRO_LINK } from './lib/supabaseClient'

// =============================================================================
// Settings — all configuration panels. Reads via settings:getAll, writes each
// change via settings:set. Audio devices come from audio:listDevices.
// =============================================================================

interface SettingsState {
  openaiApiKey: string
  anthropicApiKey: string
  huggingfaceToken: string
  aiProvider: 'openai' | 'anthropic'
  aiModel: string
  microphoneDevice: string
  systemAudioDevice: string
  micOnly: boolean
  launchAtStartup: boolean
  hotkeyRecord: string
  retentionDays: number
  plan: string
  licenseKey: string
  notionToken: string
  notionParentPageId: string
  slackWebhookUrl: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  emailFrom: string
}

const DEFAULTS: SettingsState = {
  openaiApiKey: '',
  anthropicApiKey: '',
  huggingfaceToken: '',
  aiProvider: 'openai',
  aiModel: '',
  microphoneDevice: 'default',
  systemAudioDevice: 'virtual-audio-capturer',
  micOnly: false,
  launchAtStartup: false,
  hotkeyRecord: 'CmdOrCtrl+Shift+B',
  retentionDays: 90,
  plan: 'trial',
  licenseKey: '',
  notionToken: '',
  notionParentPageId: '',
  slackWebhookUrl: '',
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  emailFrom: ''
}

interface LevelResult {
  device: string
  maxDb: number
  meanDb: number
  silent: boolean
}
interface AudioTestReport {
  system: LevelResult | null
  mic: LevelResult | null
}

export default function Settings({ navigate }: { navigate: NavigateFn }) {
  const [s, setS] = useState<SettingsState>(DEFAULTS)
  const [devices, setDevices] = useState<string[]>([])
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)
  const [levels, setLevels] = useState<AudioTestReport | null>(null)

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

  const loadDevices = useCallback(async () => {
    setLoadingDevices(true)
    try {
      // Request mic permission first — Windows won't expose devices to DirectShow
      // until the user grants access via the OS privacy dialog.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach(t => t.stop())
      } catch {
        // Permission denied — proceed anyway, list will be empty
      }
      const list = await invoke<string[]>('audio:listDevices')
      setDevices(list || [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoadingDevices(false)
    }
  }, [])

  const runTest = useCallback(async () => {
    setTesting(true)
    setLevels(null)
    try {
      setLevels(await invoke<AudioTestReport>('audio:testLevels'))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setTesting(false)
    }
  }, [])

  useEffect(() => {
    loadDevices()
  }, [loadDevices])

  // A loopback device is present if any detected device name contains "CABLE".
  const vbDetected = devices.some((d) => /cable/i.test(d))

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
          <div className="text-[12px] text-red bg-red-soft border border-red/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* API Keys */}
        <Panel title="API Keys" icon="key" desc="Stored encrypted on your device.">
          <Password label="OpenAI API key" value={s.openaiApiKey} saved={saved === 'openaiApiKey'} onSave={(v) => set('openaiApiKey', v)} placeholder="sk-… (optional — we cover this for trial/pro)" />
          <Password label="Anthropic API key" value={s.anthropicApiKey} saved={saved === 'anthropicApiKey'} onSave={(v) => set('anthropicApiKey', v)} placeholder="sk-ant-… (optional)" />
          <Password label="Hugging Face token" value={s.huggingfaceToken} saved={saved === 'huggingfaceToken'} onSave={(v) => set('huggingfaceToken', v)} placeholder="hf_…" />

          {/* AI Provider & Model */}
          <div className="pt-1 border-t border-border-soft">
            <div className="text-[10px] font-semibold text-text-4 uppercase tracking-widest mb-3">AI for summaries</div>

            {/* Provider toggle */}
            <Label>Provider</Label>
            <div className="flex gap-2 mb-3">
              {(['openai', 'anthropic'] as const).map((p) => {
                const active = s.aiProvider === p
                const disabled = p === 'anthropic' && !s.anthropicApiKey
                return (
                  <button
                    key={p}
                    disabled={disabled}
                    onClick={() => !disabled && set('aiProvider', p)}
                    title={disabled ? 'Enter your Anthropic API key first' : undefined}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-[12px] font-medium transition-all
                      ${active ? 'border-accent bg-blue-tint text-accent' : 'border-border-soft bg-bg text-text-3 hover:border-accent/40'}
                      ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <i className={`ti ti-${p === 'openai' ? 'brand-openai' : 'sparkles'} text-[14px]`} />
                    {p === 'openai' ? 'OpenAI' : 'Anthropic'}
                    {active && <i className="ti ti-check text-[12px]" />}
                  </button>
                )
              })}
            </div>

            {/* Model override */}
            <div>
              <Label saved={saved === 'aiModel'}>
                Model
                <span className="text-text-4 font-normal text-[10px]">
                  — leave blank for default ({s.aiProvider === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-4o'})
                </span>
              </Label>
              <input
                value={s.aiModel}
                onChange={(e) => setS((prev) => ({ ...prev, aiModel: e.target.value }))}
                onBlur={() => set('aiModel', s.aiModel)}
                onKeyDown={(e) => e.key === 'Enter' && set('aiModel', s.aiModel)}
                placeholder={s.aiProvider === 'anthropic' ? 'claude-opus-4-8' : 'gpt-4.1'}
                className="w-full font-mono text-[12px] bg-bg border border-border rounded-lg px-3 py-2.5 text-text placeholder:text-text-4 focus:border-accent focus:outline-none transition-all"
              />
            </div>

            {s.aiProvider === 'openai' && !s.openaiApiKey && (
              <p className="text-[11px] text-text-3 mt-2 flex items-center gap-1.5">
                <i className="ti ti-info-circle text-[13px] text-accent" />
                Using our default OpenAI key. Add your own above to override.
              </p>
            )}
            {s.aiProvider === 'openai' && !s.aiModel && (
              <p className="text-[11px] text-text-3 mt-1 flex items-center gap-1.5">
                <i className="ti ti-cpu text-[13px] text-accent" />
                {s.plan === 'pro' || s.plan === 'enterprise'
                  ? 'Default model: gpt-4o (Pro — best quality).'
                  : 'Default model: gpt-4o-mini (trial / free). Upgrade to Pro for gpt-4o.'}
              </p>
            )}
          </div>
        </Panel>

        {/* Audio */}
        <Panel title="Audio" icon="microphone" desc="Choose which devices BriefOS records.">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] text-text-3">
              {devices.length} {devices.length === 1 ? 'device' : 'devices'} detected
            </span>
            <button
              onClick={loadDevices}
              disabled={loadingDevices}
              className="text-text-3 hover:text-accent text-[12px] flex items-center gap-1 transition-all disabled:opacity-50"
            >
              <i className={`ti ti-${loadingDevices ? 'loader-2 animate-spin-slow' : 'refresh'} text-[13px]`} />
              Refresh
            </button>
          </div>
          {vbDetected ? (
            <div className="flex items-center gap-2 text-[12px] text-green bg-green-soft border border-green/20 rounded-lg px-3 py-2 mb-1">
              <i className="ti ti-circle-check text-[15px]" />
              Virtual audio device detected — call participants will be captured.
            </div>
          ) : !s.micOnly ? (
            <div className="bg-amber-soft border border-amber/30 rounded-panel p-4 mb-1">
              <div className="flex items-start gap-2.5">
                <i className="ti ti-alert-triangle text-[18px] text-amber mt-0.5" />
                <div className="flex-1">
                  <div className="text-[13px] font-semibold text-text mb-1">
                    No virtual audio device found
                  </div>
                  <p className="text-[12px] text-text-2 leading-relaxed mb-2.5">
                    For best results, install a virtual audio driver to capture all call
                    participants.
                  </p>
                  <div className="flex items-center gap-2 mb-2.5">
                    <button
                      onClick={() => window.open('https://vb-audio.com/Cable', '_blank')}
                      className="bg-amber text-white rounded-lg px-3 py-1.5 text-[12px] font-medium flex items-center gap-1.5 hover:opacity-90 transition-all active:scale-[.97]"
                    >
                      <i className="ti ti-download text-[14px]" /> Install VB-Cable (free)
                    </button>
                    <button
                      onClick={() => set('micOnly', true)}
                      className="text-text-2 hover:text-accent hover:bg-blue-tint border border-border rounded-lg px-3 py-1.5 text-[12px] transition-all"
                    >
                      Use microphone only
                    </button>
                  </div>
                  <p className="text-[11px] text-amber flex items-center gap-1">
                    <i className="ti ti-info-circle text-[12px]" />
                    After installing, restart your computer to activate the driver.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <Toggle
            label="Microphone only (no system audio)"
            value={s.micOnly}
            onSave={(v) => set('micOnly', v)}
          />
          <p className="text-[11px] text-text-3 -mt-1.5">
            Enable if you don't have a loopback device (e.g. VB-Cable). Records just your mic — you
            won't capture what other participants say.
          </p>
          {!s.micOnly && (
            <Select
              label="System audio (loopback)"
              value={s.systemAudioDevice}
              options={dedupeWith(devices, s.systemAudioDevice)}
              saved={saved === 'systemAudioDevice'}
              onSave={(v) => set('systemAudioDevice', v)}
            />
          )}
          <Select
            label="Microphone"
            value={s.microphoneDevice}
            options={dedupeWith(['default', ...devices], s.microphoneDevice)}
            saved={saved === 'microphoneDevice'}
            onSave={(v) => set('microphoneDevice', v)}
          />

          <div className="pt-1">
            <button
              onClick={runTest}
              disabled={testing}
              className="bg-surface hover:bg-blue-tint text-text-2 hover:text-accent border border-border hover:border-accent rounded-lg px-3.5 py-2 text-[12px] flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              <i className={`ti ti-${testing ? 'loader-2 animate-spin-slow' : 'wave-sine'} text-[14px]`} />
              {testing ? 'Testing… speak & play some audio' : 'Test audio levels'}
            </button>
            {levels && <LevelReport levels={levels} micOnly={s.micOnly} />}
          </div>
        </Panel>

        {/* Plan & License */}
        <PlanPanel currentPlan={s.plan} onPlanChange={(p) => setS((prev) => ({ ...prev, plan: p }))} />

        {/* Integrations */}
        <Panel title="Integrations" icon="plug" desc="Export destinations.">
          <Password label="Notion integration token" value={s.notionToken} saved={saved === 'notionToken'} onSave={(v) => set('notionToken', v)} placeholder="secret_…" />
          <Text label="Notion parent page ID" value={s.notionParentPageId} saved={saved === 'notionParentPageId'} onSave={(v) => set('notionParentPageId', v)} placeholder="32-char page id" mono />
          <Text label="Slack webhook URL" value={s.slackWebhookUrl} saved={saved === 'slackWebhookUrl'} onSave={(v) => set('slackWebhookUrl', v)} placeholder="https://hooks.slack.com/…" mono />
          <Text label="SMTP host" value={s.smtpHost} saved={saved === 'smtpHost'} onSave={(v) => set('smtpHost', v)} placeholder="smtp.gmail.com" />
          <NumberField label="SMTP port" value={s.smtpPort} saved={saved === 'smtpPort'} onSave={(v) => set('smtpPort', v)} />
          <Text label="SMTP user" value={s.smtpUser} saved={saved === 'smtpUser'} onSave={(v) => set('smtpUser', v)} placeholder="you@example.com" />
          <Password label="SMTP password" value={s.smtpPass} saved={saved === 'smtpPass'} onSave={(v) => set('smtpPass', v)} placeholder="app password" />
          <Text label="Email from address" value={s.emailFrom} saved={saved === 'emailFrom'} onSave={(v) => set('emailFrom', v)} placeholder="BriefOS <you@example.com>" />
        </Panel>

        {/* General */}
        <Panel title="General" icon="adjustments" desc="App behavior.">
          <Text label="Record hotkey" value={s.hotkeyRecord} saved={saved === 'hotkeyRecord'} onSave={(v) => set('hotkeyRecord', v)} placeholder="CmdOrCtrl+Shift+B" mono />
          <NumberField label="Retention (days)" value={s.retentionDays} saved={saved === 'retentionDays'} onSave={(v) => set('retentionDays', v)} />
          <Toggle label="Launch at startup" value={s.launchAtStartup} onSave={(v) => set('launchAtStartup', v)} />
        </Panel>
      </div>
    </div>
  )
}

// ── Plan Panel ──────────────────────────────────────────────────────────────

const PLAN_DEFS: { id: PlanType; name: string; price: string; badge?: string; badgeColor?: string; desc: string }[] = [
  { id: 'trial',      name: 'Try Free',        price: '$0',     badge: '10 meetings',  badgeColor: 'bg-green-soft text-green',  desc: 'First 10 meetings on us, no API keys needed.' },
  { id: 'byok',       name: 'Free + Own Keys', price: '$0',     badge: 'Unlimited',    badgeColor: 'bg-blue-tint text-accent',  desc: 'Unlimited meetings with your own OpenAI key. Anthropic key optional for Claude summaries.' },
  { id: 'pro',        name: 'Pro',             price: '$12/mo', badge: 'Most popular', badgeColor: 'bg-accent text-white',      desc: 'All features, we cover API costs.' },
  { id: 'enterprise', name: 'Enterprise',      price: 'Custom',                                                                  desc: 'On-premise, SSO, custom integrations.' },
]

function PlanPanel({ currentPlan, onPlanChange }: { currentPlan: string; onPlanChange: (p: PlanType) => void }) {
  const [selected, setSelected] = useState<PlanType>((currentPlan as PlanType) || 'trial')
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [err, setErr] = useState('')
  // byok key collection step
  const [showByokKeys, setShowByokKeys] = useState(false)
  const [openaiKey, setOpenaiKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [waitingPayment, setWaitingPayment] = useState(false)

  useEffect(() => { setSelected((currentPlan as PlanType) || 'trial') }, [currentPlan])

  const activatePlan = async (plan: PlanType, keys?: { openai: string; anthropic: string }) => {
    setSaving(true); setErr(''); setSavedOk(false)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      await updateProfile(user.id, { plan })
      await invoke('settings:set', { key: 'plan', value: plan as never })
      if (keys) {
        await invoke('settings:set', { key: 'openaiApiKey', value: keys.openai as never })
        await invoke('settings:set', { key: 'anthropicApiKey', value: keys.anthropic as never })
      }
      onPlanChange(plan)
      setSelected(plan)
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2500)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleSwitch = async () => {
    if (selected === currentPlan) return
    setErr('')

    if (selected === 'byok') {
      // Need API keys before activating
      setShowByokKeys(true)
      return
    }
    if (selected === 'pro') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setErr('Not signed in'); return }
      if (!STRIPE_PRO_LINK) { setErr('Stripe not configured yet — contact hello@briefos.app'); return }
      // Append user ID so webhook can identify who paid
      const checkoutUrl = `${STRIPE_PRO_LINK}?client_reference_id=${user.id}`
      window.open(checkoutUrl, '_blank')
      setWaitingPayment(true)
      // Plan will update automatically via Supabase realtime when webhook fires
      return
    }
    if (selected === 'enterprise') {
      window.open('mailto:hello@briefos.app?subject=BriefOS Enterprise', '_blank')
      return
    }
    // trial
    await activatePlan(selected)
  }

  const handleByokConfirm = async () => {
    if (!openaiKey.trim()) { setErr('OpenAI API key is required for transcription and summaries'); return }
    // Anthropic key is optional — only needed if the user switches to the Anthropic provider in Settings.
    setShowByokKeys(false)
    await activatePlan('byok', { openai: openaiKey.trim(), anthropic: anthropicKey.trim() })
  }

  const changed = selected !== currentPlan

  // CTA label per plan
  const ctaLabel = () => {
    if (!changed) return 'Current plan'
    if (selected === 'pro') return 'Go Pro →'
    if (selected === 'enterprise') return 'Contact us'
    if (selected === 'byok') return 'Enter API keys'
    return 'Switch to Free trial'
  }

  return (
    <Panel title="Plan" icon="crown" desc="Switch plan anytime.">
      <div className="grid grid-cols-2 gap-2">
        {PLAN_DEFS.map((p) => {
          const isCurrent = p.id === currentPlan
          const isSelected = p.id === selected
          return (
            <button
              key={p.id}
              onClick={() => { setSelected(p.id); setErr(''); setShowByokKeys(false) }}
              className={`text-left rounded-lg border-2 p-3 transition-all relative ${
                isSelected
                  ? 'border-accent bg-blue-tint'
                  : 'border-border-soft bg-bg hover:border-accent/40'
              }`}
            >
              {/* Current plan checkmark */}
              {isCurrent && (
                <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-green-soft border border-green/30 flex items-center justify-center">
                  <i className="ti ti-check text-[11px] text-green" />
                </span>
              )}
              <div className="flex items-center gap-1.5 mb-0.5 pr-6">
                <span className="font-semibold text-[12px] text-blue-deep">{p.name}</span>
                {p.badge && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${p.badgeColor}`}>{p.badge}</span>
                )}
              </div>
              <div className="text-[11px] font-bold text-accent mb-1">{p.price}</div>
              <p className="text-[10px] text-text-3 leading-relaxed">{p.desc}</p>
              {isCurrent && (
                <div className="mt-1.5 text-[10px] text-green font-medium flex items-center gap-1">
                  <i className="ti ti-circle-check text-[11px]" /> Active
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Waiting for Stripe payment */}
      {waitingPayment && currentPlan !== 'pro' && (
        <div className="bg-blue-tint border border-accent/20 rounded-lg px-4 py-3 flex items-center gap-3 animate-fade-up">
          <i className="ti ti-loader-2 animate-spin-slow text-[18px] text-accent flex-shrink-0" />
          <div>
            <div className="text-[12px] font-semibold text-blue-deep">Waiting for payment confirmation…</div>
            <div className="text-[11px] text-text-3 mt-0.5">Complete checkout in your browser. This will update automatically.</div>
          </div>
          <button onClick={() => setWaitingPayment(false)} className="ml-auto text-text-4 hover:text-text-2 text-[12px]">
            <i className="ti ti-x" />
          </button>
        </div>
      )}
      {currentPlan === 'pro' && waitingPayment && (
        <div className="bg-green-soft border border-green/20 rounded-lg px-4 py-3 flex items-center gap-2 animate-fade-up">
          <i className="ti ti-circle-check text-[18px] text-green flex-shrink-0" />
          <div className="text-[12px] font-semibold text-green">Pro activated! Welcome aboard 🎉</div>
        </div>
      )}

      {/* BYOK key collection */}
      {showByokKeys && (
        <div className="bg-bg border border-border-soft rounded-lg p-4 space-y-3 animate-fade-up">
          <p className="text-[12px] text-text-2 font-medium">Enter your API keys to activate Free + Own Keys:</p>
          <div>
            <label className="text-[11px] font-medium text-text mb-1 block">OpenAI API key <span className="text-red">*</span></label>
            <input
              type="password"
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder="sk-…"
              className="w-full font-mono text-[11px] bg-surface border border-border rounded-lg px-3 py-2 text-text placeholder:text-text-4 focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-text mb-1 block">
              Anthropic API key <span className="text-text-3 font-normal">(optional)</span>
            </label>
            <input
              type="password"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder="sk-ant-…"
              className="w-full font-mono text-[11px] bg-surface border border-border rounded-lg px-3 py-2 text-text placeholder:text-text-4 focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleByokConfirm}
              disabled={saving}
              className="flex-1 bg-accent hover:bg-blue-mid text-white rounded-lg py-2 text-[12px] font-semibold transition-all disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Activate'}
            </button>
            <button
              onClick={() => { setShowByokKeys(false); setSelected(currentPlan as PlanType) }}
              className="px-3 text-text-3 hover:text-text hover:bg-bg-2 rounded-lg text-[12px] transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {err && (
        <div className="text-[11px] text-red bg-red-soft border border-red/20 rounded-lg px-3 py-2 flex items-center gap-1.5">
          <i className="ti ti-alert-circle text-[13px] flex-shrink-0" />{err}
        </div>
      )}
      {savedOk && (
        <div className="text-[11px] text-green bg-green-soft border border-green/20 rounded-lg px-3 py-2 flex items-center gap-1.5">
          <i className="ti ti-circle-check text-[13px]" /> Plan updated successfully!
        </div>
      )}

      {!showByokKeys && (
        <button
          onClick={handleSwitch}
          disabled={!changed || saving}
          className="w-full bg-accent hover:bg-blue-mid text-white rounded-lg py-2 text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 shadow-[0_2px_8px_rgba(26,86,219,.22)] active:scale-[.98]"
        >
          {saving ? (
            <><i className="ti ti-loader-2 animate-spin-slow text-[14px]" /> Saving…</>
          ) : (
            <><i className="ti ti-crown text-[14px]" /> {ctaLabel()}</>
          )}
        </button>
      )}
    </Panel>
  )
}

function dedupeWith(list: string[], current: string): string[] {
  return [...new Set([...(current ? [current] : []), ...list])]
}

// --- Panel + field primitives ----------------------------------------------

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

function Select({
  label,
  value,
  options,
  onSave,
  saved
}: {
  label: string
  value: string
  options: string[]
  onSave: (v: string) => void
  saved?: boolean
}) {
  return (
    <div>
      <Label saved={saved}>{label}</Label>
      <select
        value={value}
        onChange={(e) => onSave(e.target.value)}
        className={`${inputCls} capitalize`}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
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

function LevelReport({ levels, micOnly }: { levels: AudioTestReport; micOnly: boolean }) {
  const Row = ({ label, r, hint }: { label: string; r: LevelResult | null; hint?: string }) => {
    if (!r) return null
    const db = !Number.isFinite(r.maxDb) ? '−∞' : `${Math.round(r.maxDb)} dB`
    return (
      <div className="mt-2 first:mt-0">
        <div className="flex items-center justify-between gap-2 text-[12px]">
          <span className="text-text-2 truncate">
            {label}: <span className="text-text-3">{r.device}</span>
          </span>
          <span
            className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              r.silent ? 'bg-amber-soft text-amber' : 'bg-green-soft text-green'
            }`}
          >
            {r.silent ? 'No signal' : 'Signal'} · {db}
          </span>
        </div>
        {r.silent && hint && <p className="text-[11px] text-amber mt-1">{hint}</p>}
      </div>
    )
  }
  return (
    <div className="mt-3 bg-bg border border-border-soft rounded-card p-3">
      {!micOnly && (
        <Row
          label="System audio"
          r={levels.system}
          hint="No system audio detected. In Windows Sound, set CABLE Input as the playback device (or route your meeting app's output to it) so call audio flows into the cable."
        />
      )}
      <Row
        label="Microphone"
        r={levels.mic}
        hint="No microphone signal. Check that your mic is unmuted and the correct device is selected."
      />
    </div>
  )
}
