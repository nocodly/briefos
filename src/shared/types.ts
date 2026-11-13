// Shared data shapes used by storage, exporters and reports.

/** One transcript line as stored in SQLite (speaker = "Me" | "Them" | name). */
export interface TranscriptSegment {
  speaker: string
  startMs: number
  endMs: number
  text: string
}

/** Action item as stored in summaries.action_items (used by all exporters). */
export interface ActionItem {
  person: string
  task: string
  deadline: string | null
  priority: 'high' | 'medium' | 'low'
}
