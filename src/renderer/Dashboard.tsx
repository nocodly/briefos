import { useEffect, useState, useCallback } from 'react'
import type { NavigateFn } from './App'
import { invoke } from './lib/ipc'
import { supabase, getProfile, TRIAL_LIMIT } from './lib/supabaseClient'

// =============================================================================
// Dashboard — meeting list + full-text search + Start Recording CTA. Loads via
// meetings:getAll; when the user types, switches to meetings:search (FTS5).
// =============================================================================

interface MeetingRow {
  id: string
  title: string
  type: string
  started_at: string
  duration_s: number
  tldr?: string
  excerpt?: string
}

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}
function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const TYPE_STYLE: Record<string, string> = {
  standup: 'bg-blue-tint text-accent',
  sales: 'bg-green-soft text-green',
  strategy: 'bg-purple-soft text-purple',
  onboarding: 'bg-amber-soft text-amber',
  review: 'bg-blue-tint text-accent',
  other: 'bg-bg-2 text-text-3'
}

export default function Dashboard({ navigate }: { navigate: NavigateFn }) {
  const [meetings, setMeetings] = useState<MeetingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [isTrial, setIsTrial] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await invoke<MeetingRow[]>('meetings:getAll', { limit: 100 })
      setMeetings(rows || [])
      setError('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const profile = await getProfile(user.id)
      setIsTrial(profile?.plan === 'trial')
    })
  }, [])

  // Debounced full-text search; empty query falls back to the full list.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      if (!searching) return
      setSearching(false)
      loadAll()
      return
    }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const rows = await invoke<MeetingRow[]>('meetings:search', q)
        setMeetings(rows || [])
        setError('')
      } catch (err) {
        setError((err as Error).message)
      }
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const startRecording = async () => {
    try {
      if (isTrial && meetings.length >= TRIAL_LIMIT) {
        setError(`You've used all ${TRIAL_LIMIT} free meetings. Upgrade to Pro or switch to Free + Own Keys in Settings → Plan.`)
        return
      }
      await invoke('recording:start', {})
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const remove = async (id: string) => {
    try {
      await invoke('meetings:delete', id)
      setMeetings((prev) => prev.filter((m) => m.id !== id))
      setConfirmId(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="min-h-screen bg-bg font-body text-text">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-bg/90 backdrop-blur border-b border-border px-8 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display font-extrabold text-[24px] text-blue-deep">Meetings</h1>
            <p className="text-[12px] text-text-3 mt-0.5">
              {meetings.length} {meetings.length === 1 ? 'meeting' : 'meetings'}
              {searching ? ' · search results' : ''}
            </p>
          </div>
          {isTrial && (
            <div className={`flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-full border ${
              meetings.length >= TRIAL_LIMIT
                ? 'bg-red-soft text-red border-red/20'
                : meetings.length >= TRIAL_LIMIT * 0.7
                ? 'bg-amber-soft text-amber border-amber/20'
                : 'bg-blue-tint text-accent border-accent/20'
            }`}>
              <i className="ti ti-gift text-[13px]" />
              {meetings.length}/{TRIAL_LIMIT} free meetings
            </div>
          )}
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={startRecording}
              className="bg-accent hover:bg-blue-mid text-white rounded-lg px-4 py-2.5 text-[13px] font-medium flex items-center gap-1.5 transition-all shadow-[0_2px_8px_rgba(26,86,219,.22)] active:scale-[.97]"
            >
              <i className="ti ti-microphone text-[15px]" /> Start Recording
            </button>
            <span className="text-[10px] text-text-4 flex items-center gap-1">
              <i className="ti ti-keyboard text-[11px]" />
              <kbd className="font-mono bg-bg-2 border border-border rounded px-1 py-0.5 text-[9px]">Ctrl+Shift+B</kbd>
              anywhere
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-4">
          <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-text-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search across all transcripts…"
            className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2.5 text-[13px] text-text placeholder:text-text-4 focus:border-accent focus:outline-none transition-all"
          />
        </div>
      </div>

      {/* Trial / Demo banner */}
      {isTrial && (
        <div className="mx-8 mt-6 bg-blue-tint border border-accent/20 rounded-panel px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <i className="ti ti-sparkles text-[16px] text-accent flex-shrink-0" />
            <span className="text-[12px] text-text-2">
              <span className="font-semibold text-blue-deep">Demo mode</span> — Found a bug?{' '}
              <button
                onClick={() => window.open('mailto:support@nocodly.com?subject=BriefOS Bug Report', '_blank')}
                className="text-accent underline underline-offset-2 hover:text-blue-mid transition-all"
              >
                Email support@nocodly.com
              </button>
              {' '}and get <span className="font-semibold text-green">2 weeks Pro free</span>.
            </span>
          </div>
          <button
            onClick={() => window.open('mailto:support@nocodly.com?subject=BriefOS Bug Report&body=Hi! I found a bug in BriefOS:%0A%0ADescribe the issue here...%0A%0AMy email: ', '_blank')}
            className="text-[11px] font-semibold bg-accent text-white px-3 py-1.5 rounded-lg hover:bg-blue-mid transition-all flex-shrink-0"
          >
            Report bug →
          </button>
        </div>
      )}

      <div className="p-8">
        {error && (
          <div className="mb-4 text-[12px] text-red bg-red-soft border border-red/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {loading ? (
          <Centered icon="loader-2" text="Loading meetings…" spin />
        ) : meetings.length === 0 ? (
          <EmptyState searching={searching} onStart={startRecording} />
        ) : (
          <div className="space-y-2.5">
            {meetings.map((m) => (
              <MeetingCard
                key={m.id}
                meeting={m}
                confirming={confirmId === m.id}
                onOpen={() => navigate('meeting', m.id)}
                onAskDelete={() => setConfirmId(m.id)}
                onCancelDelete={() => setConfirmId(null)}
                onConfirmDelete={() => remove(m.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MeetingCard({
  meeting,
  confirming,
  onOpen,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete
}: {
  meeting: MeetingRow
  confirming: boolean
  onOpen: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  const snippet = meeting.excerpt || meeting.tldr || ''
  return (
    <div className="group bg-surface border border-border-soft rounded-panel shadow-sm hover:border-accent/40 hover:shadow-md transition-all">
      <div className="flex items-center gap-4 p-[18px]">
        <button onClick={onOpen} className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="font-display font-bold text-[15px] text-blue-deep truncate">
              {meeting.title}
            </span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize flex-shrink-0 ${
                TYPE_STYLE[meeting.type] || TYPE_STYLE.other
              }`}
            >
              {meeting.type}
            </span>
          </div>
          {snippet && (
            <p
              className="text-[12px] text-text-2 line-clamp-1"
              dangerouslySetInnerHTML={{ __html: snippet }}
            />
          )}
          <div className="flex items-center gap-4 mt-1.5 text-[11px] text-text-3">
            <span className="font-mono">{fmtDate(meeting.started_at)}</span>
            <span className="flex items-center gap-1">
              <i className="ti ti-clock text-[12px]" /> {fmtDuration(meeting.duration_s)}
            </span>
          </div>
        </button>

        {confirming ? (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={onConfirmDelete}
              className="bg-red-soft text-red border border-red/20 hover:bg-red/10 rounded-lg px-3 py-1.5 text-[12px] transition-all"
            >
              Delete
            </button>
            <button
              onClick={onCancelDelete}
              className="text-text-3 hover:text-text-2 hover:bg-bg-2 rounded-lg px-2.5 py-1.5 text-[12px] transition-all"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={onAskDelete}
            className="text-text-4 hover:text-red hover:bg-red-soft rounded-lg p-2 transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
            title="Delete meeting"
          >
            <i className="ti ti-trash text-[15px]" />
          </button>
        )}
      </div>
    </div>
  )
}

function EmptyState({ searching, onStart }: { searching: boolean; onStart: () => void }) {
  if (searching) return <Centered icon="search-off" text="No meetings match your search" />
  return (
    <div className="bg-surface border border-border-soft rounded-panel p-12 text-center">
      <div className="w-14 h-14 rounded-panel bg-blue-tint flex items-center justify-center mx-auto mb-4">
        <i className="ti ti-microphone-2 text-[28px] text-accent" />
      </div>
      <h3 className="font-display font-bold text-[17px] text-blue-deep mb-1">No meetings yet</h3>
      <p className="text-[13px] text-text-3 mb-6 max-w-[320px] mx-auto">
        Join any call, press{' '}
        <kbd className="font-mono text-[11px] bg-bg-2 border border-border rounded px-1.5 py-0.5">
          Ctrl+Shift+B
        </kbd>{' '}
        or click below to record your first meeting.
      </p>
      <button
        onClick={onStart}
        className="bg-accent hover:bg-blue-mid text-white rounded-lg px-5 py-2.5 text-[13px] font-medium inline-flex items-center gap-1.5 transition-all shadow-[0_2px_8px_rgba(26,86,219,.22)] active:scale-[.97]"
      >
        <i className="ti ti-microphone text-[15px]" /> Start Recording
      </button>
    </div>
  )
}

function Centered({ icon, text, spin }: { icon: string; text: string; spin?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-text-3">
      <i className={`ti ti-${icon} text-[28px] ${spin ? 'animate-spin-slow' : ''}`} />
      <span className="text-[13px]">{text}</span>
    </div>
  )
}
