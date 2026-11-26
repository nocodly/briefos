'use client'

import { useEffect, useRef, useState } from 'react'
import { SITE } from '@/lib/site'
import { WindowsIcon } from '../Chrome'
import { Icon } from './Icon'

// "Try a call now": a 3-minute voice call with Anna (an AI client) right in
// the browser. She speaks English; her words appear live with the translation
// into the visitor's language and one-line hints for tech terms — what
// Minutama does on a real call. Server: supabase/functions/try-call.

const FN = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/try-call`
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const TRY_LANGS: { code: string; native: string; en: string }[] = [
  { code: 'es', native: 'Español', en: 'Spanish' },
  { code: 'uk', native: 'Українська', en: 'Ukrainian' },
  { code: 'pt', native: 'Português', en: 'Portuguese' },
  { code: 'hi', native: 'हिन्दी', en: 'Hindi' },
  { code: 'tr', native: 'Türkçe', en: 'Turkish' },
  { code: 'ar', native: 'العربية', en: 'Arabic' },
  { code: 'pl', native: 'Polski', en: 'Polish' },
  { code: 'de', native: 'Deutsch', en: 'German' },
  { code: 'fr', native: 'Français', en: 'French' },
  { code: 'it', native: 'Italiano', en: 'Italian' },
  { code: 'ro', native: 'Română', en: 'Romanian' },
  { code: 'ru', native: 'Русский', en: 'Russian' },
  { code: 'bn', native: 'বাংলা', en: 'Bengali' },
  { code: 'ur', native: 'اردو', en: 'Urdu' },
  { code: 'tl', native: 'Filipino', en: 'Filipino' },
  { code: 'id', native: 'Bahasa Indonesia', en: 'Indonesian' },
  { code: 'vi', native: 'Tiếng Việt', en: 'Vietnamese' }
]

export interface TryCallCopy {
  button: string
  title: string
  sub: string
  langLabel: string
  start: string
  note: string
  headphones: string
  connecting: string
  live: string
  anna: string
  you: string
  end: string
  left: string
  waitAnna: string
  endedTitle: string
  endedText: string
  download: string
  close: string
  micDenied: string
  failed: string
}

type Term = { term: string; explanation: string }
/** One of Anna's sentences: where it ends in her line, and its translation. */
type Sent = { end: number; tr?: string | null }
type Line = { id: string; who: 'anna' | 'you'; text: string; done: boolean; at: number; sents?: Sent[]; terms?: Term[] }

const EN_CPS = 0.0135 // Anna's speaking pace, letters per ms
const TR_CPS = 0.05 // a sentence's translation types in at this pace

/** Sentences of a line with their end positions. */
function splitSentences(text: string): { text: string; end: number }[] {
  const out: { text: string; end: number }[] = []
  const re = /[^.!?…]+[.!?…]+["”’)]*\s*|[^.!?…]+$/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m[0].trim()) out.push({ text: m[0].trim(), end: m.index + m[0].trimEnd().length })
  }
  return out
}

async function call<T>(body: unknown): Promise<T> {
  const res = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify(body)
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: { message?: string } }).error?.message ?? `Request failed (${res.status})`)
  return data as T
}

export function TryCallButton({ copy, className, children, defaultLang }: { copy: TryCallCopy; className: string; children?: React.ReactNode; defaultLang: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children ?? copy.button}
      </button>
      {open && <TryCallModal copy={copy} defaultLang={defaultLang} onClose={() => setOpen(false)} />}
    </>
  )
}

function TryCallModal({ copy, defaultLang, onClose }: { copy: TryCallCopy; defaultLang: string; onClose: () => void }) {
  const [lang, setLang] = useState(() => {
    const nav = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2).toLowerCase() : ''
    return TRY_LANGS.some((l) => l.code === nav) ? nav : defaultLang
  })
  const [phase, setPhase] = useState<'pick' | 'connecting' | 'live' | 'ended' | 'error'>('pick')
  const [error, setError] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [annaTalking, setAnnaTalking] = useState(false)
  const [left, setLeft] = useState(180)
  const [, setTick] = useState(0)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const micRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const tokenRef = useRef('')
  const endedRef = useRef(false)
  const target = TRY_LANGS.find((l) => l.code === lang)?.en ?? 'Spanish'

  // Hang up and release the microphone (no state changes — safe on unmount).
  const teardown = () => {
    pcRef.current?.getSenders().forEach((s) => s.track?.stop())
    pcRef.current?.close()
    pcRef.current = null
    micRef.current?.getTracks().forEach((t) => t.stop())
    micRef.current = null
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.srcObject = null
    }
  }

  const stop = (next: 'ended' | 'error' = 'ended') => {
    if (endedRef.current) return
    endedRef.current = true
    teardown()
    setAnnaTalking(false)
    setPhase(next)
  }

  // Close: Escape key; stop everything when the popup goes away.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      teardown()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // While live: a frame clock (Anna's words appear at speaking pace) + countdown.
  useEffect(() => {
    if (phase !== 'live') return
    let raf = 0
    const loop = () => {
      setTick((n) => n + 1)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const timer = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          stop('ended')
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // Keep the newest line in view.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [lines.length])

  const upsert = (id: string, who: Line['who'], patch: Partial<Line>) =>
    setLines((ls) => {
      const i = ls.findIndex((l) => l.id === id)
      if (i < 0) return [...ls, { id, who, text: '', done: false, at: performance.now(), ...patch }]
      const next = ls.slice()
      next[i] = { ...next[i], ...patch }
      return next
    })

  // Terms already explained in this call (each only once).
  const explained = useRef(new Set<string>())
  // When each sentence's translation was allowed to appear (for its typing).
  const unlocked = useRef(new Map<string, number>())

  // Each sentence is translated on its own, so its translation can appear
  // right after Anna says it — not the whole line before she finished.
  const translateLine = async (id: string, text: string) => {
    const parts = splitSentences(text)
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, sents: parts.map((p) => ({ end: p.end })) } : l)))
    await Promise.all(
      parts.map(async (p, i) => {
        let tr: string | null = null
        let terms: Term[] = []
        try {
          const r = await call<{ translation: string | null; terms: Term[] }>({ action: 'translate', token: tokenRef.current, text: p.text, target })
          tr = r.translation ?? p.text
          terms = (r.terms ?? []).filter((t) => {
            const k = t.term.toLowerCase()
            if (explained.current.has(k)) return false
            explained.current.add(k)
            return true
          })
        } catch {
          tr = null
        }
        setLines((ls) =>
          ls.map((l) => {
            if (l.id !== id || !l.sents) return l
            const sents = l.sents.slice()
            sents[i] = { ...sents[i], tr }
            return { ...l, sents, terms: [...(l.terms ?? []), ...terms].slice(0, 3) }
          })
        )
      })
    )
  }

  const start = async () => {
    setError('')
    setPhase('connecting')
    endedRef.current = false
    try {
      micRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } })
    } catch {
      setError(copy.micDenied)
      setPhase('error')
      return
    }
    try {
      const { secret, model, token, maxSeconds } = await call<{ secret: string; model: string; token: string; maxSeconds: number }>({ action: 'start' })
      tokenRef.current = token
      setLeft(maxSeconds || 180)
      const pc = new RTCPeerConnection()
      pcRef.current = pc
      const audio = new Audio()
      audio.autoplay = true
      audioRef.current = audio
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0]
        void audio.play().catch(() => {})
      }
      const mic = micRef.current!
      mic.getTracks().forEach((t) => pc.addTrack(t, mic))
      // Half-duplex like the app: Anna's mic is closed while she talks, so she
      // never hears herself through the visitor's speakers.
      const setMic = (on: boolean) => mic.getAudioTracks().forEach((t) => (t.enabled = on))
      let reopen: ReturnType<typeof setTimeout> | null = null
      const ev = pc.createDataChannel('oai-events')
      ev.onopen = () => {
        setMic(false)
        ev.send(JSON.stringify({ type: 'response.create' }))
        setPhase('live')
      }
      ev.onmessage = (e) => {
        let m: { type?: string; item_id?: string; delta?: string; transcript?: string }
        try {
          m = JSON.parse(String(e.data))
        } catch {
          return
        }
        switch (m.type) {
          case 'output_audio_buffer.started':
            if (reopen) clearTimeout(reopen)
            setMic(false)
            setAnnaTalking(true)
            break
          case 'output_audio_buffer.stopped':
          case 'output_audio_buffer.cleared':
            setAnnaTalking(false)
            if (reopen) clearTimeout(reopen)
            reopen = setTimeout(() => setMic(true), 800)
            break
          case 'response.output_audio_transcript.delta':
            if (m.item_id && m.delta) {
              const id = m.item_id
              const d = m.delta
              setLines((ls) => {
                const i = ls.findIndex((l) => l.id === id)
                if (i < 0) return [...ls, { id, who: 'anna', text: d, done: false, at: performance.now() }]
                const next = ls.slice()
                next[i] = { ...next[i], text: next[i].text + d }
                return next
              })
            }
            break
          case 'response.output_audio_transcript.done':
            if (m.item_id && m.transcript) {
              upsert(m.item_id, 'anna', { text: m.transcript, done: true })
              void translateLine(m.item_id, m.transcript)
            }
            break
          case 'conversation.item.input_audio_transcription.completed':
            if (m.item_id && m.transcript?.trim()) upsert(m.item_id, 'you', { text: m.transcript.trim(), done: true })
            break
        }
      }
      pc.onconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) stop('ended')
      }
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const res = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/sdp' },
        body: offer.sdp
      })
      if (!res.ok) throw new Error(copy.failed)
      await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() })
    } catch (err) {
      setError((err as Error).message || copy.failed)
      stop('error')
    }
  }

  const now = typeof performance !== 'undefined' ? performance.now() : 0
  // Anna's words appear at speaking pace (~15 letters a second), not all at once.
  const shownChars = (l: Line) => (l.who === 'you' ? l.text.length : Math.max(0, Math.floor((now - l.at) * EN_CPS)))
  const shownText = (l: Line) => l.text.slice(0, shownChars(l))
  // The translation under Anna's words: a sentence appears once she has said
  // it, and types in smoothly (the rest keeps its place, so nothing jumps).
  const shownTr = (l: Line): { done: string; rest: string } | null => {
    if (!l.sents?.length) return null
    const said = shownChars(l)
    let done = ''
    let rest = ''
    l.sents.forEach((p, i) => {
      if (!p.tr) return
      const key = `${l.id}#${i}`
      if (said >= p.end && !unlocked.current.has(key)) unlocked.current.set(key, now)
      const at = unlocked.current.get(key)
      const sep = done || rest ? ' ' : ''
      if (at === undefined) {
        rest += sep + p.tr
        return
      }
      const n = Math.floor((now - at) * TR_CPS)
      if (rest) rest += sep + p.tr
      else {
        done += sep + p.tr.slice(0, n)
        rest += p.tr.slice(n)
      }
    })
    return done || rest ? { done, rest } : null
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="relative flex max-h-[92vh] w-full max-w-lg animate-rise flex-col overflow-hidden rounded-t-[24px] border border-white/10 bg-[#121318] shadow-[0_30px_80px_-20px_rgba(0,0,0,.9)] sm:rounded-[24px]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
      >
        {/* Header: Anna */}
        <div className="flex items-center gap-3 border-b border-white/[.07] px-5 py-4">
          <span
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[linear-gradient(135deg,#FFB088,#FF6A3D)] font-display text-[14px] font-bold text-white"
            style={{
              boxShadow: annaTalking ? '0 0 0 3px rgba(34,197,94,.55), 0 0 0 8px rgba(34,197,94,.15)' : 'none',
              transition: 'box-shadow .4s ease'
            }}
          >
            AW
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[16px] font-bold text-t-1">Anna Weber</div>
            <div className="truncate text-[12.5px] text-t-3">{copy.anna}</div>
          </div>
          {phase === 'live' && (
            <span className="flex items-center gap-1.5 rounded-full bg-[#F2555A]/15 px-2.5 py-1 font-mono text-[12px] text-[#F2555A]">
              <span className="h-1.5 w-1.5 animate-blink rounded-full bg-[#F2555A]" />
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} {copy.left}
            </span>
          )}
          <button onClick={onClose} aria-label={copy.close} className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-t-3 hover:bg-white/10 hover:text-t-1">
            ✕
          </button>
        </div>

        {/* Pick a language */}
        {(phase === 'pick' || phase === 'error') && (
          <div className="p-5">
            <h3 className="font-display text-[22px] font-bold leading-tight text-t-1">{copy.title}</h3>
            <p className="mt-2 text-[14.5px] leading-relaxed text-t-2">{copy.sub}</p>
            <label className="mt-5 block text-[12px] font-semibold uppercase tracking-[.12em] text-t-3">{copy.langLabel}</label>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.05] px-3.5 py-3 text-[15px] text-t-1 focus:border-accent focus:outline-none"
            >
              {TRY_LANGS.map((l) => (
                <option key={l.code} value={l.code} className="bg-[#121318]">
                  {l.native}
                </option>
              ))}
            </select>
            {error && <p className="mt-3 rounded-xl border border-[#F2555A]/30 bg-[#F2555A]/10 px-3 py-2 text-[13px] text-[#FF9A9D]">{error}</p>}
            <button onClick={() => void start()} className="btn-glow mt-5 w-full py-3.5 text-[15.5px]">
              <Icon name="phone" className="h-4 w-4" /> {copy.start}
            </button>
            <p className="mt-3 text-center text-[12.5px] text-t-3">{copy.note}</p>
            <p className="mt-1 text-center text-[12.5px] text-t-3">🎧 {copy.headphones}</p>
          </div>
        )}

        {phase === 'connecting' && (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-accent/30 border-t-accent" />
            <p className="text-[14.5px] text-t-2">{copy.connecting}</p>
          </div>
        )}

        {/* Live captions */}
        {phase === 'live' && (
          <>
            <div ref={listRef} className="min-h-[280px] flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {lines.length === 0 && <p className="py-10 text-center text-[14px] text-t-3">{copy.waitAnna}</p>}
              {lines.map((l) =>
                l.who === 'anna' ? (
                  <div key={l.id} className="animate-rise">
                    <div className="text-[10.5px] font-semibold uppercase tracking-[.14em] text-accent-pale">Anna</div>
                    <div className="mt-0.5 text-[15px] font-medium leading-snug text-t-1">{shownText(l)}</div>
                    {(() => {
                      const tr = shownTr(l)
                      if (!tr || !tr.done) return null
                      return (
                        <div dir={lang === 'ar' || lang === 'ur' ? 'rtl' : 'ltr'} className="mt-0.5 text-[14.5px] leading-snug text-[#8FD8F7]">
                          {tr.done}
                          <span className="invisible">{tr.rest}</span>
                        </div>
                      )
                    })()}
                    {shownChars(l) >= l.text.length && l.terms?.map((t) => (
                      <div key={t.term} className="mt-1.5 animate-rise rounded-lg border border-[#F5A524]/25 bg-[#F5A524]/[.07] px-2.5 py-1.5 text-[12.5px] text-t-2">
                        <b className="text-[#F5A524]">{t.term}</b> — {t.explanation}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div key={l.id} className="animate-rise text-right">
                    <div className="text-[10.5px] font-semibold uppercase tracking-[.14em] text-[#9DB7FF]/80">{copy.you}</div>
                    <div className="mt-0.5 inline-block rounded-2xl bg-white/[.06] px-3 py-1.5 text-left text-[14px] text-t-2">{l.text}</div>
                  </div>
                )
              )}
            </div>
            <div className="flex items-center gap-3 border-t border-white/[.07] px-5 py-3.5">
              <span className="flex flex-1 items-center gap-2 text-[12.5px] text-t-3">
                <span className={`h-2 w-2 rounded-full ${annaTalking ? 'bg-[#22C55E]' : 'animate-pulse bg-[#9DB7FF]'}`} />
                {annaTalking ? 'Anna…' : copy.live}
              </span>
              <button onClick={() => stop('ended')} className="rounded-full bg-[#F2555A] px-4 py-2 text-[13.5px] font-semibold text-white hover:brightness-110">
                {copy.end}
              </button>
            </div>
          </>
        )}

        {phase === 'ended' && (
          <div className="p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#22C55E]/15 text-[#22C55E]">
              <Icon name="done" className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-display text-[22px] font-bold text-t-1">{copy.endedTitle}</h3>
            <p className="mx-auto mt-2 max-w-sm text-[14.5px] leading-relaxed text-t-2">{copy.endedText}</p>
            <a href={SITE.downloadUrl} className="btn-glow mt-6 w-full py-3.5 text-[15.5px]">
              <WindowsIcon /> {copy.download}
            </a>
            <button onClick={onClose} className="mt-3 text-[13px] text-t-3 hover:text-t-1">
              {copy.close}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
