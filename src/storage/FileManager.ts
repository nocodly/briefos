import { rmSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { getDatabase } from './Database'

// =============================================================================
// FileManager — owns on-disk audio lifecycle under %APPDATA%/BriefOS/recordings.
//   recordings/recording_<captureId>.wav   ← full recording (kept locally)
//   recordings/chunks/<meetingId>/         ← transient 30s chunks
// Removes chunk dirs after processing, deletes a meeting's files on delete, and
// enforces the retention window on boot. Audio is NEVER uploaded (critical rule).
// =============================================================================

function recordingsDir(): string {
  return join(app.getPath('userData'), 'recordings')
}

function chunkDir(meetingId: string): string {
  return join(recordingsDir(), 'chunks', meetingId)
}

function safeRemove(path: string): void {
  try {
    if (existsSync(path)) {
      rmSync(path, { recursive: true, force: true })
      console.log('[files] removed', path)
    }
  } catch (err) {
    console.error('[files] failed to remove', path, err)
  }
}

/** Delete the transient chunk directory for a meeting (after transcription). */
export function cleanupChunks(meetingId: string): void {
  safeRemove(chunkDir(meetingId))
}

/** Delete a meeting's audio file + chunk dir. audioPath comes from the DB row. */
export function deleteMeetingFiles(meetingId: string, audioPath?: string | null): void {
  if (audioPath) safeRemove(audioPath)
  safeRemove(chunkDir(meetingId))
}

/**
 * Delete meetings (and their files) older than retentionDays. retentionDays <= 0
 * disables retention (keep everything). Runs on app start.
 */
export function enforceRetention(retentionDays: number): void {
  if (!retentionDays || retentionDays <= 0) return
  const db = getDatabase()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - retentionDays)
  const cutoffIso = cutoff.toISOString()

  const all = db.getAllMeetings({ limit: 100000 }) as Record<string, any>[]
  const stale = all.filter((m) => String(m.started_at) < cutoffIso)
  if (stale.length === 0) return

  console.log(`[files] retention: removing ${stale.length} meetings older than ${cutoffIso}`)
  for (const m of stale) {
    deleteMeetingFiles(m.id as string, (m.audio_path as string) ?? null)
    db.deleteMeeting(m.id as string)
  }
}

/** Best-effort total bytes used by recordings (for a Settings storage readout). */
export function recordingsDiskUsage(): number {
  const dir = recordingsDir()
  if (!existsSync(dir)) return 0
  try {
    return statSync(dir).size
  } catch {
    return 0
  }
}
