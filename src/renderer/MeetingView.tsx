import { useEffect, useState, useCallback } from 'react'
import type { NavigateFn } from './App'
import Markdown from './components/Markdown'
import ShareMenu from './components/ShareMenu'
import TaskShare from './components/TaskShare'
import { enhanceNotes } from './lib/api'
import { invoke } from './lib/ipc'
import { notesLanguages } from './recording/meetingSession'

// =============================================================================
// MeetingView — the Meeting Brief page. Loads a meeting (summary + transcript)
// via meetings:getOne, renders the structured brief + transcript tabs, and
// offers export (PDF/Notion/Slack/Email/clipboard) + regenerate.
// =============================================================================

interface ActionItem {
  person: string
  task: string
  deadline: string | null
  dueDate?: string | null
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
  enhanced_notes?: string | null
  user_notes?: string | null
  server_id?: string | null
  template_id?: string | null
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
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
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
      // AI runs on the server, which only accepts meetings recorded with
      // Minutama (they carry a server meeting id).
      if (!meeting.server_id) throw new Error('This older meeting cannot be regenerated.')
      const templateId = meeting.template_id || 'general'
      const langs = await notesLanguages()
      const result = await enhanceNotes({
        meetingId: meeting.server_id,
        templateId,
        userNotes: meeting.user_notes ?? '',
        transcript: (meeting.transcript ?? []).map((r) => ({
          speaker: r.speaker === 'Me' ? 'me' : 'them',
          startMs: r.start_ms,
          text: r.text
        })),
        ...langs
      })
      await invoke('notes:saveEnhanced', { meetingId: meeting.id, templateId, ...result })
      await load()
    })

  if (!id) return <Centered icon="alert-circle" text="No meeting selected" />
  if (loading) return <Centered icon="loader-2" text="Loading meeting…" spin />
  if (!meeting) return <Centered icon="alert-circle" text="Meeting not found" />

  const s = meeting.summary

  return (
    <div className="min-h-screen font-body text-text">
      <Hero
        meeting={meeting}
        onTitleSave={async (title) => {
          await invoke('meetings:updateTitle', { id: meeting.id, title })
          setMeeting({ ...meeting, title })
        }}
        onBack={() => navigate('dashboard')}
        onOpenIntegrations={() => navigate('integrations')}
      />

      <div className="px-8">
        <div className="flex justify-end py-4">
          <button
            onClick={regenerate}
            disabled={!!busy}
            className="text-text-3 hover:text-accent hover:bg-accent-soft rounded-lg px-3 py-2 text-[12px] flex items-center gap-1.5 transition-all disabled:opacity-50"
          >
            <i className={`ti ti-${busy === 'Regenerate' ? 'loader-2 animate-spin-slow' : 'refresh'} text-[14px]`} />
            Regenerate
          </button>
        </div>

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
            (meeting.enhanced_notes ? (
              <div className="max-w-[820px]">
                <Markdown source={meeting.enhanced_notes} />
                <TaskList items={s?.actionItems ?? []} meetingTitle={meeting.title} />
                {meeting.user_notes?.trim() && (
                  <details className="mt-6 text-[13px] text-text-3">
                    <summary className="cursor-pointer">My original notes</summary>
                    <pre className="whitespace-pre-wrap font-body mt-2 text-text-2">{meeting.user_notes}</pre>
                  </details>
                )}
              </div>
            ) : s ? (
              <Brief summary={s} />
            ) : (
              <NoSummary onGenerate={regenerate} busy={!!busy} />
            ))}
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
  onBack,
  onOpenIntegrations
}: {
  onOpenIntegrations: () => void
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
    <div className="glass-dark mx-6 mt-4 rounded-panel px-8 py-7 text-white">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-[12px] text-white/50 transition-all hover:text-white">
          <i className="ti ti-arrow-left text-[14px]" /> Calls
        </button>
        <ShareMenu meetingId={meeting.id} onOpenIntegrations={onOpenIntegrations} />
      </div>

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

      <div className="flex items-center gap-5 mt-3 text-[12px] text-white/60">
        <span className="font-mono">{fmtDate(meeting.started_at)}</span>
        <span className="flex items-center gap-1">
          <i className="ti ti-clock text-[14px]" /> {fmtDuration(meeting.duration_s)}
        </span>
        <span className="flex items-center gap-1">
          <i className="ti ti-language text-[14px]" /> {(meeting.language || 'en').toUpperCase()}
        </span>
        {meeting.type && meeting.type !== 'other' && (
          <span className="px-2 py-0.5 rounded-full bg-white/10 capitalize">{meeting.type}</span>
        )}
      </div>
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
    <div className="glass rounded-panel overflow-hidden">
      <div className="flex items-center gap-2 px-[18px] py-3.5 border-b border-border-soft bg-bg">
        <div className="w-7 h-7 rounded-lg bg-accent-soft flex items-center justify-center">
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

    </div>
  )
}

// Tasks from the call: share each one to a calendar, Telegram, WhatsApp,
// email — or copy it.
function TaskList({ items, meetingTitle }: { items: ActionItem[]; meetingTitle: string }) {
  if (items.length === 0) return null
  return (
    <div className="glass rounded-panel mt-8 p-5">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center">
          <i className="ti ti-checklist text-[16px] text-accent" />
        </div>
        <div className="font-display font-bold text-[15px]">Tasks from this call</div>
      </div>
      <div className="mt-3 divide-y divide-border-soft">
        {items.map((a, i) => (
          <div key={i} className="flex items-center gap-3 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-text">{a.task}</div>
              <div className="text-[11px] text-text-3">
                {a.person}
                {a.deadline ? ` · ${a.deadline}` : ''}
                {a.dueDate ? ` · ${new Date(`${a.dueDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}
              </div>
            </div>
            <TaskShare task={{ task: a.task, dueDate: a.dueDate, deadline: a.deadline, person: a.person, meetingTitle }} />
          </div>
        ))}
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
    <div className="glass rounded-panel p-10 text-center animate-fade-up">
      <div className="w-12 h-12 rounded-panel bg-accent-soft flex items-center justify-center mx-auto mb-3">
        <i className="ti ti-sparkles text-[24px] text-accent" />
      </div>
      <h3 className="font-display font-bold text-[16px] text-text mb-1">No summary yet</h3>
      <p className="text-[12px] text-text-3 mb-5">Generate an AI brief from this meeting's transcript.</p>
      <button
        onClick={onGenerate}
        disabled={busy}
        className="btn-accent rounded-lg px-5 py-2.5 text-[13px] font-medium inline-flex items-center gap-1.5 transition-all active:scale-[.97] disabled:opacity-60"
      >
        <i className={`ti ti-${busy ? 'loader-2 animate-spin-slow' : 'sparkles'} text-[15px]`} />
        Generate Summary
      </button>
    </div>
  )
}

function Centered({ icon, text, spin }: { icon: string; text: string; spin?: boolean }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-text-3">
      <i className={`ti ti-${icon} text-[28px] ${spin ? 'animate-spin-slow' : ''}`} />
      <span className="text-[13px]">{text}</span>
    </div>
  )
}
