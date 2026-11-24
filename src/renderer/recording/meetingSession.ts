import { create } from 'zustand'
import { invoke } from '../lib/ipc'
import {
  ApiError,
  enhanceNotes,
  startMeeting,
  liveSession,
  suggestReply,
  transcribeChunk,
  translateLineStream,
  askAiStream,
  type EnhancedNotes,
  type StartMeetingResult
} from '../lib/api'
import { ChannelRecorder, type AudioChunk } from './ChannelRecorder'
import { EchoGate, LiveTranscriber } from './LiveTranscriber'
import { track } from '../lib/track'

// =============================================================================
// Meeting session — the whole live flow, owned by the main window renderer so
// it survives page navigation and keeps running while the window is hidden.
//
//   start():  /meeting-start (quota) → mic + system loopback → 2 recorders
//   chunk  :  every CHUNK_MS per channel → upload queue → live transcript
//   stop() :  flush last chunks → wait for queue → /enhance-notes → saved
//
// Main process mirrors the state (tray, overlay, hotkey) via recording:report.
// =============================================================================

const CHUNK_MS = 20_000
/** The client's channel is split on speech pauses; this is only the upper bound. */
const THEM_MAX_CHUNK_MS = 15_000
const UPLOAD_CONCURRENCY = 2
const MAX_RETRIES = 4

export type SessionStatus = 'idle' | 'starting' | 'recording' | 'paused' | 'finishing' | 'enhancing'

export interface LiveSegment {
  speaker: 'me' | 'them'
  startMs: number
  endMs: number
  text: string
  /** Live-transcribed client line: its id and translation into the user's language. */
  id?: string
  translation?: string | null
}

/** A line of live captions (the client), with its translation. */
export interface LiveLine {
  id: string
  speaker: 'me' | 'them'
  text: string
  translation: string | null
  final: boolean
  /** Client lines: each finished sentence with its own translation (never
   *  rewritten), plus the sentence still being spoken (translation null). */
  parts?: { text: string; translation: string | null; live?: boolean }[]
}

interface SessionState {
  status: SessionStatus
  /** Local SQLite meeting id of the active (or last finished) session. */
  meetingId: string | null
  serverId: string | null
  templateId: string
  userNotes: string
  segments: LiveSegment[]
  pendingUploads: number
  systemAudio: boolean
  error: string | null
  /** Set when the plan limit stopped or blocked a meeting. */
  upgradeNeeded: boolean
  limits: StartMeetingResult['limits'] | null
  enhanced: EnhancedNotes | null
  /** Live question cards (newest first). */
  hints: QuestionCard[]
  /** Set when the plan's card quota for this meeting is used up. */
  hintsNote: string | null
  /** What the user pasted about this call: job post, proposal, stack. */
  callContext: string
  /** Live captions of the client (latest last). */
  live: LiveLine[]
  liveStatus: 'off' | 'connecting' | 'live' | 'failed'
}

/** A question the client asked, with translation and a term explanation. */
export interface QuestionCard {
  id: string
  question: string
  translation: string | null
  term: string | null
  termExplanation: string | null
  /** Points to mention — only when "Suggest what to answer" is on. */
  answer: string | null
  at: number
  /** From the end of the client's sentence to the card on screen. */
  latencyMs: number | null
  answered: boolean
}
/** @deprecated old name */
export type ReplyHint = QuestionCard

export const useMeetingSession = create<SessionState>(() => ({
  status: 'idle',
  meetingId: null,
  serverId: null,
  templateId: 'general',
  userNotes: '',
  segments: [],
  pendingUploads: 0,
  systemAudio: false,
  error: null,
  upgradeNeeded: false,
  limits: null,
  enhanced: null,
  hints: [],
  hintsNote: null,
  callContext: '',
  live: [],
  liveStatus: 'off'
}))

const set = useMeetingSession.setState
const get = useMeetingSession.getState

// ─── Active timeline (excludes paused time) ─────────────────────────────────
let activeBaseMs = 0
let activeSince: number | null = null
function timeline(): number {
  return activeBaseMs + (activeSince !== null ? performance.now() - activeSince : 0)
}

// ─── Live resources ─────────────────────────────────────────────────────────
let recorders: { me?: ChannelRecorder; them?: ChannelRecorder } = {}
let streams: MediaStream[] = []

function report(): void {
  const { status, meetingId } = get()
  const recording = status === 'recording' || status === 'paused'
  void invoke('recording:report', {
    recording,
    paused: status === 'paused',
    durationMs: Math.round(timeline()),
    meetingId
  }).catch(() => {})
}

// ─── Upload queue ───────────────────────────────────────────────────────────
type Job = { channel: 'me' | 'them'; chunk: AudioChunk; attempt: number }
const queue: Job[] = []
let running = 0
let drainWaiters: (() => void)[] = []

function updatePending(): void {
  set({ pendingUploads: queue.length + running })
  if (queue.length === 0 && running === 0) {
    const w = drainWaiters
    drainWaiters = []
    w.forEach((r) => r())
  }
}

function waitForDrain(): Promise<void> {
  if (queue.length === 0 && running === 0) return Promise.resolve()
  return new Promise((r) => drainWaiters.push(r))
}

function enqueue(channel: 'me' | 'them', chunk: AudioChunk): void {
  if (ChannelRecorder.isSilent(chunk)) {
    console.log(`[session] skip silent ${channel} chunk @${Math.round(chunk.startMs / 1000)}s`)
    return
  }
  queue.push({ channel, chunk, attempt: 0 })
  updatePending()
  pump()
}

function pump(): void {
  while (running < UPLOAD_CONCURRENCY && queue.length) {
    const job = queue.shift()!
    running++
    updatePending()
    void runJob(job).finally(() => {
      running--
      updatePending()
      pump()
    })
  }
}

// ─── Transcript de-duplication ─────────────────────────────────────────────
// With speakers (no headphones) the microphone also hears the other side, so
// the same words arrive on both channels. The system channel is the clean
// source for "them": a mic segment that mostly repeats an overlapping system
// segment is dropped. Also guards against a chunk repeating the previous one.
const DUP_WINDOW_MS = 25_000
const CROSS_DUP = 0.6
const SELF_DUP = 0.9

function wordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1)
  )
}

function similarity(a: string, b: string): number {
  const A = wordSet(a)
  const B = wordSet(b)
  if (!A.size || !B.size) return 0
  let common = 0
  A.forEach((w) => {
    if (B.has(w)) common++
  })
  return common / Math.min(A.size, B.size)
}

function near(a: LiveSegment, b: LiveSegment): boolean {
  return Math.abs(a.startMs - b.startMs) <= DUP_WINDOW_MS
}

/** Add a segment unless it duplicates existing text. Returns false if dropped. */
function addSegment(seg: LiveSegment): boolean {
  const current = get().segments
  const sameChannelDup = current.some(
    (s) =>
      s.speaker === seg.speaker &&
      near(s, seg) &&
      Math.min(wordSet(s.text).size, wordSet(seg.text).size) >= 4 &&
      similarity(s.text, seg.text) >= SELF_DUP
  )
  if (sameChannelDup) {
    console.log(`[session] drop repeated ${seg.speaker} chunk @${seg.startMs}`)
    return false
  }
  if (seg.speaker === 'me') {
    const echo = current.some(
      (s) => s.speaker === 'them' && near(s, seg) && similarity(s.text, seg.text) >= CROSS_DUP
    )
    if (echo) {
      console.log(`[session] drop mic echo of system audio @${seg.startMs}`)
      return false
    }
    set({ segments: [...current, seg].sort((a, b) => a.startMs - b.startMs) })
    return true
  }
  // System segment: remove mic segments that were just an echo of it.
  const kept = current.filter(
    (s) => !(s.speaker === 'me' && near(s, seg) && similarity(s.text, seg.text) >= CROSS_DUP)
  )
  if (kept.length !== current.length) console.log(`[session] removed mic echo @${seg.startMs}`)
  set({ segments: [...kept, seg].sort((a, b) => a.startMs - b.startMs) })
  return true
}

async function runJob(job: Job): Promise<void> {
  const { serverId, meetingId } = get()
  if (!serverId || !meetingId) return
  try {
    // No "prompt" with previous text: gpt-4o-*-transcribe tends to echo it
    // back, which duplicated whole chunks in testing.
    // While live captions run, the client's text comes from them: this chunk
    // only meters the seconds (no second transcription of the same audio).
    const countOnly = job.channel === 'them' ? get().liveStatus === 'live' : meLiveOk
    const text = await transcribeChunk({
      meetingId: serverId,
      language: lockedLanguage(job.channel),
      channel: job.channel,
      blob: job.chunk.blob,
      durationSec: job.chunk.durationMs / 1000,
      countOnly
    })
    if (countOnly || !text.trim()) return
    const seg: LiveSegment = {
      speaker: job.channel,
      startMs: Math.round(job.chunk.startMs),
      endMs: Math.round(job.chunk.startMs + job.chunk.durationMs),
      text: text.trim()
    }
    if (!addSegment(seg)) return
    if (seg.speaker === 'them') {
      const tx = Date.now() - job.chunk.heardAt
      console.log(`[latency] them chunk ${Math.round(job.chunk.durationMs)}ms → text after ${tx}ms`)
      if (looksLikeQuestion(seg.text)) scheduleHint(job.chunk.heardAt)
    }
    await invoke('notes:appendSegment', {
      meetingId,
      speaker: seg.speaker === 'me' ? 'Me' : 'Them',
      startMs: seg.startMs,
      endMs: seg.endMs,
      text: seg.text
    })
  } catch (err) {
    const e = err instanceof ApiError ? err : new ApiError(0, 'unknown', (err as Error).message)
    if (e.isPlanLimit) {
      set({ error: e.message, upgradeNeeded: true })
      // Recording past the plan limit is pointless — stop and enhance what we have.
      if (get().status === 'recording' || get().status === 'paused') void stopMeeting()
      return
    }
    if (e.isRetryable && job.attempt < MAX_RETRIES) {
      const delay = 1000 * 2 ** job.attempt
      console.warn(`[session] retry ${job.channel} chunk in ${delay}ms:`, e.message)
      await new Promise((r) => setTimeout(r, delay))
      queue.unshift({ ...job, attempt: job.attempt + 1 })
      return
    }
    console.error('[session] chunk failed permanently', e)
    set({ error: 'Part of the transcript could not be processed.' })
  }
}

// ─── Capture ────────────────────────────────────────────────────────────────
async function getMic(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    // autoGainControl is OFF on purpose: Chromium's AGC changes the Windows
    // microphone volume itself, for every app. During a call that fought the
    // call app's own gain/echo control (Zoom, Meet, Teams…), and the other side
    // started to hear themselves. We only read the mic; the call app owns it.
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    video: false
  })
}

/**
 * System audio via Electron loopback (see setDisplayMediaRequestHandler).
 * Returns the audio-only stream to record plus the full capture stream, which
 * must stay alive: on Windows the loopback audio belongs to the screen
 * capture session, and stopping the video track ended/silenced the audio in
 * testing. The video runs at 1 fps / tiny size and is never recorded.
 */
async function getSystemAudio(): Promise<{ audio: MediaStream; capture: MediaStream } | null> {
  try {
    const capture = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1, width: 320, height: 180 },
      // Voice processing is for microphones; on loopback it only degrades
      // the remote speakers' audio.
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    })
    const tracks = capture.getAudioTracks()
    if (tracks.length === 0) {
      console.warn('[session] loopback returned no audio track')
      capture.getTracks().forEach((t) => t.stop())
      return null
    }
    const t = tracks[0]
    console.log('[session] loopback audio track', t.label, t.readyState, JSON.stringify(t.getSettings()))
    t.addEventListener('ended', () => console.warn('[session] loopback audio track ended'))
    t.addEventListener('mute', () => console.warn('[session] loopback audio track muted'))
    return { audio: new MediaStream(tracks), capture }
  } catch (err) {
    console.warn('[session] system audio unavailable', err)
    return null
  }
}

// ─── Live reply hints ───────────────────────────────────────────────────────
// When the other side asks something, ask the server for a short reply the
// user could say. Shown in the live notes sidebar and in the floating capsule.

const QUESTION_WORDS =
  /^(what|how|when|where|why|who|which|can|could|would|will|do|does|did|are|is|should|have|has|як|що|коли|де|чому|хто|чи|скільки|який|яка|які|можете|можна|как|что|когда|где|почему|кто|сколько|какой|можете|можно|wie|was|wann|wo|warum|wer|können|kannst|haben|ist|sind)\b/i

function looksLikeQuestion(text: string): boolean {
  const t = text.trim()
  if (t.includes('?')) return true
  // Check each sentence start — transcripts often drop the question mark.
  return t.split(/[.!]\s+/).some((sentence) => QUESTION_WORDS.test(sentence.trim()))
}

let hintsEnabled = true
/** ISO code chosen in Settings ('' = detect automatically). */

/** ISO code → language name for the notes prompt. */
export const MEETING_LANGUAGES: { code: string; name: string }[] = [
  { code: '', name: 'Auto — same as the conversation' },
  { code: 'uk', name: 'Українська' },
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'ru', name: 'Русский' },
  { code: 'pl', name: 'Polski' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
  { code: 'hi', name: 'हिन्दी (Hindi)' },
  { code: 'bn', name: 'বাংলা (Bengali)' },
  { code: 'ur', name: 'اردو (Urdu)' },
  { code: 'tl', name: 'Filipino' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'ar', name: 'العربية (Arabic)' },
  { code: 'ro', name: 'Română' }
]
/** Settings value → language name for /enhance-notes (undefined = auto-detect). */
export function notesLanguageName(code: string | null | undefined): string | undefined {
  return code ? LANGUAGE_NAMES[code] : undefined
}

/** Notes are written in your language; the follow-up email in the client's. */
export async function notesLanguages(): Promise<{ language?: string; clientLanguage?: string }> {
  const all = await invoke<{ nativeLanguage?: string; clientLanguage?: string }>('settings:getAll').catch(() => null)
  const raw = (all?.nativeLanguage || navigator.language || 'en').toLowerCase()
  const code = raw.startsWith('fil') ? 'tl' : raw.slice(0, 2)
  return { language: notesLanguageName(code), clientLanguage: notesLanguageName(all?.clientLanguage || 'en') }
}
const LANGUAGE_NAMES: Record<string, string> = {
  uk: 'Ukrainian', en: 'English', de: 'German', ru: 'Russian', pl: 'Polish',
  es: 'Spanish', fr: 'French', it: 'Italian', pt: 'Portuguese', hi: 'Hindi', bn: 'Bengali',
  ur: 'Urdu', tl: 'Filipino', id: 'Indonesian', vi: 'Vietnamese', tr: 'Turkish', ar: 'Arabic', ro: 'Romanian'
}
let hintInFlight = false
/** heardAt of a question that arrived while a card request was in flight. */
let pendingHeardAt: number | null = null
let answerHints = false
let nativeLanguage = ''
let aboutMe = ''
/** Language the client speaks (Settings → Agent → "Client speaks"). */
let clientLanguage = 'en'
/** Language you speak on calls ('' = same as the client). */
let myCallLanguage = ''

/** Language name for the cards ('' → the app's / Windows language). */
export function nativeLanguageName(code: string | null | undefined): string {
  const raw = (code || navigator.language || 'en').toLowerCase()
  const c = raw.startsWith('fil') ? 'tl' : raw.slice(0, 2)
  return LANGUAGE_NAMES[c] ?? 'English'
}

function scheduleHint(heardAt: number): void {
  if (!hintsEnabled || get().hintsNote) return
  if (hintInFlight) {
    pendingHeardAt = heardAt
    return
  }
  void requestHint(false, heardAt)
}

function cardToCapsule(c: QuestionCard) {
  return {
    id: c.id,
    question: c.question,
    answer: c.answer ?? '',
    translation: c.translation,
    term: c.term,
    termExplanation: c.termExplanation,
    latencyMs: c.latencyMs,
    total: get().hints.length,
    open: get().hints.filter((h) => !h.answered).length
  }
}

/**
 * "What was the last question?" from the capsule: show the latest card again,
 * or ask the server right now. Returns false when there is nothing to show.
 */
export async function hintNow(): Promise<boolean> {
  const latest = get().hints[0]
  if (latest && Date.now() - latest.at < 5 * 60_000) {
    await invoke('capsule:hint', cardToCapsule(latest)).catch(() => {})
    return true
  }
  if (!get().segments.some((sg) => sg.speaker === 'them')) return false
  const before = get().hints.length
  await requestHint(true, null)
  return get().hints.length > before
}

/** Mark a question as answered (or not) — open ones are listed before the call ends. */
export function setCardAnswered(id: string, answered = true): void {
  set({ hints: get().hints.map((h) => (h.id === id ? { ...h, answered } : h)) })
}

/** Meeting the current call context belongs to (a new call starts empty). */
let contextOwner: string | null = null

export function setCallContext(text: string): void {
  set({ callContext: text.slice(0, 6000) })
}

function contextForAI(): string {
  return [aboutMe && `About me: ${aboutMe}`, get().callContext && `About this call: ${get().callContext}`]
    .filter(Boolean)
    .join('\n\n')
}

async function requestHint(force: boolean, heardAt: number | null): Promise<void> {
  const { serverId, segments, userNotes, status } = get()
  if (!serverId || (status !== 'recording' && status !== 'paused')) return
  if (hintInFlight) return
  hintInFlight = true
  const t0 = Date.now()
  try {
    const res = await suggestReply({
      meetingId: serverId,
      transcript: [
        ...segments.slice(-30).map(({ speaker, text }) => ({ speaker, text })),
        ...(livePartial() ? [{ speaker: 'them' as const, text: livePartial() }] : [])
      ],
      userNotes,
      nativeLanguage: nativeLanguageName(nativeLanguage),
      context: contextForAI(),
      answerHint: answerHints
    })
    if (!res.question) {
      if (force) void invoke('capsule:notice', 'No open question from them yet').catch(() => {})
      return
    }
    // Same question again (it was split over two chunks, or re-detected)?
    const dup = get().hints.find((h) => Date.now() - h.at < 90_000 && similarity(h.question, res.question!) >= 0.75)
    if (dup && !force) return
    const latencyMs = heardAt ? Date.now() - heardAt : null
    console.log(`[latency] card: request ${Date.now() - t0}ms (ai ${res.aiMs ?? '?'}ms), end-to-end ${latencyMs ?? '-'}ms`)
    const card: QuestionCard = {
      id: String(Date.now()),
      question: res.question,
      translation: res.translation ?? null,
      term: res.term ?? null,
      termExplanation: res.termExplanation ?? null,
      answer: res.answer ?? null,
      at: Date.now(),
      latencyMs,
      answered: false
    }
    set({ hints: [card, ...get().hints].slice(0, 40) })
    track('card_shown', {
      latencyMs,
      requestMs: Date.now() - t0,
      aiMs: res.aiMs ?? null,
      translated: Boolean(card.translation),
      term: Boolean(card.term)
    })
    await invoke('capsule:hint', cardToCapsule(card)).catch(() => {})
  } catch (err) {
    if (err instanceof ApiError && err.isPlanLimit) set({ hintsNote: err.message })
    else console.warn('[session] question card failed', (err as Error).message)
  } finally {
    hintInFlight = false
    const next = pendingHeardAt
    pendingHeardAt = null
  if (contextOwner !== null) {
    set({ callContext: '' })
    contextOwner = null
  }
    if (next !== null) void requestHint(false, next)
  }
}

// ─── Live captions (both channels) ─────────────────────────────────────────
// The client (system audio) and you (microphone) each stream to live
// transcription. Every line is labelled; the client's lines are translated
// and drive the question cards. Languages are fixed per channel (Settings:
// "Client speaks" / your language) and lines in an unexpected alphabet are
// dropped — the recognizer sometimes "hears" Chinese in noise.
const transcribers: { them?: LiveTranscriber; me?: LiveTranscriber } = {}
const liveStartMs = new Map<string, number>()
const processedSentences = new Map<string, number>() // itemId → sentences handled
let capsuleTimer: ReturnType<typeof setTimeout> | null = null
let meLiveOk = false
/** The client was speaking until this moment: mic text then is their echo. */
let themActiveUntil = 0
const recentThem: { at: number; text: string }[] = []

function livePartial(): string {
  return get()
    .live.filter((l) => !l.final && l.speaker === 'them')
    .map((l) => l.text)
    .join(' ')
}

function myLanguageCode(): string {
  const raw = (nativeLanguage || navigator.language || 'en').toLowerCase()
  return raw.startsWith('fil') ? 'tl' : raw.slice(0, 2)
}

/** Fixed language per channel: client = "The client speaks", you = "You speak on calls". */
function channelLanguage(channel: 'me' | 'them'): string {
  // You usually speak the call language too (not your native one).
  return channel === 'them' ? clientLanguage || 'en' : myCallLanguage || clientLanguage || 'en'
}

/** Product names, stack and acronyms from "About you" / "About this call" — hints for the recognizer. */
function liveKeywords(): string[] {
  const text = `${aboutMe}\n${get().callContext}`
  const found = text.match(/\b(?:[A-Z][A-Za-z0-9]*[A-Z0-9][A-Za-z0-9]*|[A-Z][a-z]+(?:\.[a-z]+)+|[a-z]+\.(?:js|io|ai|ts))\b/g) ?? []
  return Array.from(new Set(found)).slice(0, 40)
}

/** Chunk transcription uses the same fixed language as live. */
function lockedLanguage(channel: 'me' | 'them'): string | undefined {
  return channelLanguage(channel)
}

const SCRIPTS: Record<string, RegExp> = {
  latin: /[A-Za-zÀ-ÖØ-öø-ÿĀ-ž]/g,
  cyrillic: /[Ѐ-ӿ]/g,
  devanagari: /[ऀ-ॿ]/g,
  bengali: /[ঀ-৿]/g,
  arabic: /[؀-ۿ]/g,
  cjk: /[぀-ヿ㐀-鿿가-힯]/g
}
function scriptOf(lang: string): string {
  if (['uk', 'ru'].includes(lang)) return 'cyrillic'
  if (lang === 'hi') return 'devanagari'
  if (lang === 'bn') return 'bengali'
  if (['ar', 'ur'].includes(lang)) return 'arabic'
  if (['zh', 'ja', 'ko'].includes(lang)) return 'cjk'
  return 'latin'
}
/** True when most letters are in the expected alphabet for this channel. */
function inExpectedScript(text: string, channel: 'me' | 'them'): boolean {
  const allowed = new Set([scriptOf(channelLanguage(channel)), 'latin']) // names and terms are often Latin
  let good = 0
  let bad = 0
  for (const [name, re] of Object.entries(SCRIPTS)) {
    const n = (text.match(re) ?? []).length
    if (allowed.has(name)) good += n
    else bad += n
  }
  return bad === 0 || bad < good * 0.2
}

function sentencesOf(text: string, final: boolean): string[] {
  const parts = text.split(/(?<=[.!?…])\s+/).map((x) => x.trim()).filter(Boolean)
  if (!final && parts.length && !/[.!?…]$/.test(parts[parts.length - 1])) parts.pop()
  return parts
}

/** Skip the translation call when the line is obviously already in the user's language. */
function needsTranslation(sentence: string): boolean {
  const target = myLanguageCode()
  const cyr = /[А-Яа-яІіЇїЄєҐґЁё]/.test(sentence)
  if ((target === 'uk' || target === 'ru') && cyr) return false
  if (target === 'en' && !cyr && !/[^ -~’‘“”–—…]/.test(sentence)) return false
  return sentence.split(/\s+/).length >= 2
}

function upsertLive(id: string, speaker: 'me' | 'them', patch: Partial<LiveLine>): void {
  const lines = get().live
  const i = lines.findIndex((l) => l.id === id)
  const next =
    i >= 0
      ? lines.map((l, j) => (j === i ? { ...l, ...patch } : l))
      : [...lines, { id, speaker, text: '', translation: null, final: false, ...patch }]
  set({ live: next.slice(-16) })
  pushLiveToCapsule()
}

function removeLive(id: string): void {
  set({ live: get().live.filter((l) => l.id !== id) })
  pushLiveToCapsule()
}

// --- "Ask AI" mini chat in the capsule ---------------------------------------
// The user hovers a caption line and asks AI about it; follow-ups continue the
// same little chat. State lives here (the session has the meeting + token) and
// is mirrored into the capsule with capsule:askState.

interface AskState {
  line: string
  messages: { role: 'user' | 'assistant'; text: string }[]
  status: 'thinking' | 'answering' | 'done' | 'failed'
  error: string | null
}
let ask: AskState | null = null
let askCtrl: AbortController | null = null
let askPushTimer: ReturnType<typeof setTimeout> | null = null

function pushAsk(now = false): void {
  const send = () => {
    askPushTimer = null
    void invoke('capsule:askState', ask).catch(() => {})
  }
  if (now) {
    if (askPushTimer) clearTimeout(askPushTimer)
    send()
  } else if (!askPushTimer) askPushTimer = setTimeout(send, 60)
}

export function closeAsk(): void {
  askCtrl?.abort()
  askCtrl = null
  ask = null
}

/** Start a new chat about `line`, or add a follow-up question to the open one. */
export async function askAi(input: { line?: string; followUp?: string }): Promise<void> {
  const { serverId, status } = get()
  if (input.line) {
    askCtrl?.abort()
    ask = { line: input.line, messages: [], status: 'thinking', error: null }
  } else if (input.followUp && ask) {
    if (ask.status === 'thinking' || ask.status === 'answering') return
    ask = { ...ask, messages: [...ask.messages, { role: 'user', text: input.followUp }], status: 'thinking', error: null }
  } else return
  pushAsk(true)
  if (!serverId || (status !== 'recording' && status !== 'paused')) {
    ask = { ...ask, status: 'failed', error: 'Start a call recording to ask AI.' }
    pushAsk(true)
    return
  }

  const ctrl = new AbortController()
  askCtrl = ctrl
  const history = ask.messages
  const transcript = [
    ...get().segments.slice(-30).map((g) => ({ speaker: g.speaker, text: g.text })),
    ...get().live.filter((l) => !l.final).map((l) => ({ speaker: l.speaker, text: l.text }))
  ]
  track('ask_ai', { followUp: Boolean(input.followUp) })
  const t0 = performance.now()
  try {
    const answer = await askAiStream(
      {
        meetingId: serverId,
        line: ask.line,
        transcript,
        messages: history,
        nativeLanguage: nativeLanguageName(nativeLanguage),
        context: contextForAI()
      },
      (soFar) => {
        if (ctrl.signal.aborted || !ask) return
        const msgs = [...history, { role: 'assistant' as const, text: soFar }]
        ask = { ...ask, messages: msgs, status: 'answering' }
        pushAsk()
      },
      ctrl.signal
    )
    if (ctrl.signal.aborted || !ask) return
    ask = { ...ask, messages: [...history, { role: 'assistant', text: answer || 'No answer.' }], status: 'done' }
    pushAsk(true)
    console.log('[ask-ai] answered in', Math.round(performance.now() - t0), 'ms')
  } catch (err) {
    if (ctrl.signal.aborted || (err as Error).name === 'AbortError' || !ask) return
    ask = { ...ask, messages: history, status: 'failed', error: (err as Error).message || 'AI could not answer right now.' }
    pushAsk(true)
  }
}

function pushLiveToCapsule(): void {
  if (capsuleTimer) return
  capsuleTimer = setTimeout(() => {
    capsuleTimer = null
    const lines = get()
      .live.slice(-10)
      .map(({ id, speaker, text, translation, final, parts }) => ({ id, speaker, text, translation, final, parts }))
    void invoke('capsule:live', { lines, status: get().liveStatus }).catch(() => {})
  }, 80)
}

// Translation runs sentence by sentence while the client speaks: as soon as a
// sentence ends it is translated ONCE and never rewritten, so the translation
// only grows (no jumping text). Very short sentences ("Okay.") join the next
// one; a long sentence with no end yet is cut at a comma. The sentence still
// being spoken is shown as text only until it ends.
interface Unit {
  src: string
  tr: string | null
  ctrl: AbortController | null
}
interface ItemUnits {
  units: Unit[]
  /** Character offset in the item text where the next unit starts. */
  cut: number
  text: string
}
const itemUnits = new Map<string, ItemUnits>()
/** Translation speed in this call: request → first words / full sentence (ms). */
const trLatency = { first: [] as number[], done: [] as number[] }
const median = (xs: number[]) => (xs.length ? Math.round([...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]) : null)
const itemTranslation = new Map<string, string>()
const MIN_UNIT_WORDS = 4
// A long sentence is translated in parts: cut at a comma once 9+ words are
// waiting (with 5+ before the comma), so the first half doesn't wait for the end.
const CLAUSE_CUT_WORDS = 9
const CLAUSE_MIN_WORDS = 5

const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** Cut finished units off `rest`; returns [units, consumed chars]. */
function splitUnits(rest: string, final: boolean): [string[], number] {
  const out: string[] = []
  let pos = 0
  for (;;) {
    const tail = rest.slice(pos)
    if (!tail.trim()) break
    // Sentence ends (followed by a space or at the end of the text so far —
    // the recognizer streams punctuation with the last word).
    const ends: number[] = []
    const re = /[.!?…]+(?=\s|$)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(tail))) ends.push(m.index + m[0].length)
    let take = -1
    for (const end of ends) {
      if (wordCount(tail.slice(0, end)) >= MIN_UNIT_WORDS) {
        take = end
        break
      }
    }
    if (take < 0 && !final && wordCount(tail) >= CLAUSE_CUT_WORDS) {
      // A long sentence still going: cut at the last comma after 6+ words.
      const comma = tail.lastIndexOf(', ')
      if (comma > 0 && wordCount(tail.slice(0, comma)) >= CLAUSE_MIN_WORDS) take = comma + 1
    }
    if (take < 0) {
      if (final) take = tail.length
      else break
    }
    const unit = tail.slice(0, take).trim()
    if (unit) out.push(unit)
    pos += take
    while (pos < rest.length && /\s/.test(rest[pos])) pos++
  }
  return [out, pos]
}

function publishUnits(itemId: string): void {
  const st = itemUnits.get(itemId)
  if (!st) return
  const tail = st.text.slice(st.cut).trim()
  const parts = [
    ...st.units.map((u) => ({ text: u.src, translation: u.tr })),
    ...(tail ? [{ text: tail, translation: null, live: true }] : [])
  ]
  const joined = st.units.map((u) => u.tr ?? '').filter(Boolean).join(' ')
  const translation = joined || null
  if (translation) itemTranslation.set(itemId, translation)
  if (get().live.some((l) => l.id === itemId)) upsertLive(itemId, 'them', { parts, translation })
  if (translation && get().segments.some((sg) => sg.id === itemId)) {
    set({ segments: get().segments.map((sg) => (sg.id === itemId ? { ...sg, translation } : sg)) })
  }
}

function translateUnit(itemId: string, unit: Unit): void {
  const serverId = get().serverId
  if (!serverId || !needsTranslation(unit.src)) return
  const st = itemUnits.get(itemId)
  const idx = st ? st.units.indexOf(unit) : -1
  // Context: the two sentences before (this line or the previous client line).
  const before = st && idx > 0 ? st.units.slice(Math.max(0, idx - 2), idx).map((u) => u.src) : []
  const prevLine =
    before.length > 0
      ? before.join(' ')
      : get()
          .live.filter((l) => l.speaker === 'them' && l.id !== itemId && l.final)
          .slice(-1)[0]?.text
  const ctrl = new AbortController()
  unit.ctrl = ctrl
  const t0 = performance.now()
  let first = 0
  translateLineStream(
    { meetingId: serverId, text: unit.src, target: nativeLanguageName(nativeLanguage), context: prevLine?.slice(-300) },
    // Streams into this sentence's own slot: the text only grows at its end,
    // nothing above it moves or changes.
    (soFar) => {
      if (ctrl.signal.aborted) return
      if (!first) {
        first = performance.now() - t0
        trLatency.first.push(first)
      }
      unit.tr = soFar
      publishUnits(itemId)
    },
    ctrl.signal
  )
    .then((tr) => {
      if (ctrl.signal.aborted) return
      unit.ctrl = null
      unit.tr = tr ?? null
      const done = performance.now() - t0
      trLatency.done.push(done)
      console.log(`[live] translated in ${Math.round(first)} ms (first words) / ${Math.round(done)} ms (full):`, unit.src.slice(0, 60))
      publishUnits(itemId)
    })
    .catch((err) => {
      if ((err as Error).name !== 'AbortError') console.warn('[live] translation failed', (err as Error).message)
    })
}

function handleClientText(itemId: string, text: string, final: boolean): void {
  // Question cards: as soon as a question ends.
  const sentences = sentencesOf(text, final)
  const done = processedSentences.get(itemId) ?? 0
  for (let i = done; i < sentences.length; i++) {
    if (/\?$/.test(sentences[i]) || looksLikeQuestion(sentences[i])) scheduleHint(Date.now())
  }
  processedSentences.set(itemId, Math.max(done, sentences.length))

  let st = itemUnits.get(itemId)
  if (!st) {
    st = { units: [], cut: 0, text: '' }
    itemUnits.set(itemId, st)
  }
  const before = st.units.map((u) => u.src).join(' ')
  if (!text.startsWith(st.text.slice(0, st.cut)) && norm(text).indexOf(norm(before)) !== 0) {
    // The final transcript differs from what was streamed: rebuild the units
    // and keep translations of sentences that did not change.
    const old = st.units
    const [srcs] = splitUnits(text, true)
    st.units = srcs.map((src) => {
      const same = old.find((u) => norm(u.src) === norm(src))
      return same ?? { src, tr: null, ctrl: null }
    })
    old.forEach((u) => !st!.units.includes(u) && u.ctrl?.abort())
    st.cut = text.length
    st.text = text
    st.units.forEach((u) => u.tr === null && !u.ctrl && translateUnit(itemId, u))
    publishUnits(itemId)
    return
  }
  st.text = text
  if (st.cut > text.length) st.cut = text.length
  const [fresh, used] = splitUnits(text.slice(st.cut), final)
  st.cut += used
  for (const src of fresh) {
    const unit: Unit = { src, tr: null, ctrl: null }
    st.units.push(unit)
    translateUnit(itemId, unit)
  }
  publishUnits(itemId)
}

function isEcho(text: string): boolean {
  const now = Date.now()
  while (recentThem.length && now - recentThem[0].at > 20_000) recentThem.shift()
  return recentThem.some((r) => similarity(r.text, text) >= 0.5)
}

function saveLiveSegment(id: string, speaker: 'me' | 'them', text: string): void {
  const seg: LiveSegment = {
    speaker,
    startMs: liveStartMs.get(id) ?? Math.round(timeline()),
    endMs: Math.round(timeline()),
    text,
    id,
    translation: speaker === 'them' ? itemTranslation.get(id) ?? null : null
  }
  liveStartMs.delete(id)
  if (!addSegment(seg)) return
  const meetingId = get().meetingId
  if (meetingId) {
    void invoke('notes:appendSegment', {
      meetingId,
      speaker: speaker === 'me' ? 'Me' : 'Them',
      startMs: seg.startMs,
      endMs: seg.endMs,
      text: seg.text
    }).catch(() => {})
  }
}

function makeTranscriber(channel: 'me' | 'them', stream: MediaStream, serverId: string, gate?: EchoGate): LiveTranscriber {
  return new LiveTranscriber(
    stream,
    async () =>
      (await liveSession({ meetingId: serverId, languages: [channelLanguage(channel)], keywords: liveKeywords() })).secret,
    {
      onPartial: (rawId, text) => {
        const id = `${channel}:${rawId}`
        if (!inExpectedScript(text, channel)) return
        if (channel === 'them') themActiveUntil = Date.now() + 700
        else if (Date.now() < themActiveUntil) return // the client's voice leaking into your mic
        if (!liveStartMs.has(id)) liveStartMs.set(id, Math.max(0, Math.round(timeline() - 1500)))
        upsertLive(id, channel, { text })
        if (channel === 'them') handleClientText(id, text, false)
      },
      onFinal: (rawId, text) => {
        const id = `${channel}:${rawId}`
        if (!inExpectedScript(text, channel) || (channel === 'me' && isEcho(text))) {
          console.log(`[live] dropped ${channel} line:`, text.slice(0, 80))
          removeLive(id)
          liveStartMs.delete(id)
          return
        }
        upsertLive(id, channel, { text, final: true })
        if (channel === 'them') {
          recentThem.push({ at: Date.now(), text })
          handleClientText(id, text, true)
        }
        saveLiveSegment(id, channel, text)
      },
      onStatus: (st) => {
        if (channel === 'me') {
          meLiveOk = st === 'live'
          return
        }
        set({ liveStatus: st === 'stopped' ? 'off' : st })
        pushLiveToCapsule()
        if (st === 'failed') console.warn('[live] gave up — falling back to chunk transcription')
      }
    },
    gate && { gate, role: channel === 'them' ? 'far' : 'near' }
  )
}

async function startLive(system: MediaStream | null, mic: MediaStream): Promise<void> {
  const serverId = get().serverId
  if (!serverId) return
  // The loopback channel tells the mic channel when the client is speaking, so
  // their voice coming back through the speakers is not transcribed as "You".
  const gate = system ? new EchoGate() : undefined
  if (system) transcribers.them = makeTranscriber('them', system, serverId, gate)
  transcribers.me = makeTranscriber('me', mic, serverId, gate)
  for (const [ch, t] of Object.entries(transcribers)) {
    try {
      await t!.start()
    } catch (err) {
      console.warn(`[live] ${ch} could not start`, (err as Error).message)
      if (ch === 'them') set({ liveStatus: 'failed' })
    }
  }
}

function resetLive(): void {
  liveStartMs.clear()
  processedSentences.clear()
  itemTranslation.clear()
  itemUnits.forEach((st) => st.units.forEach((u) => u.ctrl?.abort()))
  itemUnits.clear()
  trLatency.first.length = 0
  trLatency.done.length = 0
  recentThem.length = 0
  themActiveUntil = 0
  meLiveOk = false
  set({ live: [], liveStatus: 'off' })
}

/** Append a task line to the user's notes so it lands in the AI action items. */
export function addTaskToNotes(task: string): void {
  const line = `- [ ] ${task.trim()}`
  const notes = get().userNotes
  setUserNotes(notes.trim() ? `${notes.replace(/\s+$/, '')}\n${line}\n` : `${line}\n`)
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function startMeeting_(templateId?: string): Promise<void> {
  const s = get()
  if (s.status !== 'idle') return
  if (!ChannelRecorder.isSupported()) {
    set({ error: 'Audio recording is not supported on this device.' })
    return
  }
  set({
    status: 'starting',
    error: null,
    upgradeNeeded: false,
    segments: [],
    userNotes: '',
    enhanced: null,
    hints: [],
    hintsNote: null,
    templateId: templateId ?? s.templateId
  })
  const setting = <T,>(key: string, fallback: T) => invoke<T>('settings:get', key).then((v) => v ?? fallback).catch(() => fallback)
  hintsEnabled = (await setting<boolean>('replyHints', true)) !== false
  answerHints = (await setting<boolean>('answerHints', false)) === true
  nativeLanguage = (await setting<string>('nativeLanguage', '')) || ''
  aboutMe = String((await setting<string>('aboutMe', '')) || '').slice(0, 2000)
  clientLanguage = String((await setting<string>('clientLanguage', 'en')) || 'en')
  myCallLanguage = String((await setting<string>('myCallLanguage', '')) || '')
  pendingHeardAt = null
  console.log('[session] starting')

  try {
    const server = await startMeeting()

    const mic = await getMic()
    const sys = await getSystemAudio()
    const system = sys?.audio ?? null
    streams = sys ? [mic, sys.capture, sys.audio] : [mic]

    const meetingId = await invoke<string>('notes:create', {
      serverId: server.meetingId,
      startedAt: new Date().toISOString(),
      templateId: get().templateId
    })

    activeBaseMs = 0
    activeSince = performance.now()

    recorders = {
      me: new ChannelRecorder(mic, CHUNK_MS, timeline, (c) => enqueue('me', c)),
      them: system
        ? new ChannelRecorder(system, THEM_MAX_CHUNK_MS, timeline, (c) => enqueue('them', c), { splitOnPause: true })
        : undefined
    }
    recorders.me?.start()
    recorders.them?.start()
    resetLive()

    contextOwner = meetingId
    track('meeting_started', { systemAudio: Boolean(system), hasContext: Boolean(get().callContext.trim()) })
    set({
      status: 'recording',
      meetingId,
      serverId: server.meetingId,
      limits: server.limits,
      systemAudio: Boolean(system),
      error: system ? null : 'Only your microphone is recorded — system audio could not be captured.'
    })
    report()
    console.log('[session] recording', meetingId)
    void startLive(system, mic)
  } catch (err) {
    streams.forEach((st) => st.getTracks().forEach((t) => t.stop()))
    streams = []
    const e = err as Error
    const upgrade = err instanceof ApiError && err.isPlanLimit
    const message =
      e.name === 'NotAllowedError'
        ? 'Microphone access was denied. Allow it in Windows Settings → Privacy → Microphone.'
        : e.message
    set({ status: 'idle', error: message, upgradeNeeded: upgrade })
    report()
    console.error('[session] start failed', err)
  }
}

export async function pauseMeeting(): Promise<void> {
  if (get().status !== 'recording') return
  activeBaseMs = timeline()
  activeSince = null
  set({ status: 'paused' })
  report()
  transcribers.them?.pause()
  transcribers.me?.pause()
  await Promise.all([recorders.me?.pause(), recorders.them?.pause()])
}

export function resumeMeeting(): void {
  if (get().status !== 'paused') return
  activeSince = performance.now()
  recorders.me?.resume()
  recorders.them?.resume()
  transcribers.them?.resume()
  transcribers.me?.resume()
  set({ status: 'recording' })
  report()
}

export async function stopMeeting(): Promise<void> {
  const s = get()
  if (s.status !== 'recording' && s.status !== 'paused') return
  console.log('[session] stopping')
  const durationMs = timeline()
  track('meeting_finished', {
    minutes: Math.round(durationMs / 60_000),
    cards: s.hints.length,
    unanswered: s.hints.filter((h) => !h.answered).length,
    trFirstMs: median(trLatency.first),
    trDoneMs: median(trLatency.done),
    trCount: trLatency.done.length
  })
  activeBaseMs = durationMs
  activeSince = null
  set({ status: 'finishing' })

  const liveDone = Promise.all([transcribers.them?.stop(), transcribers.me?.stop()])
  delete transcribers.them
  delete transcribers.me
  meLiveOk = false
  await Promise.all([recorders.me?.stop(), recorders.them?.stop(), liveDone])
  void invoke('capsule:live', { lines: [], status: 'off' }).catch(() => {})
  recorders = {}
  streams.forEach((st) => st.getTracks().forEach((t) => t.stop()))
  streams = []
  report() // overlay + tray off as soon as audio capture ends

  const meetingId = get().meetingId
  if (meetingId) {
    await invoke('notes:saveUserNotes', { meetingId, notes: get().userNotes }).catch(() => {})
    await invoke('notes:setStatus', {
      meetingId,
      status: 'processing',
      durationS: durationMs / 1000
    }).catch(() => {})
  }

  await waitForDrain()
  // Nothing was said and nothing written (a mis-click, a test): don't keep an
  // empty "Untitled meeting" in the list.
  if (meetingId && get().segments.length === 0 && !get().userNotes.trim()) {
    await invoke('meetings:delete', meetingId).catch(() => {})
    set({
      status: 'idle',
      meetingId: null,
      serverId: null,
      enhanced: null,
      hints: [],
      live: [],
      error: 'Nothing was said, so this call was not saved.'
    })
    console.log('[session] empty call discarded', meetingId)
    return
  }
  // Persist the de-duplicated transcript (live appends may include echoes
  // that were removed later).
  if (meetingId) {
    await invoke('notes:replaceTranscript', {
      meetingId,
      segments: get().segments.map((sg) => ({
        speaker: sg.speaker === 'me' ? 'Me' : 'Them',
        startMs: sg.startMs,
        endMs: sg.endMs,
        text: sg.text
      }))
    }).catch((err) => console.error('[session] replaceTranscript failed', err))
  }
  await enhanceCurrent()
}

/** Generate (or regenerate with another template) the AI notes. */
export async function enhanceCurrent(templateId?: string): Promise<void> {
  const { meetingId, serverId, userNotes, segments } = get()
  if (!meetingId || !serverId) return
  // Calls default to the client-call notes (brief, tasks with dates, follow-up
  // email); empty sections are left out, so it also fits other calls.
  const tpl = templateId ?? (get().templateId === 'general' ? 'client-call' : get().templateId)
  set({ status: 'enhancing', templateId: tpl })
  try {
    // Notes in your language (like the live translation); the follow-up email
    // in the language the client speaks.
    const result = await enhanceNotes({
      meetingId: serverId,
      templateId: tpl,
      userNotes,
      transcript: segments.map(({ speaker, startMs, text }) => ({ speaker, startMs, text })),
      language: notesLanguageName(myLanguageCode()),
      clientLanguage: notesLanguageName(clientLanguage || 'en'),
      context: contextForAI() || undefined
    })
    await invoke('notes:saveEnhanced', { meetingId, templateId: tpl, ...result })
    set({ enhanced: result, status: 'idle' })
    track('notes_ready', { template: tpl, segments: segments.length })
    console.log('[session] enhanced', meetingId)
  } catch (err) {
    const upgrade = err instanceof ApiError && err.isPlanLimit
    set({ status: 'idle', error: (err as Error).message, upgradeNeeded: upgrade })
    await invoke('notes:setStatus', { meetingId, status: 'done' }).catch(() => {})
  }
}

let notesTimer: number | null = null
export function setUserNotes(notes: string): void {
  set({ userNotes: notes })
  const id = get().meetingId
  if (!id) return
  if (notesTimer !== null) window.clearTimeout(notesTimer)
  notesTimer = window.setTimeout(() => {
    void invoke('notes:saveUserNotes', { meetingId: id, notes }).catch(() => {})
  }, 800)
}

export function setTemplate(templateId: string): void {
  set({ templateId })
}

export function clearError(): void {
  set({ error: null, upgradeNeeded: false })
}

/** Live input levels (0..1) for the UI meters. */
export function levels(): { me: number; them: number } {
  return { me: recorders.me?.level ?? 0, them: recorders.them?.level ?? 0 }
}

export function activeDurationMs(): number {
  return timeline()
}

/** Handle tray / overlay / hotkey commands relayed by the main process. */
export function handleRecordingCommand(cmd: 'start' | 'stop' | 'pause' | 'resume' | 'toggle'): void {
  const status = get().status
  switch (cmd) {
    case 'start':
      void startMeeting_()
      break
    case 'stop':
      void stopMeeting()
      break
    case 'pause':
      void pauseMeeting()
      break
    case 'resume':
      resumeMeeting()
      break
    case 'toggle':
      if (status === 'recording' || status === 'paused') void stopMeeting()
      else if (status === 'idle') void startMeeting_()
      break
  }
}

export { startMeeting_ as startMeetingSession }
