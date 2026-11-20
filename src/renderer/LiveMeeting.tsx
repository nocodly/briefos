import { useEffect, useRef, useState } from 'react'
import Markdown from './components/Markdown'
import ShareMenu from './components/ShareMenu'
import { openCheckout, usePrices } from './lib/billing'
import { TEMPLATE_OPTIONS } from './lib/api'
import {
  activeDurationMs,
  clearError,
  enhanceCurrent,
  levels,
  pauseMeeting,
  resumeMeeting,
  setCallContext,
  setCardAnswered,
  setTemplate,
  setUserNotes,
  startMeetingSession,
  stopMeeting,
  useMeetingSession,
  type QuestionCard
} from './recording/meetingSession'

// =============================================================================
// LiveMeeting — the Minutama notepad.
//   Before:  pick a template, press "Start notes".
//   During:  type your own rough notes; live transcript fills in on the right.
//   After:   AI merges your notes + transcript into enhanced notes.
// =============================================================================

type NavigateFn = (page: 'dashboard' | 'meeting' | 'integrations', id?: string) => void

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
  const [side, setSide] = useState<'transcript' | 'questions'>('transcript')
  const seenHints = useRef(0)

  // A new question card pulls the Questions tab forward once.
  useEffect(() => {
    if (s.hints.length > seenHints.current) setSide('questions')
    seenHints.current = s.hints.length
  }, [s.hints.length])
  const transcriptEnd = useRef<HTMLDivElement>(null)

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [s.segments.length, s.live])

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
        <h1 className="font-display font-bold text-[16px] text-text flex-1 truncate">
          {s.enhanced?.title ?? (live ? 'Call in progress' : 'New call')}
        </h1>

        {s.meetingId && s.enhanced && !live && !busy && (
          <ShareMenu meetingId={s.meetingId} onOpenIntegrations={() => navigate('integrations')} />
        )}

        {/* The template is picked automatically (client call when "About this
            call" is filled); it can be changed once the notes are written. */}
        {s.enhanced && !live && (
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
        )}

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
          {s.upgradeNeeded && <LimitActions error={s.error ?? ''} />}
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
              ['questions', 'help-circle', 'Questions']
            ] as const).map(([id, icon, label]) => (
              <button
                key={id}
                onClick={() => setSide(id)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-all ${
                  side === id ? 'bg-white/[.06] text-text' : 'text-text-3 hover:text-text'
                }`}
              >
                <i className={`ti ti-${icon} text-[14px] ${side === id ? 'text-accent' : ''}`} /> {label}
                {id === 'questions' && s.hints.length > 0 && (
                  <span className="ml-0.5 rounded-full bg-accent px-1.5 text-[10px] text-white">{s.hints.length}</span>
                )}
              </button>
            ))}
            {s.pendingUploads > 0 && <i className="ti ti-loader-2 animate-spin-slow text-text-3 ml-auto mr-2" />}
          </div>
          {side === 'questions' ? (
            <QuestionsSide hints={s.hints} hintsNote={s.hintsNote} live={live} />
          ) : (
          <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
            {s.segments.length === 0 && (
              <p className="text-[12px] text-text-4 leading-relaxed">
                {live ? 'Listening… lines appear as people speak.' : 'The transcript will appear here.'}
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
                  {seg.translation && (
                    <div className="mt-1 border-t border-border-soft pt-1 text-[12.5px] font-medium text-text">{seg.translation}</div>
                  )}
                </div>
              </div>
            ))}
            {s.live
              .filter((l) => !l.final && l.text)
              .map((l) => (
                <div key={l.id} className={l.speaker === 'me' ? 'pl-6' : 'pr-6'}>
                  <div className="mb-0.5 flex items-center gap-1 font-mono text-[10px] text-text-4">
                    <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-green" /> {l.speaker === 'me' ? 'You' : 'Them'} · live
                  </div>
                  <div
                    className={`rounded-card px-3 py-2 text-[13px] leading-relaxed ${
                      l.speaker === 'me' ? 'bg-accent-soft text-text' : 'bg-bg-2 text-text-2'
                    }`}
                  >
                    {l.text}
                    <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-text-3" />
                    {l.translation && (
                      <div className="mt-1 border-t border-border-soft pt-1 text-[12.5px] font-medium text-text">{l.translation}</div>
                    )}
                  </div>
                </div>
              ))}
            <div ref={transcriptEnd} />
          </div>
          )}
        </aside>
      </div>
    </div>
  )
}

// ─── Questions tab: what the call is about + the client's questions ─────────

function QuestionsSide({ hints, hintsNote, live }: { hints: QuestionCard[]; hintsNote: string | null; live: boolean }) {
  return (
    <div className="flex-1 overflow-auto px-3 py-3 space-y-4">
      <CallContextBox />

      {/* Client questions */}
      <div>
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.1em] text-text-3">
          <i className="ti ti-help-circle text-[14px] text-accent" /> Client questions
          {hints.some((h) => !h.answered) && (
            <span className="ml-auto normal-case tracking-normal text-amber">
              {hints.filter((h) => !h.answered).length} not answered
            </span>
          )}
        </div>
        {hints.length === 0 ? (
          <p className="text-[12px] text-text-4 leading-relaxed">
            {live
              ? 'Every question the client asks appears here and in the floating capsule, translated into your language.'
              : 'Start a call to see the client’s questions live.'}
          </p>
        ) : (
          <div className="space-y-2">
            {hints.map((h) => (
              <div
                key={h.id}
                className={`rounded-card border px-3 py-2.5 ${
                  h.answered ? 'border-border-soft bg-white/[.03] opacity-60' : 'border-accent/20 bg-accent-soft/60'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] text-text-2">{h.question}</div>
                    {h.translation && <div className="mt-0.5 text-[13px] font-medium leading-snug text-text">{h.translation}</div>}
                  </div>
                  <button
                    onClick={() => setCardAnswered(h.id, !h.answered)}
                    title={h.answered ? 'Mark as not answered' : 'Mark as answered'}
                    className={`flex-shrink-0 ${h.answered ? 'text-green' : 'text-text-4 hover:text-green'}`}
                  >
                    <i className={`ti ti-${h.answered ? 'circle-check-filled' : 'circle-check'} text-[16px]`} />
                  </button>
                </div>
                {h.term && h.termExplanation && (
                  <div className="mt-1.5 text-[11.5px] text-text-3">
                    <span className="font-semibold text-accent">{h.term}:</span> {h.termExplanation}
                  </div>
                )}
                {h.answer && <div className="mt-1 text-[11.5px] text-text-3">Mention: {h.answer}</div>}
                {h.latencyMs !== null && (
                  <div className="mt-1 font-mono text-[10px] text-text-4">{(h.latencyMs / 1000).toFixed(1)} s after the question</div>
                )}
              </div>
            ))}
          </div>
        )}
        {hintsNote && <p className="mt-2 text-[11px] text-amber">{hintsNote}</p>}
      </div>
    </div>
  )
}

// Background for the AI: the job post, proposal or stack for this client.
function CallContextBox() {
  const ctx = useMeetingSession((st) => st.callContext)
  const [open, setOpen] = useState(!ctx)
  return (
    <div className="rounded-card border border-border-soft bg-white/[.04] p-2.5">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-[.1em] text-text-3">
        <i className="ti ti-briefcase text-[14px] text-accent" /> About this call
        <span className="ml-auto normal-case tracking-normal text-text-4">{ctx ? 'added ✓' : 'optional'}</span>
      </button>
      {open && (
        <>
          <textarea
            value={ctx}
            onChange={(e) => setCallContext(e.target.value)}
            rows={4}
            placeholder="Paste the job post, your proposal or the client’s stack. Minutama uses it to understand terms and to write the brief and estimate."
            className="mt-2 w-full resize-y rounded-lg border border-border bg-white/[.04] p-2 text-[12px] leading-snug outline-none placeholder:text-text-4 focus:border-accent/50"
          />
        </>
      )}
    </div>
  )
}

// Buttons on the "limit reached" banner: hours → top-up (+ Pro Max for Pro),
// meeting count (Free) → upgrade to Pro.
function LimitActions({ error }: { error: string }) {
  const PRICES = usePrices()
  const hours = /hour/i.test(error)
  const isMax = /wait for the next month/i.test(error)
  return (
    <span className="flex gap-1.5">
      {hours && (
        <button onClick={() => void openCheckout('topup').catch(() => {})} className="btn-accent rounded-lg px-2.5 py-1 text-[12px] font-semibold">
          +10 h · {PRICES.topup}
        </button>
      )}
      {!isMax && (
        <button
          onClick={() => void openCheckout(hours ? 'max' : 'pro').catch(() => {})}
          className="rounded-lg border border-amber/40 px-2.5 py-1 text-[12px] font-semibold hover:bg-amber/10"
        >
          {hours ? `Pro Max · ${PRICES.max}` : `Upgrade · ${PRICES.pro}`}
        </button>
      )}
    </span>
  )
}
