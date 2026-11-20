import { useEffect, useMemo, useState } from 'react'
import type { NavigateFn } from './App'
import { invoke } from './lib/ipc'
import { ApiError, enhanceNotes, startMeeting, TEMPLATE_OPTIONS } from './lib/api'
import { parseTranscript, speakersOf } from './lib/transcriptImport'
import { notesLanguages } from './recording/meetingSession'
import { Page, SoonBadge } from './components/Page'

// =============================================================================
// Import — turn a meeting recorded elsewhere into Minutama notes:
// a transcript file from Zoom / Teams / Meet (.vtt, .srt, .txt) or pasted text.
// It becomes a normal meeting (counts toward the monthly limit on Free).
// =============================================================================

export default function ImportPage({ navigate }: { navigate: NavigateFn }) {
  const [raw, setRaw] = useState('')
  const [fileName, setFileName] = useState('')
  const [me, setMe] = useState('')
  const [templateId, setTemplateId] = useState('general')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const segments = useMemo(() => parseTranscript(raw), [raw])
  const speakers = useMemo(() => speakersOf(segments), [segments])

  // "Me" / "Я" in the file is obviously the user.
  useEffect(() => {
    if (!me) {
      const self = speakers.find((n) => /^(me|я|i|ich)$/i.test(n.trim()))
      if (self) setMe(self)
    }
  }, [speakers, me])

  const pick = async () => {
    setError('')
    try {
      const f = await invoke<{ name: string; text: string } | null>('import:pickTranscript')
      if (f) {
        setRaw(f.text)
        setFileName(f.name)
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const create = async () => {
    if (segments.length === 0) return
    setError('')
    try {
      setBusy('Starting…')
      const server = await startMeeting()
      const startedAt = new Date().toISOString()
      const meetingId = await invoke<string>('notes:create', { serverId: server.meetingId, startedAt, templateId })
      const rows = segments.map((s) => ({
        speaker: s.name ? s.name : 'Them',
        startMs: s.startMs,
        endMs: s.endMs,
        text: s.text
      }))
      await invoke('notes:replaceTranscript', { meetingId, segments: rows })

      setBusy('Writing notes…')
      const langs = await notesLanguages()
      const isMe = (n: string) => Boolean(me) && n.trim().toLowerCase() === me.trim().toLowerCase()
      const result = await enhanceNotes({
        meetingId: server.meetingId,
        templateId,
        userNotes: fileName ? `Imported from ${fileName}` : 'Imported transcript',
        transcript: segments.map((s) => ({
          speaker: isMe(s.name) ? 'me' : 'them',
          startMs: s.startMs,
          text: s.name && !isMe(s.name) ? `${s.name}: ${s.text}` : s.text
        })),
        ...langs
      })
      await invoke('notes:saveEnhanced', { meetingId, templateId, ...result })
      const last = segments[segments.length - 1]
      await invoke('notes:setStatus', { meetingId, status: 'done', durationS: Math.round((last?.endMs ?? 0) / 1000) })
      navigate('meeting', meetingId)
    } catch (e) {
      const err = e as Error
      setError(err instanceof ApiError && err.isPlanLimit ? err.message : err.message || 'Import failed.')
      setBusy(null)
    }
  }

  const allowed = new Set(TEMPLATE_OPTIONS.filter((t) => !t.pro).map((t) => t.id))

  return (
    <Page title="Import" subtitle="Turn a meeting recorded somewhere else into Minutama notes.">
      <div className="glass rounded-panel p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft">
            <i className="ti ti-file-text text-[18px] text-accent" />
          </div>
          <div className="flex-1">
            <div className="font-display text-[15px] font-bold">Transcript</div>
            <div className="text-[12px] text-text-3">From Zoom, Teams or Google Meet (.vtt, .srt, .txt) — or paste the text below.</div>
          </div>
          <button onClick={() => void pick()} className="btn-accent rounded-xl px-3.5 py-2 text-[12.5px] font-semibold">
            <i className="ti ti-upload text-[14px]" /> Choose file
          </button>
        </div>

        <textarea
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value)
            setFileName('')
          }}
          rows={10}
          placeholder={'Anna: Can we do something on price?\nMe: Annual is two months free.\n…'}
          className="mt-4 w-full resize-y rounded-xl border border-border bg-white/[.04] px-3.5 py-3 font-mono text-[12px] leading-relaxed text-text placeholder:text-text-4 focus:border-accent focus:outline-none"
        />

        {segments.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-text-3">
            <span className="text-green">
              <i className="ti ti-circle-check-filled" /> {segments.length} parts
            </span>
            {speakers.length > 0 && <span>Speakers: {speakers.slice(0, 6).join(', ')}{speakers.length > 6 ? '…' : ''}</span>}
            {fileName && <span>· {fileName}</span>}
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-text">Which speaker is you? (optional)</label>
            <select
              value={me}
              onChange={(e) => setMe(e.target.value)}
              className="w-full rounded-xl border border-border bg-white/[.06] px-3 py-2.5 text-[13px] text-text focus:border-accent focus:outline-none"
            >
              <option value="">Not in the list</option>
              {speakers.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-text">Template</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-xl border border-border bg-white/[.06] px-3 py-2.5 text-[13px] text-text focus:border-accent focus:outline-none"
            >
              {TEMPLATE_OPTIONS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.pro && !allowed.has(t.id) ? ' · Pro' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <div className="mt-3 rounded-lg border border-red/20 bg-red-soft px-3 py-2 text-[12px] text-red">{error}</div>}

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[11px] text-text-3">Counts as one meeting on the Free plan.</span>
          <button
            onClick={() => void create()}
            disabled={segments.length === 0 || busy !== null}
            className="btn-accent flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold disabled:opacity-40"
          >
            {busy ? <i className="ti ti-loader-2 animate-spin-slow text-[15px]" /> : <i className="ti ti-sparkles text-[15px]" />}
            {busy ?? 'Create notes'}
          </button>
        </div>
      </div>

      <div className="glass flex items-center gap-3 rounded-panel p-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[.06]">
          <i className="ti ti-file-music text-[18px] text-text-3" />
        </div>
        <div className="flex-1">
          <div className="font-display text-[15px] font-bold">Audio or video file</div>
          <div className="text-[12px] text-text-3">Upload a recording (.mp3, .m4a, .mp4) and get notes.</div>
        </div>
        <SoonBadge />
      </div>
    </Page>
  )
}
