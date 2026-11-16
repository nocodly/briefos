import { getDatabase, type BriefOSDatabase } from '@storage/Database'

// =============================================================================
// PeriodReportEngine — pulls every meeting summary in a date range from SQLite,
// sends them to the Minutama server as one batch, and returns a cross-meeting intelligence
// report. Saved to period_reports so the user can revisit without regenerating.
// =============================================================================

const SERVER_TIMEOUT_MS = 120_000

export interface PeriodReportResult {
  reportId: string
  meetingCount: number
  executiveSummary: string
  mainThemes: string[]
  allDecisions: { decision: string; meeting: string; date: string }[]
  openActions: {
    person: string
    task: string
    deadline: string | null
    priority: 'high' | 'medium' | 'low'
    sourceMeeting: string
    sourceDate?: string
  }[]
  recurringQuestions: { question: string; appearedIn: string[] }[]
  topTopics: { topic: string; count: number }[]
  speakerStats: { name: string; totalMinutes: number; percentage: number }[]
  aiInsights: { type: 'pattern' | 'warning' | 'opportunity'; text: string }[]
  keywords: string[]
}

export interface GenerateArgs {
  from: string
  to: string
  label: string
  onProgress?: (step: string) => void
}

export class PeriodReportEngine {
  private db: BriefOSDatabase

  /** The AI step runs on the Minutama server with the user's session token. */
  constructor(private server: { url: string; anonKey: string; accessToken: string }) {
    if (!server.url || !server.accessToken) throw new Error('Please sign in again.')
    this.db = getDatabase()
  }

  async generate({ from, to, label, onProgress }: GenerateArgs): Promise<PeriodReportResult> {
    console.log(`[period] generating report "${label}" (${from} → ${to})`)

    onProgress?.('Loading meetings from database…')
    const meetings = this.db.getMeetingsInRange(from, to)

    if (meetings.length === 0) {
      throw new Error(`No meetings found between ${from} and ${to}`)
    }

    onProgress?.(`Aggregating ${meetings.length} meetings…`)
    const context = meetings.map((m) => ({
      title: m.title,
      date: m.started_at,
      durationMinutes: Math.round(((m.duration_s as number) ?? 0) / 60),
      notes: String(m.enhanced_notes ?? m.user_notes ?? '').slice(0, 3000),
      tldr: m.tldr,
      decisions: m.decisions,
      actionItems: m.action_items,
      openQuestions: m.open_questions,
      keywords: m.keywords
    }))

    onProgress?.('Analyzing the period on Minutama servers…')
    const report = this.normalize(await this.callServer({ label, from, to, meetings: context }))

    onProgress?.('Saving report…')
    const totalDurationS = meetings.reduce(
      (sum, m) => sum + ((m.duration_s as number) ?? 0),
      0
    )
    const meetingIds = meetings.map((m) => m.id as string)

    const reportId = this.db.savePeriodReport({
      label,
      from,
      to,
      meetingIds,
      totalDurationS,
      executiveSummary: report.executiveSummary,
      mainThemes: report.mainThemes,
      allDecisions: report.allDecisions,
      openActions: report.openActions,
      recurringQuestions: report.recurringQuestions,
      topTopics: report.topTopics,
      speakerStats: report.speakerStats,
      aiInsights: report.aiInsights,
      keywords: report.keywords
    })

    console.log('[period] report saved', reportId)
    return { reportId, meetingCount: meetings.length, ...report }
  }

  private async callServer(body: unknown): Promise<Record<string, unknown>> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), SERVER_TIMEOUT_MS)
    try {
      const res = await fetch(`${this.server.url}/functions/v1/period-report`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.server.accessToken}`,
          apikey: this.server.anonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: ctrl.signal
      })
      const payload = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
        error?: { message?: string }
      }
      if (!res.ok) throw new Error(payload.error?.message ?? `Request failed (${res.status}).`)
      return payload
    } catch (err) {
      console.error('[period] server error', err)
      if ((err as Error).name === 'AbortError') throw new Error('The report took too long. Try a shorter period.')
      if (err instanceof TypeError) throw new Error('No connection to Minutama servers.')
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  private normalize(parsed: Record<string, unknown>): Omit<PeriodReportResult, 'reportId' | 'meetingCount'> {
    const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
    return {
      executiveSummary: String(parsed.executiveSummary ?? ''),
      mainThemes: arr<string>(parsed.mainThemes),
      allDecisions: arr(parsed.allDecisions),
      openActions: arr(parsed.openActions),
      recurringQuestions: arr(parsed.recurringQuestions),
      topTopics: arr(parsed.topTopics),
      speakerStats: arr(parsed.speakerStats),
      aiInsights: arr(parsed.aiInsights),
      keywords: arr<string>(parsed.keywords)
    }
  }
}
