import { AudioCapture, type RecordingHandle } from '@capture/AudioCapture'
import { ChunkManager } from '@capture/ChunkManager'
import { WhisperClient } from '@transcription/WhisperClient'
import { TranscriptMerger } from '@transcription/TranscriptMerger'
import { diarize } from '@transcription/Diarizer'
import { SummaryEngine, type MeetingSummary } from '@ai/SummaryEngine'
import { detectMeetingType } from '@ai/TemplateSelector'
import { getDatabase } from '@storage/Database'
import { cleanupChunks } from '@storage/FileManager'
import { getAllSettings, isPro, isProOrByok, isTrial } from './store'
import { updateTrayState } from './tray'
import { createOverlayWindow, closeOverlayWindow } from './index'
import { progress, emitRecordingTick, sendToRenderer } from './ipc'

// =============================================================================
// RecordingPipeline — orchestrates the whole capture→brief flow.
//   start()  : begin AudioCapture, open overlay, flip tray, tick every 1s
//   stop()   : finalize WAV, create meeting row, kick off async processing
//   process(): chunk → Whisper → merge → diarize → save transcript → summary
// Progress is pushed to the renderer via progress:* events. A single instance
// is shared across the main process (getPipeline()).
// =============================================================================

class RecordingPipeline {
  private capture = new AudioCapture()
  private tickTimer: NodeJS.Timeout | null = null
  private startedAt: string | null = null
  private processing = false

  async start(): Promise<RecordingHandle> {
    if (this.tickTimer) throw new Error('Recording already in progress')
    const settings = getAllSettings()

    // Enforce trial limit server-side so it cannot be bypassed by the renderer
    // (hotkey, tray menu, or direct IPC calls all flow through here).
    if (isTrial()) {
      const meetingCount = getDatabase().getAllMeetings({ limit: 1000 }).length
      if (meetingCount >= 10) {
        throw new Error(
          "You've used all 10 free trial meetings. Upgrade to Pro or switch to Free + Own Keys in Settings → Plan."
        )
      }
    }

    console.log('[pipeline] start')

    // Surface FFmpeg/device warnings to the renderer (non-fatal).
    this.capture.onError = (message) => sendToRenderer('progress:error', { message })

    // If FFmpeg dies on its own (e.g. the loopback device doesn't exist), tear
    // down the recording UI/state so we don't get stuck "already in progress".
    this.capture.onUnexpectedExit = (code, detail) => {
      console.error('[pipeline] capture exited unexpectedly', code, detail)
      sendToRenderer('progress:error', {
        message:
          'Recording stopped unexpectedly. Check your system-audio device (e.g. VB-Cable) and microphone in Settings → Audio.'
      })
      this.abort()
    }

    const handle = await this.capture.start({
      systemDevice: settings.systemAudioDevice,
      micDevice: settings.microphoneDevice,
      micOnly: settings.micOnly
    })

    this.startedAt = new Date().toISOString()
    try {
      updateTrayState(true)
      createOverlayWindow()
      this.tickTimer = setInterval(() => emitRecordingTick(this.capture.status().durationMs), 1000)
    } catch (err) {
      // Roll back a partially-started session so state stays consistent.
      console.error('[pipeline] start failed after capture began, aborting', err)
      this.capture.stop()
      this.abort()
      throw err
    }
    return handle
  }

  /** Tear down recording UI/state without producing a meeting (failure path). */
  private abort(): void {
    this.clearTick()
    this.startedAt = null
    updateTrayState(false)
    closeOverlayWindow()
  }

  async stop(): Promise<{ meetingId: string }> {
    console.log('[pipeline] stop')
    const result = this.capture.stop()
    this.clearTick()
    updateTrayState(false)
    closeOverlayWindow()

    if (!result) throw new Error('No active recording to stop')

    const db = getDatabase()
    const meetingId = db.createMeeting({
      title: 'Untitled Meeting',
      startedAt: this.startedAt ?? new Date().toISOString(),
      audioPath: result.outputPath
    })
    db.updateMeeting(meetingId, { duration_s: Math.round(result.durationMs / 1000) })
    this.startedAt = null

    // Run the heavy pipeline in the background; stop() returns immediately so
    // the renderer can show the processing screen driven by progress:* events.
    void this.process(meetingId, result.outputPath).catch((err) => {
      console.error('[pipeline] processing failed', err)
      sendToRenderer('progress:error', { message: (err as Error).message })
      // Still send the user to the (partial) meeting so they can retry.
      progress.done(meetingId)
      this.processing = false
    })

    return { meetingId }
  }

  pause(): void {
    this.capture.pause()
  }
  resume(): void {
    this.capture.resume()
  }
  status() {
    return this.capture.status()
  }
  isProcessing(): boolean {
    return this.processing
  }

  /** The full post-recording pipeline. Emits progress at each stage. */
  private async process(meetingId: string, audioPath: string): Promise<void> {
    this.processing = true
    const settings = getAllSettings()
    const db = getDatabase()

    // Owner's OPENAI_API_KEY (env) is the fallback for all plans — trial/pro
    // users never need to enter a key. BYOK users can override via Settings.
    const openaiKey = settings.openaiApiKey || process.env['OPENAI_API_KEY'] || ''
    if (!openaiKey) throw new Error('OpenAI API key not configured. Contact support@nocodly.com')

    // 1. Chunk
    progress.transcription(5, 'Splitting audio into chunks')
    const chunks = await new ChunkManager().splitIntoChunks(audioPath, meetingId)

    // 2. Transcribe (parallel)
    const whisper = new WhisperClient(openaiKey)
    const transcribed = await whisper.transcribeChunks(chunks, (done, total) =>
      progress.transcription(10 + Math.round((done / total) * 50), `Transcribing chunk ${done}/${total}`)
    )

    // 3. Merge
    progress.transcription(65, 'Merging transcript')
    const merger = new TranscriptMerger()
    const merged = merger.merge(transcribed)

    // 4. Diarize (BYOK/Pro + HF token only; failure → single speaker)
    let diar = null
    if (isProOrByok() && settings.huggingfaceToken) {
      progress.transcription(75, 'Detecting speakers')
      diar = await diarize(audioPath, { hfToken: settings.huggingfaceToken })
    }

    // 5. Save transcript
    const segments = merger.attributeSpeakers(merged, diar ?? undefined)
    db.saveTranscriptSegments(meetingId, segments)
    db.updateMeeting(meetingId, { language: merged.language ?? 'en' })

    // 6. Summary
    progress.summary(85, 'Generating AI summary')
    await this.generateSummary(meetingId, merged.text)

    // Free disk: chunks are transient; the full WAV is kept locally.
    cleanupChunks(meetingId)

    progress.summary(100, 'Done')
    progress.done(meetingId)
    this.processing = false
  }

  /**
   * Generate (or regenerate) the summary for a meeting. Reconstructs transcript
   * text from the DB when not supplied. typeOverride forces a prompt template;
   * otherwise the type is auto-detected.
   */
  async generateSummary(
    meetingId: string,
    transcriptText?: string,
    typeOverride?: string
  ): Promise<MeetingSummary> {
    const settings = getAllSettings()
    const db = getDatabase()

    // Provider selection:
    //   anthropic + anthropicApiKey set → use Anthropic (user's own key)
    //   otherwise → use OpenAI (user's key or owner's env key as fallback)
    const ownerOpenaiKey = process.env['OPENAI_API_KEY'] || ''
    const openaiKey = settings.openaiApiKey || ownerOpenaiKey
    const anthropicKey = settings.anthropicApiKey

    const useAnthropic = settings.aiProvider === 'anthropic' && !!anthropicKey
    if (!useAnthropic && !openaiKey) {
      throw new Error('No AI key configured. Contact support@nocodly.com')
    }

    const text = transcriptText ?? this.transcriptTextFor(meetingId)
    if (!text.trim()) throw new Error('No transcript available to summarize')

    const type =
      typeOverride && typeOverride !== 'auto' ? typeOverride : detectMeetingType(text)

    // Model priority: user custom → plan-based default (byok/pro get gpt-4o — their key, their choice)
    const planModel = isProOrByok() ? 'gpt-4o' : 'gpt-4o-mini'
    const engine = new SummaryEngine({
      anthropicApiKey: useAnthropic ? anthropicKey : undefined,
      openaiApiKey: openaiKey,
      model: settings.aiModel || (useAnthropic ? undefined : planModel),
    })
    const summary = await engine.generateSummary(text, type)

    db.saveSummary(meetingId, summary)
    db.updateMeeting(meetingId, {
      title: summary.title,
      type: summary.type,
      language: summary.language
    })
    return summary
  }

  private transcriptTextFor(meetingId: string): string {
    const rows = getDatabase().getTranscript(meetingId) as { speaker: string; text: string }[]
    return rows.map((r) => `${r.speaker}: ${r.text}`).join('\n')
  }

  private clearTick(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }
  }
}

let instance: RecordingPipeline | null = null
export function getPipeline(): RecordingPipeline {
  if (!instance) instance = new RecordingPipeline()
  return instance
}
