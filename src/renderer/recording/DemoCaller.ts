// =============================================================================
// DemoCaller — "Test call" with an AI client (Anna) over OpenAI Realtime
// (speech-to-speech, WebRTC). Her voice plays through the speakers, so
// Minutama records and captions it exactly like a real client on Zoom; the
// user answers into the microphone. The secret comes from functions/demo-call.
// =============================================================================

export interface DemoEvents {
  onStatus: (status: 'connecting' | 'live' | 'ended' | 'failed', message?: string) => void
}

const MAX_MS = 5 * 60 * 1000

export class DemoCaller {
  private pc: RTCPeerConnection | null = null
  private mic: MediaStream | null = null
  private audio: HTMLAudioElement | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private ended = false

  constructor(private events: DemoEvents) {}

  async start(secret: string, model: string): Promise<void> {
    this.events.onStatus('connecting')
    try {
      // Echo cancellation on: Chromium removes Anna's own voice (played by
      // this page) from the mic, so she doesn't hear and interrupt herself.
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false }
      })
      const pc = new RTCPeerConnection()
      this.pc = pc
      const audio = new Audio()
      audio.autoplay = true
      this.audio = audio
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0]
        void audio.play().catch((err) => console.warn('[demo] audio play failed', err))
      }
      this.mic.getTracks().forEach((t) => pc.addTrack(t, this.mic!))

      const events = pc.createDataChannel('oai-events')
      events.onopen = () => {
        // Anna starts the conversation.
        events.send(JSON.stringify({ type: 'response.create' }))
        this.events.onStatus('live')
      }
      pc.onconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(pc.connectionState) && !this.ended) {
          this.stop()
          this.events.onStatus(pc.connectionState === 'failed' ? 'failed' : 'ended')
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const res = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/sdp' },
        body: offer.sdp
      })
      if (!res.ok) throw new Error(`Voice connection failed (${res.status})`)
      await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() })
      this.timer = setTimeout(() => {
        this.stop()
        this.events.onStatus('ended', 'The test call ended after 5 minutes.')
      }, MAX_MS)
      console.log('[demo] connected')
    } catch (err) {
      console.error('[demo] start failed', err)
      this.stop()
      this.events.onStatus('failed', 'The test call could not start. Check your internet and try again.')
    }
  }

  stop(): void {
    if (this.ended) return
    this.ended = true
    if (this.timer) clearTimeout(this.timer)
    this.pc?.getSenders().forEach((s) => s.track?.stop())
    this.pc?.close()
    this.pc = null
    this.mic?.getTracks().forEach((t) => t.stop())
    this.mic = null
    if (this.audio) {
      this.audio.pause()
      this.audio.srcObject = null
    }
    this.audio = null
  }
}
