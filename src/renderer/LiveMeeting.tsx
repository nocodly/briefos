import { useEffect, useRef, useState } from 'react'
import Markdown from './components/Markdown'
import { AgentRuns, SendToAgentModal } from './components/Agent'
import { TEMPLATE_OPTIONS } from './lib/api'
import {
  activeDurationMs,
  addTaskToNotes,
  clearError,
  enhanceCurrent,
  levels,
  pauseMeeting,
  resumeMeeting,
  setTemplate,
  setUserNotes,
  startMeetingSession,
  stopMeeting,
  useMeetingSession
} from './recording/meetingSession'

// =============================================================================
// LiveMeeting — the Minutama notepad.
//   Before:  pick a template, press "Start notes".
//   During:  type your own rough notes; live transcript fills in on the right.
//   After:   AI merges your notes + transcript into enhanced notes.
// =============================================================================

type NavigateFn = (page: 'dashboard' | 'meeting', id?: string) => void

function clock(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function useTicker(active: boolean): { ms: number; me: number; them: number } {
  const [v, setV] = useState({ ms: 0, me: 0, them: 0 })
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => {
      const l = levels()
      setV({ ms: activeDurationMs(), me: l.me, them: l.them })
    }, 200)
    return () => window.clearInterval(id)
  }, [active])
  return v
}

function Meter({ label, level, on }: { label: string; level: number; on: boolean }) {
  const pct = Math.min(100, Math.round(Math.sqrt(level) * 220))
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-text-3" title={on ? undefined : 'Not captured'}>
      <span>{label}</span>
      <div className="w-14 h-1.5 bg-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-150 ${on ? 'bg-green' : 'bg-text-4'}`}
          style={{ width: on ? `${pct}%` : '0%' }}
        />
      </div>
    </div>
  )
}

export default function LiveMeeting({ navigate }: { navigate: NavigateFn }) {
  const s = useMeetingSession()
  const live = s.status === 'recording' || s.status === 'paused'
  const busy = s.status === 'finishing' || s.status === 'enhancing'
  const tick = useTicker(live)
  const [view, setView] = useState<'notes' | 'ai'>('notes')
  const [side, setSide] = useState<'transcript' | 'agent'>('transcript')
  const [agentTask, setAgentTask] = useState<string | null>(null)
  const seenHints = useRef(0)

  // A new reply hint pulls the Agent tab forward once.
  useEffect(() => {
    if (s.hints.length > seenHints.current) setSide('agent')
    seenHints.current = s.hints.length
  }, [s.hints.length])
  const transcriptEnd = useRef<HTMLDivElement>(null)

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [s.segments.length])

  // Jump to the AI notes as soon as they arrive.
  useEffect(() => {
    if (s.enhanced) setView('ai')
  }, [s.enhanced])

  const allowed = new Set(s.limits?.templates ?? TEMPLATE_OPTIONS.filter((t) => !t.pro).map((t) => t.id))
  const hasSession = Boolean(s.meetingId) && s.status !== 'starting'

  return (
    <div className="h-full flex flex-col font-body text-text">
      {/* ── Top bar ── */}
      <div className="glass mx-3 mt-3 rounded-panel flex items-center gap-3 px-5 py-3">
        <button
          onClick={() => navigate('dashboard')}
          className="text-text-3 hover:text-text transition-colors"
          title="Back"
        >
          <i className="ti ti-arrow-left text-[18px]" />
        </button>
        <h1 className="font-display font-bold text-[16px] text-ink flex-1 truncate">
          {s.enhanced?.title ?? (live ? 'Meeting in progress' : 'New meeting')}
        </h1>

        <select
          value={s.templateId}
          onChange={(e) => (hasSession && !live ? void enhanceCurrent(e.target.value) : setTemplate(e.target.value))}
          disabled={busy}
          className="text-[12px] border border-border rounded-lg px-2 py-1.5 bg-surface text-text-2"
          title="Notes template"
        >
          {TEMPLATE_OPTIONS.map((t) => (
            <option key={t.id} value={t.id} disabled={!allowed.has(t.id)}>
              {t.name}
              {!allowed.has(t.id) ? ' · Pro' : ''}
            </option>
          ))}
        </select>

        {live && (
          <>
            <Meter label="You" level={tick.me} on />
            <Meter label="Them" level={tick.them} on={s.systemAudio} />
            <span className="font-mono text-[13px] text-text-2 w-[64px] text-right">{clock(tick.ms)}</span>
            {s.status === 'recording' ? (
              <button
                onClick={() => void pauseMeeting()}
                className="px-3 py-1.5 rounded-lg border border-border text-[12px] text-text-2 hover:bg-accent-soft"
              >
                <i className="ti ti-player-pause text-[14px]" /> Pause
              </button>
            ) : (
              <button
                onClick={() => resumeMeeting()}
                className="px-3 py-1.5 rounded-lg border border-border text-[12px] text-text-2 hover:bg-accent-soft"
              >
                <i className="ti ti-player-play text-[14px]" /> Resume
              </button>
            )}
            <button
              onClick={() => void stopMeeting()}
              className="px-3 py-1.5 rounded-lg bg-red text-white text-[12px] font-semibold flex items-center gap-1.5"
            >
              <span className="w-2 h-2 rounded-full bg-white animate-pulse-dot" /> Stop
            </button>
          </>
        )}

        {!live && !busy && (
          <button
            onClick={() => void startMeetingSession()}
            disabled={s.status === 'starting'}
            className="px-4 py-1.5 rounded-lg btn-accent text-[13px] font-semibold flex items-center gap-1.5 disabled:opacity-60"
          >
            <i className={`ti ${s.status === 'starting' ? 'ti-loader-2 animate-spin-slow' : 'ti-microphone'} text-[15px]`} />
            {s.status === 'starting' ? 'Starting…' : hasSession ? 'New meeting' : 'Start notes'}
          </button>
        )}

        {busy && (
          <span className="flex items-center gap-2 text-[12px] text-text-3">
            <i className="ti ti-loader-2 animate-spin-slow text-[15px]" />
            {s.status === 'finishing'
              ? `Finishing transcript${s.pendingUploads ? ` (${s.pendingUploads})` : ''}…`
              : 'Writing your notes…'}
          </span>
        )}
      </div>

      {/* ── Error / upgrade banner ── */}
      {s.error && (
        <div
          className={`mx-3 mt-3 px-4 py-2.5 rounded-card text-[13px] flex items-center gap-2 border ${
            s.upgradeNeeded ? 'bg-amber-soft border-amber/30 text-amber' : 'bg-red-soft border-red/20 text-red'
          }`}
        >
          <i className={`ti ${s.upgradeNeeded ? 'ti-crown' : 'ti-alert-circle'} text-[16px]`} />
          <span className="flex-1">{s.error}</span>
          <button onClick={clearError} className="opacity-60 hover:opacity-100">
            <i className="ti ti-x text-[14px]" />
          </button>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex-1 flex min-h-0">
        {/* Notes */}
        <div className="glass m-3 flex-1 flex flex-col min-w-0 rounded-panel overflow-hidden">
          {s.enhanced && (
            <div className="flex gap-1 px-8 pt-4">
              {(['ai', 'notes'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                    view === v ? 'bg-accent-soft text-accent' : 'text-text-3 hover:text-text'
                  }`}
                >
                  {v === 'ai' ? '✨ AI notes' : 'My notes'}
                </button>
              ))}
              {s.meetingId && (
                <button
                  onClick={() => navigate('meeting', s.meetingId!)}
                  className="ml-auto px-3 py-1.5 rounded-lg text-[12px] text-text-3 hover:text-text"
                >
                  Open meeting page <i className="ti ti-arrow-right text-[12px]" />
                </button>
              )}
            </div>
          )}

          {view === 'ai' && s.enhanced ? (
            <div className="flex-1 overflow-auto px-8 py-5 max-w-[820px]">
              <Markdown source={s.enhanced.notesMarkdown} />
            </div>
          ) : (
            <textarea
              value={s.userNotes}
              onChange={(e) => setUserNotes(e.target.value)}
              disabled={!hasSession || busy}
              placeholder={
                hasSession
                  ? 'Write anything important — a few words is enough. Minutama will fill in the rest from the conversation.'
                  : 'Press "Start notes" when your call begins. No bot joins the meeting — Minutama listens on your computer.'
              }
              className="flex-1 resize-none px-8 py-6 bg-transparent outline-none text-[15px] leading-relaxed text-text placeholder:text-text-4 disabled:cursor-default"
            />
          )}
        </div>

        {/* Live transcript */}
        <aside className="glass m-3 ml-0 w-[340px] rounded-panel flex flex-col overflow-hidden">
          <div className="px-2 pt-2 pb-1.5 border-b border-border-soft flex items-center gap-1">
            {([
              ['transcript', 'message-2', 'Transcript'],
              ['agent', 'sparkles', 'Agent']
            ] as const).map(([id, icon, label]) => (
              <button
                key={id}
                onClick={() => setSide(id)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-all ${
                  side === id ? 'bg-white/85 text-text shadow-[0_1px_2px_rgba(21,23,28,.06)]' : 'text-text-3 hover:text-text'
                }`}
              >
                <i className={`ti ti-${icon} text-[14px] ${side === id ? 'text-accent' : ''}`} /> {label}
                {id === 'agent' && s.hints.length > 0 && (
                  <span className="ml-0.5 rounded-full bg-accent px-1.5 text-[10px] text-white">{s.hints.length}</span>
                )}
              </button>
            ))}
            {s.pendingUploads > 0 && <i className="ti ti-loader-2 animate-spin-slow text-text-3 ml-auto mr-2" />}
          </div>
          {side === 'agent' ? (
            <AgentSide
              hints={s.hints}
              hintsNote={s.hintsNote}
              live={live}
              onSave={(t) => addTaskToNotes(t)}
              onSend={(t) => setAgentTask(t)}
            />
          ) : (
          <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
            {s.segments.length === 0 && (
              <p className="text-[12px] text-text-4 leading-relaxed">
                {live ? 'Listening… the first lines appear in about 20 seconds.' : 'The transcript will appear here.'}
              </p>
            )}
            {s.segments.map((seg, i) => (
              <div key={i} className={seg.speaker === 'me' ? 'pl-6' : 'pr-6'}>
                <div className="text-[10px] text-text-4 mb-0.5 font-mono">
                  {seg.speaker === 'me' ? 'You' : 'Them'} · {clock(seg.startMs)}
                </div>
                <div
                  className={`text-[13px] leading-relaxed rounded-card px-3 py-2 ${
                    seg.speaker === 'me' ? 'bg-accent-soft text-text' : 'bg-bg-2 text-text-2'
                  }`}
                >
                  {seg.text}
                </div>
              </div>
            ))}
            <div ref={transcriptEnd} />
          </div>
          )}
        </aside>
      </div>
      {agentTask !== null && (
        <SendToAgentModal
          task={agentTask}
          context={{
            title: s.enhanced?.title ?? 'Current meeting',
            date: new Date().toLocaleDateString(),
            notes: s.enhanced?.notesMarkdown ?? s.userNotes,
            transcript: s.segments.map((g) => ({ speaker: g.speaker === 'me' ? 'Me' : 'Them', text: g.text }))
          }}
          onClose={() => setAgentTask(null)}
        />
      )}
    </div>
  )
}

// ─── Agent tab: reply hints + task box + agent runs ─────────────────────────

function AgentSide({
  hints,
  hintsNote,
  live,
  onSave,
  onSend
}: {
  hints: { id: string; question: string; answer: string }[]
  hintsNote: string | null
  live: boolean
  onSave: (task: string) => void
  onSend: (task: string) => void
}) {
  const [task, setTask] = useState('')
  const [saved, setSaved] = useState(false)
  const submit = (fn: (t: string) => void) => {
    if (!task.trim()) return
    fn(task.trim())
    setTask('')
  }

  return (
    <div className="flex-1 overflow-auto px-3 py-3 space-y-4">
      {/* Task box */}
      <div className="rounded-card border border-border-soft bg-white/70 p-2.5">
        <textarea
          value={task}
          onChange={(e) => {
            setTask(e.target.value)
            setSaved(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(onSend)
          }}
          rows={2}
          placeholder="Tell your agent… e.g. “Send Anna the pricing deck”"
          className="w-full resize-none bg-transparent text-[13px] leading-snug outline-none placeholder:text-text-4"
        />
        <div className="mt-1.5 flex items-center gap-1.5">
          <button
            onClick={() => {
              submit(onSave)
              setSaved(true)
            }}
            disabled={!task.trim()}
            className="rounded-lg border border-border bg-white/80 px-2.5 py-1.5 text-[11.5px] font-medium text-text-2 hover:text-text disabled:opacity-40"
            title="Add to your notes as an action item"
          >
            <i className="ti ti-checkbox text-[13px]" /> Save task
          </button>
          <button
            onClick={() => submit(onSend)}
            disabled={!task.trim()}
            className="btn-accent ml-auto rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold disabled:opacity-40"
          >
            <i className="ti ti-send text-[13px]" /> Send to agent
          </button>
        </div>
        {saved && <div className="mt-1 text-[11px] text-green">Saved to your notes ✓</div>}
      </div>

      {/* Reply hints */}
      <div>
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.1em] text-text-3">
          <i className="ti ti-bulb text-[14px] text-accent" /> Reply hints
        </div>
        {hints.length === 0 ? (
          <p className="text-[12px] text-text-4 leading-relaxed">
            {live
              ? 'When someone asks you a question, a suggested answer appears here and in the floating capsule.'
              : 'Start a meeting to get live reply hints.'}
          </p>
        ) : (
          <div className="space-y-2">
            {hints.map((h) => (
              <div key={h.id} className="rounded-card border border-accent/20 bg-accent-soft/60 px-3 py-2.5">
                <div className="text-[11px] text-text-3">They asked: {h.question}</div>
                <div className="mt-1 text-[13px] leading-snug text-text">“{h.answer}”</div>
              </div>
            ))}
          </div>
        )}
        {hintsNote && <p className="mt-2 text-[11px] text-amber">{hintsNote}</p>}
      </div>

      <AgentRuns compact />
    </div>
  )
}
