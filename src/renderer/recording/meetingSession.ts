import { create } from 'zustand'
import { invoke } from '../lib/ipc'
import {
  ApiError,
  enhanceNotes,
  startMeeting,
  transcribeChunk,
  type EnhancedNotes,
  type StartMeetingResult
} from '../lib/api'
import { ChannelRecorder, type AudioChunk } from './ChannelRecorder'

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
const UPLOAD_CONCURRENCY = 2
const MAX_RETRIES = 4

export type SessionStatus = 'idle' | 'starting' | 'recording' | 'paused' | 'finishing' | 'enhancing'

export interface LiveSegment {
  speaker: 'me' | 'them'
  startMs: number
  endMs: number
  text: string
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
}

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
  enhanced: null
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
const lastText: Record<'me' | 'them', string> = { me: '', them: '' }

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

async function runJob(job: Job): Promise<void> {
  const { serverId, meetingId } = get()
  if (!serverId || !meetingId) return
  try {
    const text = await transcribeChunk({
      meetingId: serverId,
      channel: job.channel,
      blob: job.chunk.blob,
      durationSec: job.chunk.durationMs / 1000,
      prompt: lastText[job.channel]
    })
    if (!text.trim()) return
    lastText[job.channel] = text
    const seg: LiveSegment = {
      speaker: job.channel,
      startMs: Math.round(job.chunk.startMs),
      endMs: Math.round(job.chunk.startMs + job.chunk.durationMs),
      text: text.trim()
    }
    set((s) => ({ segments: [...s.segments, seg].sort((a, b) => a.startMs - b.startMs) }))
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
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false
  })
}

/** System audio via Electron loopback (see setDisplayMediaRequestHandler). */
async function getSystemAudio(): Promise<MediaStream | null> {
  try {
    const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
    display.getVideoTracks().forEach((t) => {
      t.stop()
      display.removeTrack(t)
    })
    if (display.getAudioTracks().length === 0) return null
    return display
  } catch (err) {
    console.warn('[session] system audio unavailable', err)
    return null
  }
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
    templateId: templateId ?? s.templateId
  })
  console.log('[session] starting')

  try {
    const server = await startMeeting()

    const mic = await getMic()
    const system = await getSystemAudio()
    streams = system ? [mic, system] : [mic]

    const meetingId = await invoke<string>('notes:create', {
      serverId: server.meetingId,
      startedAt: new Date().toISOString(),
      templateId: get().templateId
    })

    activeBaseMs = 0
    activeSince = performance.now()
    lastText.me = ''
    lastText.them = ''

    recorders = {
      me: new ChannelRecorder(mic, CHUNK_MS, timeline, (c) => enqueue('me', c)),
      them: system ? new ChannelRecorder(system, CHUNK_MS, timeline, (c) => enqueue('them', c)) : undefined
    }
    recorders.me?.start()
    recorders.them?.start()

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
  await Promise.all([recorders.me?.pause(), recorders.them?.pause()])
}

export function resumeMeeting(): void {
  if (get().status !== 'paused') return
  activeSince = performance.now()
  recorders.me?.resume()
  recorders.them?.resume()
  set({ status: 'recording' })
  report()
}

export async function stopMeeting(): Promise<void> {
  const s = get()
  if (s.status !== 'recording' && s.status !== 'paused') return
  console.log('[session] stopping')
  const durationMs = timeline()
  activeBaseMs = durationMs
  activeSince = null
  set({ status: 'finishing' })

  await Promise.all([recorders.me?.stop(), recorders.them?.stop()])
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
  await enhanceCurrent()
}

/** Generate (or regenerate with another template) the AI notes. */
export async function enhanceCurrent(templateId?: string): Promise<void> {
  const { meetingId, serverId, userNotes, segments } = get()
  if (!meetingId || !serverId) return
  const tpl = templateId ?? get().templateId
  set({ status: 'enhancing', templateId: tpl })
  try {
    const result = await enhanceNotes({
      meetingId: serverId,
      templateId: tpl,
      userNotes,
      transcript: segments.map(({ speaker, startMs, text }) => ({ speaker, startMs, text }))
    })
    await invoke('notes:saveEnhanced', { meetingId, templateId: tpl, ...result })
    set({ enhanced: result, status: 'idle' })
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
