// =============================================================================
// ChannelRecorder — records ONE audio channel ("me" = microphone, "them" =
// system loopback) as a sequence of self-contained webm/opus files.
//
// MediaRecorder's timeslice output is not independently decodable (only the
// first slice has the header), so we rotate: stop the recorder every
// CHUNK_MS and immediately start a new one on the same stream. Each chunk is
// a complete file the server can transcribe on its own → live transcript.
//
// A level meter tracks the peak volume per chunk; silent chunks are dropped
// (saves money and avoids transcription "hallucinations" on silence).
// =============================================================================

export interface AudioChunk {
  blob: Blob
  /** Position of the chunk start on the meeting's active timeline. */
  startMs: number
  durationMs: number
  /** Peak RMS level (0..1) inside the chunk. */
  peak: number
}

const MIME = 'audio/webm;codecs=opus'
const BITRATE = 32_000
const SILENCE_PEAK = 0.012

export class ChannelRecorder {
  private recorder: MediaRecorder | null = null
  private rotateTimer: number | null = null
  private meterTimer: number | null = null
  private audioCtx: AudioContext
  private analyser: AnalyserNode
  private buffer: Float32Array<ArrayBuffer>
  private chunkPeak = 0
  private stopResolvers: (() => void)[] = []
  /** Latest instantaneous level (0..1) for UI meters. */
  public level = 0

  constructor(
    private stream: MediaStream,
    private chunkMs: number,
    /** Returns the meeting's current active-timeline position in ms. */
    private timeline: () => number,
    private onChunk: (chunk: AudioChunk) => void
  ) {
    this.audioCtx = new AudioContext()
    const source = this.audioCtx.createMediaStreamSource(stream)
    this.analyser = this.audioCtx.createAnalyser()
    this.analyser.fftSize = 1024
    source.connect(this.analyser)
    this.buffer = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4))
  }

  static isSupported(): boolean {
    return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(MIME)
  }

  start(): void {
    this.meterTimer = window.setInterval(() => this.sampleLevel(), 150)
    this.beginChunk()
  }

  /** Finish the current chunk (it is emitted) and stop until resume(). */
  async pause(): Promise<void> {
    await this.endChunk()
  }

  resume(): void {
    if (!this.recorder) this.beginChunk()
  }

  /** Emit the final chunk and release audio resources. */
  async stop(): Promise<void> {
    await this.endChunk()
    if (this.meterTimer !== null) window.clearInterval(this.meterTimer)
    this.meterTimer = null
    this.level = 0
    await this.audioCtx.close().catch(() => {})
  }

  private sampleLevel(): void {
    this.analyser.getFloatTimeDomainData(this.buffer)
    let sum = 0
    for (let i = 0; i < this.buffer.length; i++) sum += this.buffer[i] * this.buffer[i]
    const rms = Math.sqrt(sum / this.buffer.length)
    this.level = rms
    if (this.recorder) this.chunkPeak = Math.max(this.chunkPeak, rms)
  }

  private beginChunk(): void {
    const parts: Blob[] = []
    const startMs = this.timeline()
    const t0 = performance.now()
    this.chunkPeak = 0

    const rec = new MediaRecorder(this.stream, { mimeType: MIME, audioBitsPerSecond: BITRATE })
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) parts.push(e.data)
    }
    rec.onstop = () => {
      const peak = this.chunkPeak
      const durationMs = performance.now() - t0
      if (parts.length && durationMs > 500) {
        this.onChunk({ blob: new Blob(parts, { type: MIME }), startMs, durationMs, peak })
      }
      const resolvers = this.stopResolvers
      this.stopResolvers = []
      resolvers.forEach((r) => r())
    }
    rec.start()
    this.recorder = rec
    this.rotateTimer = window.setTimeout(() => {
      void this.endChunk().then(() => this.beginChunk())
    }, this.chunkMs)
  }

  private endChunk(): Promise<void> {
    if (this.rotateTimer !== null) window.clearTimeout(this.rotateTimer)
    this.rotateTimer = null
    const rec = this.recorder
    this.recorder = null
    if (!rec || rec.state === 'inactive') return Promise.resolve()
    return new Promise((resolve) => {
      this.stopResolvers.push(resolve)
      rec.stop()
    })
  }

  static isSilent(chunk: AudioChunk): boolean {
    return chunk.peak < SILENCE_PEAK
  }
}
