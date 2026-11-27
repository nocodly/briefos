'use client'

import { useEffect, useRef, useState } from 'react'
import { SITE } from '@/lib/site'
import { WindowsIcon } from '../Chrome'
import { Icon } from './Icon'

// "Try a call now": a 3-minute voice call with Anna (an AI client) right in
// the browser — what Minutama does on a real call:
//   • her words appear at the pace she speaks,
//   • each sentence is translated the moment its text arrives (the text comes
//     ahead of her voice), and shown under her words once she has said it,
//   • one-line hints for technical terms,
//   • Ask AI on her questions: what she means + an answer to say,
//   • your own words, so you see she hears you (plus a live mic meter).
// Server: supabase/functions/try-call.

const FN = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/try-call`
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

const EN_CPS = 0.0145 // Anna's speaking pace, letters per ms
const TR_CPS = 0.06 // translation types in at this pace
const AI_CPS = 0.07 // Ask AI answer

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
  hearing?: string
  ask?: string
  thinking?: string
}

type Term = { term: string; explanation: string }
type Sent = { text: string; end: number; tr?: string | null; unlockAt?: number }
type AnnaLine = {
  who: 'anna'
  id: string
  text: string
  done: boolean
  at: number
  aligned: boolean
  sents: Sent[]
  requested: Set<number>
  terms: Term[]
  ask?: { state: 'loading' | 'done' | 'error'; text: string; at: number }
}
type YouLine = { who: 'you'; id: string; text: string }
type Line = AnnaLine | YouLine

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

/** Sentences of a text with their end positions; `complete` = ends with . ! ? */
function sentencesOf(text: string): { text: string; end: number; complete: boolean }[] {
  const out: { text: string; end: number; complete: boolean }[] = []
  const re = /[^.!?…]+[.!?…]+["”’)]*\s*|[^.!?…]+$/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const t = m[0].trim()
    if (t) out.push({ text: t, end: m.index + m[0].trimEnd().length, complete: /[.!?…]["”’)]*$/.test(t) })
  }
  return out
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
  const [left, setLeft] = useState(180)
  const [, setTick] = useState(0)
  const rerender = () => setTick((n) => n + 1)

  const lines = useRef<Line[]>([])
  const annaTalking = useRef(false)
  const micOpen = useRef(false)
  const level = useRef(0)
  const explained = useRef(new Set<string>())
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const micRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const tokenRef = useRef('')
  const endedRef = useRef(false)
  const targetRef = useRef('Spanish')
  targetRef.current = TRY_LANGS.find((l) => l.code === lang)?.en ?? 'Spanish'

  // Hang up and release the microphone (no state changes — safe on unmount).
  const teardown = () => {
    pcRef.current?.getSenders().forEach((s) => s.track?.stop())
    pcRef.current?.close()
    pcRef.current = null
    micRef.current?.getTracks().forEach((t) => t.stop())
    micRef.current = null
    void ctxRef.current?.close().catch(() => {})
    ctxRef.current = null
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.srcObject = null
    }
  }
  const stop = (next: 'ended' | 'error' = 'ended') => {
    if (endedRef.current) return
    endedRef.current = true
    teardown()
    annaTalking.current = false
    setPhase(next)
  }

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

  // While live: a frame clock (pacing, typing, mic meter) + the countdown.
  useEffect(() => {
    if (phase !== 'live') return
    let raf = 0
    const loop = () => {
      rerender()
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

  // Follow the conversation: stay pinned to the bottom while text types in,
  // unless the visitor scrolled up to reread (then follow again once they
  // come back near the bottom).
  const follow = useRef(true)
  useEffect(() => {
    const el = listRef.current
    if (el && follow.current && el.scrollHeight - el.clientHeight - el.scrollTop > 1) el.scrollTop = el.scrollHeight
  })

  const annaLine = (id: string): AnnaLine => {
    let l = lines.current.find((x) => x.id === id) as AnnaLine | undefined
    if (!l) {
      l = { who: 'anna', id, text: '', done: false, at: performance.now(), aligned: annaTalking.current, sents: [], requested: new Set(), terms: [] }
      lines.current = [...lines.current, l]
    }
    return l
  }

  // Translate every finished sentence right away (her text arrives before her
  // voice, so the translation is ready by the time she has said it).
  const translateReady = (l: AnnaLine) => {
    const parts = sentencesOf(l.text)
    l.sents = parts.map((p, i) => ({ ...(l.sents[i] ?? {}), text: p.text, end: p.end }))
    parts.forEach((p, i) => {
      if (l.requested.has(i) || (!p.complete && !l.done)) return
      l.requested.add(i)
      const text = p.text
      void call<{ translation: string | null; terms: Term[] }>({ action: 'translate', token: tokenRef.current, text, target: targetRef.current })
        .then((r) => {
          if (l.sents[i]) l.sents[i].tr = r.translation || text
          for (const t of r.terms ?? []) {
            const k = t.term.toLowerCase()
            if (explained.current.has(k) || l.terms.length >= 2) continue
            explained.current.add(k)
            l.terms.push(t)
          }
          rerender()
        })
        .catch(() => {
          if (l.sents[i]) l.sents[i].tr = null
        })
    })
  }

  const askAi = (l: AnnaLine) => {
    const question = sentencesOf(l.text).filter((p) => /\?/.test(p.text)).map((p) => p.text).join(' ') || l.text
    const context = lines.current
      .slice(-8)
      .map((x) => `${x.who === 'anna' ? 'Anna' : 'Me'}: ${x.text}`)
      .join('\n')
    l.ask = { state: 'loading', text: '', at: performance.now() }
    rerender()
    call<{ answer: string }>({ action: 'ask', token: tokenRef.current, text: question, context, target: targetRef.current })
      .then((r) => {
        l.ask = { state: 'done', text: r.answer, at: performance.now() }
        rerender()
      })
      .catch((e) => {
        l.ask = { state: 'error', text: (e as Error).message, at: performance.now() }
        rerender()
      })
  }

  const start = async () => {
    setError('')
    setPhase('connecting')
    endedRef.current = false
    lines.current = []
    explained.current.clear()
    try {
      // Auto gain on: laptop mics are quiet, and Anna must hear you clearly.
      micRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    } catch {
      setError(copy.micDenied)
      setPhase('error')
      return
    }
    // Live mic meter, so you see you're heard.
    try {
      const ctx = new AudioContext()
      ctxRef.current = ctx
      const an = ctx.createAnalyser()
      an.fftSize = 512
      ctx.createMediaStreamSource(micRef.current).connect(an)
      const buf = new Float32Array(an.fftSize)
      const read = () => {
        if (!ctxRef.current) return
        an.getFloatTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += v * v
        level.current = level.current * 0.7 + Math.sqrt(sum / buf.length) * 0.3
        requestAnimationFrame(read)
      }
      read()
    } catch {
      /* meter is optional */
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

      // Half-duplex: your mic is closed only while Anna's voice plays (so she
      // never hears herself through speakers), and always reopens shortly after.
      let reopen: ReturnType<typeof setTimeout> | null = null
      let safety: ReturnType<typeof setTimeout> | null = null
      const setMic = (on: boolean) => {
        micOpen.current = on
        mic.getAudioTracks().forEach((t) => (t.enabled = on))
      }
      const openSoon = (ms: number) => {
        if (reopen) clearTimeout(reopen)
        reopen = setTimeout(() => {
          if (safety) clearTimeout(safety)
          setMic(true)
        }, ms)
      }

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
          case 'output_audio_buffer.started': {
            if (reopen) clearTimeout(reopen)
            setMic(false)
            if (safety) clearTimeout(safety)
            safety = setTimeout(() => setMic(true), 30_000)
            annaTalking.current = true
            // Her words start appearing when her voice starts.
            const last = [...lines.current].reverse().find((x) => x.who === 'anna') as AnnaLine | undefined
            if (last && !last.aligned) {
              last.at = performance.now()
              last.aligned = true
            }
            break
          }
          case 'output_audio_buffer.stopped':
          case 'output_audio_buffer.cleared':
            annaTalking.current = false
            openSoon(500)
            break
          case 'response.done':
            // Backup in case the "stopped" event goes missing.
            openSoon(2500)
            break
          case 'response.output_audio_transcript.delta':
            if (m.item_id && m.delta) {
              const l = annaLine(m.item_id)
              l.text += m.delta
              translateReady(l)
            }
            break
          case 'response.output_audio_transcript.done':
            if (m.item_id && m.transcript) {
              const l = annaLine(m.item_id)
              l.text = m.transcript
              l.done = true
              translateReady(l)
            }
            break
          case 'input_audio_buffer.speech_started':
            if (m.item_id && !lines.current.some((x) => x.id === m.item_id)) {
              lines.current = [...lines.current, { who: 'you', id: m.item_id, text: '' }]
            }
            break
          case 'conversation.item.input_audio_transcription.completed':
            if (m.item_id) {
              const l = lines.current.find((x) => x.id === m.item_id) as YouLine | undefined
              const text = (m.transcript ?? '').trim()
              if (l) l.text = text || '…'
              else if (text) lines.current = [...lines.current, { who: 'you', id: m.item_id, text }]
            }
            break
        }
        rerender()
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
  const rtl = lang === 'ar' || lang === 'ur'

  // How much of Anna's line is "said": her pace, or all of it once she's done.
  const said = (l: AnnaLine) => (l.done && !annaTalking.current ? l.text.length : Math.min(l.text.length, Math.floor((now - l.at) * EN_CPS)))

  // The translation types in under her words, in step with them: sentence by
  // sentence, as far into its translation as she is into the English
  // sentence (the translation is ready early — her text arrives before her
  // voice — so it truly runs alongside, like live).
  const trOf = (l: AnnaLine): string => {
    const n = said(l)
    let out = ''
    let start = 0
    for (const p of l.sents) {
      if (!p.tr) break
      const len = Math.max(1, p.end - start)
      const frac = Math.min(1, Math.max(0, (n - start) / len))
      const k = Math.ceil(frac * p.tr.length)
      if (k > 0) out += (out ? ' ' : '') + p.tr.slice(0, k)
      if (frac < 1) break
      start = p.end
    }
    return out
  }

  const bars = Math.min(5, Math.round(level.current * 120))

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
            style={{ boxShadow: annaTalking.current ? '0 0 0 3px rgba(34,197,94,.55), 0 0 0 8px rgba(34,197,94,.15)' : 'none', transition: 'box-shadow .4s ease' }}
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

        {phase === 'live' && (
          <>
            <div
              ref={listRef}
              onScroll={(e) => {
                const el = e.currentTarget
                follow.current = el.scrollHeight - el.clientHeight - el.scrollTop < 60
              }}
              className="min-h-[300px] flex-1 space-y-4 overflow-y-auto px-5 py-4"
            >
              {lines.current.length === 0 && <p className="py-10 text-center text-[14px] text-t-3">{copy.waitAnna}</p>}
              {lines.current.map((l) => {
                if (l.who === 'you') {
                  return (
                    <div key={l.id} className="animate-rise text-right">
                      <div className="text-[10.5px] font-semibold uppercase tracking-[.14em] text-[#9DB7FF]/80">{copy.you}</div>
                      <div className="mt-0.5 inline-block rounded-2xl bg-white/[.06] px-3 py-1.5 text-left text-[14px] text-t-2">
                        {l.text || <span className="inline-flex gap-1 py-1">{[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#9DB7FF]" style={{ animationDelay: `${d * 150}ms` }} />)}</span>}
                      </div>
                    </div>
                  )
                }
                const n = said(l)
                const tr = trOf(l)
                const full = n >= l.text.length && l.text.length > 0
                const isQuestion = /\?/.test(l.text)
                return (
                  <div key={l.id} className="animate-rise">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[10.5px] font-semibold uppercase tracking-[.14em] text-accent-pale">Anna</div>
                        <div className="mt-0.5 text-[15px] font-medium leading-snug text-t-1">{l.text.slice(0, n)}</div>
                        {tr && (
                          <div dir={rtl ? 'rtl' : 'ltr'} className="mt-1 text-[14.5px] leading-snug text-[#8FD8F7]">
                            {tr}
                          </div>
                        )}
                      </div>
                      {isQuestion && full && !l.ask && (
                        <button
                          onClick={() => askAi(l)}
                          className="mt-4 flex flex-none animate-rise items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_3px_14px_rgba(255,106,61,.5)] hover:brightness-110 active:scale-95"
                        >
                          <Icon name="sparkles" className="h-3.5 w-3.5" /> {copy.ask ?? 'Ask AI'}
                        </button>
                      )}
                    </div>
                    {full &&
                      l.terms.map((t) => (
                        <div key={t.term} className="mt-1.5 animate-rise rounded-lg border border-[#F5A524]/25 bg-[#F5A524]/[.07] px-2.5 py-1.5 text-[12.5px] text-t-2">
                          <b className="text-[#F5A524]">{t.term}</b> — {t.explanation}
                        </div>
                      ))}
                    {l.ask && (
                      <div className="mt-2 animate-rise rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-[13px] leading-relaxed text-t-1">
                        <div className="mb-0.5 flex items-center gap-1.5 text-[12px] font-semibold text-accent-hi">
                          <Icon name="sparkles" className="h-3.5 w-3.5" /> {copy.ask ?? 'Ask AI'}
                        </div>
                        {l.ask.state === 'loading' ? (
                          <span className="inline-flex items-center gap-1 py-1 text-t-3">
                            {[0, 1, 2].map((d) => (
                              <span key={d} className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-hi" style={{ animationDelay: `${d * 150}ms` }} />
                            ))}
                          </span>
                        ) : (
                          <span dir={rtl ? 'rtl' : 'ltr'} className="whitespace-pre-line">
                            {l.ask.text.slice(0, Math.floor((now - l.ask.at) * AI_CPS))}
                            <span className="invisible">{l.ask.text.slice(Math.floor((now - l.ask.at) * AI_CPS))}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="flex items-center gap-3 border-t border-white/[.07] px-5 py-3.5">
              <span className="flex flex-1 items-center gap-2 text-[12.5px] text-t-3">
                {/* Mic meter: shows that Anna hears you */}
                <span className="flex h-4 items-end gap-[2px]" aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className="w-[3px] rounded-full transition-all duration-100"
                      style={{ height: `${30 + i * 15}%`, background: micOpen.current && i < bars ? '#22C55E' : 'rgba(255,255,255,.15)' }}
                    />
                  ))}
                </span>
                {annaTalking.current ? 'Anna…' : micOpen.current && bars > 1 ? copy.hearing ?? 'Listening to you…' : copy.live}
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
