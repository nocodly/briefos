import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { getDatabase, type BriefOSDatabase } from '@storage/Database'

// =============================================================================
// PeriodReportEngine — pulls every meeting summary in a date range from SQLite,
// sends them to GPT-4o as one batch, and returns a cross-meeting intelligence
// report. Saved to period_reports so the user can revisit without regenerating.
// Uses OpenAI (same key as transcription) — no separate Anthropic key needed.
// =============================================================================

const OPENAI_MODEL_DEFAULT = 'gpt-4o'
const ANTHROPIC_MODEL_DEFAULT = 'claude-sonnet-4-5'
const MAX_TOKENS = 4000

type Provider =
  | { type: 'anthropic'; client: Anthropic; model: string }
  | { type: 'openai'; client: OpenAI; model: string }

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
  private provider: Provider
  private db: BriefOSDatabase

  constructor(opts: { anthropicApiKey?: string; openaiApiKey: string; model?: string }) {
    if (opts.anthropicApiKey) {
      const model = opts.model || ANTHROPIC_MODEL_DEFAULT
      console.log(`[period] using Anthropic ${model}`)
      this.provider = { type: 'anthropic', model, client: new Anthropic({ apiKey: opts.anthropicApiKey }) }
    } else {
      const model = opts.model || OPENAI_MODEL_DEFAULT
      console.log(`[period] using OpenAI ${model}`)
      this.provider = { type: 'openai', model, client: new OpenAI({ apiKey: opts.openaiApiKey }) }
    }
    this.db = getDatabase()
  }

  private loadPrompt(): string {
    const dir = app.isPackaged
      ? join(process.resourcesPath, 'prompts')
      : join(app.getAppPath(), 'src', 'ai', 'prompts')
    const path = join(dir, 'period-report.md')
    if (!existsSync(path)) throw new Error(`period-report.md prompt not found at ${path}`)
    return readFileSync(path, 'utf8')
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
      tldr: m.tldr,
      decisions: m.decisions,
      actionItems: m.action_items,
      openQuestions: m.open_questions,
      keywords: m.keywords
    }))

    onProgress?.('Sending to GPT-4o for cross-meeting analysis…')
    const systemPrompt = this.loadPrompt()
    const userContent = `Period: ${label}\nDate range: ${from} to ${to}\nTotal meetings: ${meetings.length}\n\n${JSON.stringify(
      context,
      null,
      2
    )}`

    const raw = await this.callAI(systemPrompt, userContent)

    onProgress?.('Parsing and saving report…')
    let report: Omit<PeriodReportResult, 'reportId' | 'meetingCount'>
    try {
      report = this.parseJSON(raw)
    } catch (err) {
      console.warn('[period] first parse failed, retrying once:', (err as Error).message)
      const retry = await this.callAI(
        systemPrompt +
          '\n\nIMPORTANT: Return ONLY the raw JSON object. No markdown, no code fences, no commentary.',
        userContent
      )
      report = this.parseJSON(retry)
    }

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

  private async callAI(systemPrompt: string, userContent: string): Promise<string> {
    try {
      if (this.provider.type === 'anthropic') {
        const res = await this.provider.client.messages.create({
          model: this.provider.model,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          messages: [{ role: 'user', content: userContent }]
        })
        const block = res.content[0]
        if (!block || block.type !== 'text') throw new Error('Anthropic returned no text')
        return block.text
      } else {
        const res = await this.provider.client.chat.completions.create({
          model: this.provider.model,
          max_tokens: MAX_TOKENS,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
          ]
        })
        const content = res.choices[0]?.message?.content
        if (!content) throw new Error('OpenAI returned no content')
        return content
      }
    } catch (err) {
      console.error(`[period] ${this.provider.type} API error`, err)
      throw new Error(`${this.provider.type} API call failed: ${(err as Error).message}`)
    }
  }

  private parseJSON(raw: string): Omit<PeriodReportResult, 'reportId' | 'meetingCount'> {
    const clean = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(clean)
    } catch (err) {
      throw new Error(
        `AI returned invalid JSON: ${(err as Error).message}\nRaw: ${raw.slice(0, 200)}`
      )
    }

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
