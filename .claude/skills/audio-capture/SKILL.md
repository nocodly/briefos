---
name: audio-capture
description: Use this skill for ANY task involving audio recording, WASAPI loopback, microphone capture, FFmpeg, chunking, VAD, or audio file handling in BriefOS. Triggers when: creating or editing AudioCapture.js, ChunkManager.js, VAD.js — or when the user asks "audio not capturing", "system audio not working", "FFmpeg error", "chunks not splitting", "recording stops early", "WASAPI device not found". Always use before writing any audio code — WASAPI device names and FFmpeg flags are Windows-specific and must be exact.
---

# Audio Capture — BriefOS

## What we capture

Two streams simultaneously, merged into one WAV file:
1. **System audio** — everything playing through Windows speakers/headphones (Zoom, Meet, Teams, browser). Uses WASAPI loopback.
2. **Microphone** — user's own voice. Uses default Windows input device.

Result: `recording_<uuid>.wav` — 16kHz, mono, PCM16. Optimal for Whisper API.

---

## AudioCapture.js — complete implementation

```js
// src/capture/AudioCapture.js
const { spawn } = require('child_process')
const path = require('path')
const { app } = require('electron')
const { v4: uuidv4 } = require('uuid')
const winston = require('winston')

const ffmpegPath = require('ffmpeg-static')

class AudioCapture {
  constructor() {
    this.process = null
    this.recordingId = null
    this.outputPath = null
    this.startTime = null
    this.isPaused = false
  }

  getOutputDir() {
    return path.join(app.getPath('userData'), 'recordings')
  }

  start() {
    this.recordingId = uuidv4()
    this.outputPath = path.join(this.getOutputDir(), `recording_${this.recordingId}.wav`)
    this.startTime = Date.now()

    // WASAPI loopback = system audio (what you hear)
    // dshow = microphone input
    const args = [
      '-y',                                          // overwrite output
      // System audio (WASAPI loopback)
      '-f', 'dshow',
      '-i', 'audio=virtual-audio-capturer',          // requires VB-Cable or similar
      // Microphone
      '-f', 'dshow',
      '-i', 'audio=Microphone Array (Realtek)',       // fallback — see note below
      // Merge both streams
      '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=0',
      // Output format optimal for Whisper
      '-ar', '16000',    // 16kHz sample rate
      '-ac', '1',        // mono
      '-acodec', 'pcm_s16le',
      '-f', 'wav',
      this.outputPath,
    ]

    this.process = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] })

    this.process.stderr.on('data', (data) => {
      winston.debug('FFmpeg:', data.toString())
    })

    this.process.on('close', (code) => {
      winston.info(`FFmpeg closed with code ${code}`)
    })

    return { recordingId: this.recordingId, outputPath: this.outputPath }
  }

  stop() {
    if (!this.process) return null
    // Send 'q' to FFmpeg stdin to stop gracefully
    this.process.stdin.write('q')
    this.process.stdin.end()
    const duration = Date.now() - this.startTime
    this.process = null
    return { outputPath: this.outputPath, durationMs: duration, recordingId: this.recordingId }
  }

  pause() {
    // FFmpeg doesn't pause — we stop and note the position
    // For MVP: just stop recording, mark as paused
    this.isPaused = true
    if (this.process) this.process.kill('SIGSTOP') // Unix only
  }

  resume() {
    this.isPaused = false
    if (this.process) this.process.kill('SIGCONT')
  }
}

module.exports = AudioCapture
```

## IMPORTANT: Windows audio device names

Device names vary per machine. AudioCapture.js must detect available devices first:

```js
// Detect available audio devices
function listAudioDevices() {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'])
    let output = ''
    proc.stderr.on('data', (d) => output += d.toString())
    proc.on('close', () => {
      const lines = output.split('\n')
      const audioDevices = lines
        .filter(l => l.includes('"') && l.toLowerCase().includes('audio'))
        .map(l => l.match(/"([^"]+)"/)?.[1])
        .filter(Boolean)
      resolve(audioDevices)
    })
  })
}
```

Expose via IPC: `ipcMain.handle('audio:listDevices', listAudioDevices)`

For WASAPI loopback — user needs **VB-Cable** (free virtual audio driver) or **Stereo Mix** enabled. Check in Settings → Audio → select system audio device.

---

## ChunkManager.js — 30s chunks with overlap

```js
// src/capture/ChunkManager.js
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const ffmpegPath = require('ffmpeg-static')

class ChunkManager {
  // Split WAV file into 30s chunks with 2s overlap
  // Overlap prevents word cut-off at boundaries
  async splitIntoChunks(inputPath, outputDir) {
    const CHUNK_DURATION = 30  // seconds
    const OVERLAP = 2          // seconds overlap between chunks

    const duration = await this.getAudioDuration(inputPath)
    const chunks = []
    let startTime = 0
    let index = 0

    while (startTime < duration) {
      const chunkPath = path.join(outputDir, `chunk_${String(index).padStart(3, '0')}.wav`)
      const endTime = Math.min(startTime + CHUNK_DURATION + OVERLAP, duration)

      await this.extractChunk(inputPath, chunkPath, startTime, endTime - startTime)

      chunks.push({
        index,
        path: chunkPath,
        startMs: startTime * 1000,
        endMs: endTime * 1000,
      })

      startTime += CHUNK_DURATION  // advance by chunk duration (not chunk+overlap)
      index++
    }

    return chunks
  }

  extractChunk(input, output, start, duration) {
    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, [
        '-ss', start.toString(),
        '-t', duration.toString(),
        '-i', input,
        '-ar', '16000',
        '-ac', '1',
        '-acodec', 'pcm_s16le',
        output
      ])
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg exit ${code}`)))
    })
  }

  getAudioDuration(filePath) {
    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, ['-i', filePath, '-hide_banner'])
      let output = ''
      proc.stderr.on('data', (d) => output += d.toString())
      proc.on('close', () => {
        const match = output.match(/Duration: (\d+):(\d+):(\d+\.?\d*)/)
        if (!match) return reject(new Error('Cannot parse duration'))
        const [, h, m, s] = match
        resolve(parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s))
      })
    })
  }
}

module.exports = ChunkManager
```

---

## File storage paths

```
%APPDATA%/BriefOS/
├── recordings/
│   ├── recording_<uuid>.wav       ← full recording
│   └── chunks/
│       └── <uuid>/
│           ├── chunk_000.wav
│           ├── chunk_001.wav
│           └── chunk_002.wav
├── data.db                        ← SQLite
└── logs/
    └── briefos.log
```

## Common errors and fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `dshow: audio=virtual-audio-capturer not found` | VB-Cable not installed | Show onboarding dialog to install VB-Cable |
| `FFmpeg exit code 1` | Wrong device name | Run `listAudioDevices()` and let user select |
| `recording_xxx.wav is 0 bytes` | FFmpeg started but no audio | Check if Windows audio device is active |
| `chunk has no audio` | Silence gap | Fine — Whisper handles silence gracefully |
| Recording stops after 30s | Process killed | Never kill FFmpeg process — send 'q' to stdin |
