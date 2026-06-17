import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { app } from 'electron'
import type { DiarSegment } from './TranscriptMerger'

// =============================================================================
// Diarizer — Node-side wrapper that runs python/diarizer.py as a subprocess
// (child_process.spawn, never inline — critical rule #10) and parses its JSON
// stdout into DiarSegment[]. On any failure it resolves to null so the pipeline
// falls back to a single "Speaker" without blocking the summary.
// =============================================================================

function diarizerScriptPath(): string {
  // Shipped to resources/python when packaged; runs from source in dev.
  return app.isPackaged
    ? join(process.resourcesPath, 'python', 'diarizer.py')
    : join(app.getAppPath(), 'python', 'diarizer.py')
}

export interface DiarizeOptions {
  hfToken: string
  numSpeakers?: number
  /** Python executable; override if the user uses a venv. Defaults to 'python'. */
  pythonPath?: string
}

export function diarize(
  audioPath: string,
  { hfToken, numSpeakers, pythonPath = 'python' }: DiarizeOptions
): Promise<DiarSegment[] | null> {
  return new Promise((resolve) => {
    if (!hfToken) {
      console.warn('[diarizer] no Hugging Face token — skipping diarization')
      resolve(null)
      return
    }

    const args = [diarizerScriptPath(), audioPath, hfToken]
    if (numSpeakers) args.push(String(numSpeakers))

    console.log('[diarizer] spawning', pythonPath, args[0])
    let stdout = ''
    let stderr = ''

    let proc
    try {
      proc = spawn(pythonPath, args)
    } catch (err) {
      console.error('[diarizer] failed to spawn python', err)
      resolve(null)
      return
    }

    proc.stdout?.on('data', (d: Buffer) => (stdout += d.toString()))
    proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))

    proc.on('error', (err) => {
      console.error('[diarizer] process error', err)
      resolve(null)
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`[diarizer] exited ${code}: ${stderr.slice(-500)}`)
        resolve(null)
        return
      }
      try {
        const segments = JSON.parse(stdout) as DiarSegment[]
        console.log(`[diarizer] parsed ${segments.length} segments`)
        resolve(segments)
      } catch (err) {
        console.error('[diarizer] invalid JSON from diarizer.py', err)
        resolve(null)
      }
    })
  })
}
