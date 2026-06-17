import { useEffect, useState, useCallback } from 'react'
import type { NavigateFn } from './App'
import { invoke } from './lib/ipc'

// =============================================================================
// MeetingView — the Meeting Brief page. Loads a meeting (summary + transcript)
// via meetings:getOne, renders the structured brief + transcript tabs, and
// offers export (PDF/Notion/Slack/Email/clipboard) + regenerate.
// =============================================================================

interface ActionItem {
  person: string
  task: string
  deadline: string | null
  priority: 'high' | 'medium' | 'low'
}
interface Summary {
  tldr?: string
  context?: string
  decisions?: string[]
  actionItems?: ActionItem[]
  openQuestions?: string[]
  sentiment?: { positive: number; neutral: number; tense: number }
  keywords?: string[]
}
interface TranscriptRow {
  speaker: string
  start_ms: number
  end_ms: number
  text: string
}
interface Meeting {
  id: string
  title: string
  type: string
  started_at: string
  duration_s: number
  language: string
  accuracy: number
  summary: Summary | null
  transcript: TranscriptRow[]
}

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function fmtClock(ms: number): string {
  const t = Math.floor(ms / 1000)
  const m = Math.floor(t / 60)
  const sec = t % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}
function fmtDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

export default function MeetingView({ id, navigate }: { id: string | null; navigate: NavigateFn }) {
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'brief' | 'transcript'>('brief')
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const m = await invoke<Meeting>('meetings:getOne', id)
      setMeeting(m)
    } catch (err) {
      setToast({ kind: 'err', msg: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const flash = (kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg })
    setTimeout(() => setToast(null), 4000)
  }

  const runExport = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label)
    try {
      await fn()
      flash('ok', `${label} done`)
    } catch (err) {
      flash('err', `${label} failed: ${(err as Error).message}`)
    } finally {
      setBusy('')
    }
  }

  const regenerate = () =>
    runExport('Regenerate', async () => {
      if (!meeting) return
      await invoke('ai:regenerateSummary', { meetingId: meeting.id, promptType: 'auto' })
      await load()
    })

  if (!id) return <Centered icon="alert-circle" text="No meeting selected" />
  if (loading) return <Centered icon="loader-2" text="Loading meeting…" spin />
  if (!meeting) return <Centered icon="alert-circle" text="Meeting not found" />

  const s = meeting.summary

  return (
    <div className="min-h-screen bg-bg font-body text-text">
      <Hero
        meeting={meeting}
        onTitleSave={async (title) => {
          await invoke('meetings:updateTitle', { id: meeting.id, title })
          setMeeting({ ...meeting, title })
        }}
        onBack={() => navigate('dashboard')}
      />

      <div className="px-8">
        <ExportBar
          busy={busy}
          onCopy={() => runExport('Copy', () => invoke('export:clipboard', meeting.id))}
          onPdf={() => runExport('PDF', () => invoke('export:pdf', { meetingId: meeting.id }))}
          onNotion={() => runExport('Notion', () => invoke('export:notion', meeting.id))}
          onSlack={() =>
            runExport('Slack', async () => {
              const webhookUrl = await invoke<string>('settings:get', 'slackWebhookUrl')
              await invoke('export:slack', { meetingId: meeting.id, webhookUrl })
            })
          }
          onEmail={() =>
            runExport('Email', () =>
              invoke('export:email', { meetingId: meeting.id, recipients: [] })
            )
          }
          onRegenerate={regenerate}
        />

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border mb-5">
          <Tab active={tab === 'brief'} onClick={() => setTab('brief')} icon="file-text" label="Brief" />
          <Tab
            active={tab === 'transcript'}
            onClick={() => setTab('transcript')}
            icon="message-2"
            label={`Transcript (${meeting.transcript?.length ?? 0})`}
          />
        </div>

        <div className="pb-10">
          {tab === 'brief' &&
            (s ? <Brief summary={s} /> : <NoSummary onGenerate={regenerate} busy={!!busy} />)}
          {tab === 'transcript' && <Transcript rows={meeting.transcript ?? []} />}
        </div>
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-card shadow-lg text-[13px] z-50 animate-fade-up border ${
            toast.kind === 'ok'
              ? 'bg-green-soft border-green/20 text-green'
              : 'bg-red-soft border-red/20 text-red'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function Hero({
  meeting,
  onTitleSave,
  onBack
}: {
  meeting: Meeting
  onTitleSave: (t: string) => Promise<void>
  onBack: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(meeting.title)

  const save = async () => {
    setEditing(false)
    const t = title.trim()
    if (t && t !== meeting.title) await onTitleSave(t)
    else setTitle(meeting.title)
  }

  return (
    <div className="bg-blue-deep px-8 py-7">
      <button
        onClick={onBack}
        className="text-white/50 hover:text-white text-[12px] flex items-center gap-1 mb-3 transition-all"
      >
        <i className="ti ti-arrow-left text-[14px]" /> Dashboard
      </button>

      {editing ? (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className="font-display font-extrabold text-[26px] bg-white/10 text-white rounded-lg px-2 py-1 -ml-2 outline-none border border-white/20 focus:border-accent"
        />
      ) : (
        <h1
          onClick={() => setEditing(true)}
          className="font-display font-extrabold text-[26px] text-white cursor-text hover:opacity-90 inline-flex items-center gap-2 group"
        >
          {meeting.title}
          <i className="ti ti-pencil text-[15px] text-white/40 opacity-0 group-hover:opacity-100 transition-all" />
        </h1>
      )}

      <div className="flex items-center gap-5 mt-3 text-[12px] text-[#B9CBE4]">
        <span className="font-mono">{fmtDate(meeting.started_at)}</span>
        <span className="flex items-center gap-1">
          <i className="ti ti-clock text-[14px]" /> {fmtDuration(meeting.duration_s)}
        </span>
        <span className="flex items-center gap-1">
          <i className="ti ti-language text-[14px]" /> {(meeting.language || 'en').toUpperCase()}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-white/10 capitalize">{meeting.type}</span>
      </div>
    </div>
  )
}

function ExportBar(props: {
  busy: string
  onCopy: () => void
  onPdf: () => void
  onNotion: () => void
  onSlack: () => void
  onEmail: () => void
  onRegenerate: () => void
}) {
  const Btn = ({
    icon,
    label,
    onClick
  }: {
    icon: string
    label: string
    onClick: () => void
  }) => (
    <button
      onClick={onClick}
      disabled={!!props.busy}
      className="bg-surface hover:bg-blue-tint text-text-2 hover:text-accent border border-border hover:border-accent rounded-lg px-3.5 py-2 text-[12px] flex items-center gap-1.5 transition-all disabled:opacity-50"
    >
      <i
        className={`ti ti-${props.busy === label ? 'loader-2 animate-spin-slow' : icon} text-[14px]`}
      />
      {label}
    </button>
  )

  return (
    <div className="flex items-center gap-2 py-5 flex-wrap">
      <Btn icon="copy" label="Copy" onClick={props.onCopy} />
      <Btn icon="file-type-pdf" label="PDF" onClick={props.onPdf} />
      <Btn icon="brand-notion" label="Notion" onClick={props.onNotion} />
      <Btn icon="brand-slack" label="Slack" onClick={props.onSlack} />
      <Btn icon="mail" label="Email" onClick={props.onEmail} />
      <div className="flex-1" />
      <button
        onClick={props.onRegenerate}
        disabled={!!props.busy}
        className="text-text-3 hover:text-accent hover:bg-blue-tint rounded-lg px-3 py-2 text-[12px] flex items-center gap-1.5 transition-all disabled:opacity-50"
      >
        <i
          className={`ti ti-${props.busy === 'Regenerate' ? 'loader-2 animate-spin-slow' : 'refresh'} text-[14px]`}
        />
        Regenerate
      </button>
    </div>
  )
}

function Tab({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean
  onClick: () => void
  icon: string
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-[13px] flex items-center gap-1.5 border-b-2 -mb-px transition-all ${
        active
          ? 'border-accent text-accent font-medium'
          : 'border-transparent text-text-3 hover:text-text-2'
      }`}
    >
      <i className={`ti ti-${icon} text-[15px]`} />
      {label}
    </button>
  )
}

function Card({
  title,
  icon,
  children
}: {
  title: string
  icon: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-surface border border-border-soft rounded-panel shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-[18px] py-3.5 border-b border-border-soft bg-bg">
        <div className="w-7 h-7 rounded-lg bg-blue-tint flex items-center justify-center">
          <i className={`ti ti-${icon} text-[15px] text-accent`} />
        </div>
        <span className="text-[12px] font-semibold text-text tracking-wide">{title}</span>
      </div>
      <div className="p-[18px]">{children}</div>
    </div>
  )
}

function Brief({ summary }: { summary: Summary }) {
  const priColor: Record<string, string> = {
    high: 'bg-red-soft text-red',
    medium: 'bg-amber-soft text-amber',
    low: 'bg-green-soft text-green'
  }
  return (
    <div className="space-y-4 animate-fade-up">
      <Card title="TL;DR" icon="bolt">
        <p className="text-[14px] text-text leading-relaxed">{summary.tldr || '—'}</p>
      </Card>

      <Card title="Context" icon="info-circle">
        <p className="text-[13px] text-text-2 leading-relaxed">{summary.context || '—'}</p>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card title="Decisions" icon="circle-check">
          <List items={summary.decisions} empty="No decisions recorded" />
        </Card>
        <Card title="Open Questions" icon="help-circle">
          <List items={summary.openQuestions} empty="No open questions" />
        </Card>
      </div>

      <Card title="Action Items" icon="checklist">
        {summary.actionItems && summary.actionItems.length > 0 ? (
          <div className="divide-y divide-border-soft">
            {summary.actionItems.map((a, i) => (
              <div key={i} className="py-2.5 flex items-start gap-3 first:pt-0 last:pb-0">
                <div className="flex-1">
                  <div className="text-[13px] text-text">{a.task}</div>
                  <div className="text-[11px] text-text-3 mt-0.5 flex items-center gap-2">
                    <span className="font-medium text-text-2">{a.person}</span>
                    {a.deadline && (
                      <span className="font-mono">
                        <i className="ti ti-calendar text-[12px]" /> {a.deadline}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    priColor[a.priority] || priColor.low
                  }`}
                >
                  {a.priority}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-text-3">No action items</p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card title="Sentiment" icon="mood-smile">
          <SentimentBar sentiment={summary.sentiment} />
        </Card>
        <Card title="Keywords" icon="tags">
          {summary.keywords && summary.keywords.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {summary.keywords.map((k) => (
                <span
                  key={k}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-blue-tint text-text-2"
                >
                  {k}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-text-3">None</p>
          )}
        </Card>
      </div>
    </div>
  )
}

function List({ items, empty }: { items?: string[]; empty: string }) {
  if (!items || items.length === 0) return <p className="text-[13px] text-text-3">{empty}</p>
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="text-[13px] text-text flex items-start gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 flex-shrink-0" />
          {it}
        </li>
      ))}
    </ul>
  )
}

function SentimentBar({ sentiment }: { sentiment?: Summary['sentiment'] }) {
  const s = sentiment || { positive: 0, neutral: 100, tense: 0 }
  return (
    <div>
      <div className="flex h-2.5 rounded-full overflow-hidden border border-border">
        {s.positive > 0 && <div className="bg-green" style={{ width: `${s.positive}%` }} />}
        {s.neutral > 0 && <div className="bg-text-4" style={{ width: `${s.neutral}%` }} />}
        {s.tense > 0 && <div className="bg-red" style={{ width: `${s.tense}%` }} />}
      </div>
      <div className="flex gap-4 mt-2 text-[11px] text-text-3">
        <span>
          <i className="ti ti-circle-filled text-green text-[9px]" /> Positive {s.positive}%
        </span>
        <span>
          <i className="ti ti-circle-filled text-text-4 text-[9px]" /> Neutral {s.neutral}%
        </span>
        <span>
          <i className="ti ti-circle-filled text-red text-[9px]" /> Tense {s.tense}%
        </span>
      </div>
    </div>
  )
}

function Transcript({ rows }: { rows: TranscriptRow[] }) {
  if (!rows || rows.length === 0)
    return <Centered icon="message-off" text="No transcript available" />
  return (
    <div className="space-y-3 animate-fade-up">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-3">
          <div className="w-28 flex-shrink-0">
            <div className="text-[12px] font-semibold text-text-2">{r.speaker}</div>
            <div className="text-[10px] font-mono text-text-4">{fmtClock(r.start_ms)}</div>
          </div>
          <p className="text-[13px] text-text leading-relaxed flex-1">{r.text}</p>
        </div>
      ))}
    </div>
  )
}

function NoSummary({ onGenerate, busy }: { onGenerate: () => void; busy: boolean }) {
  return (
    <div className="bg-surface border border-border-soft rounded-panel p-10 text-center animate-fade-up">
      <div className="w-12 h-12 rounded-panel bg-blue-tint flex items-center justify-center mx-auto mb-3">
        <i className="ti ti-sparkles text-[24px] text-accent" />
      </div>
      <h3 className="font-display font-bold text-[16px] text-blue-deep mb-1">No summary yet</h3>
      <p className="text-[12px] text-text-3 mb-5">Generate an AI brief from this meeting's transcript.</p>
      <button
        onClick={onGenerate}
        disabled={busy}
        className="bg-accent hover:bg-blue-mid text-white rounded-lg px-5 py-2.5 text-[13px] font-medium inline-flex items-center gap-1.5 transition-all shadow-[0_2px_8px_rgba(26,86,219,.22)] active:scale-[.97] disabled:opacity-60"
      >
        <i className={`ti ti-${busy ? 'loader-2 animate-spin-slow' : 'sparkles'} text-[15px]`} />
        Generate Summary
      </button>
    </div>
  )
}

function Centered({ icon, text, spin }: { icon: string; text: string; spin?: boolean }) {
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-3 text-text-3">
      <i className={`ti ti-${icon} text-[28px] ${spin ? 'animate-spin-slow' : ''}`} />
      <span className="text-[13px]">{text}</span>
    </div>
  )
}
