import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

// =============================================================================
// SummaryEngine — generates a structured meeting summary.
// Provider selection (called once at construction):
//   1. anthropicApiKey set → Anthropic claude-sonnet-4-5  (user's own key)
//   2. otherwise           → OpenAI gpt-4o                (owner's key / user's key)
// Both providers return the same MeetingSummary JSON schema.
// Parse failures retry exactly once with a stronger JSON-only instruction.
// =============================================================================

const ANTHROPIC_MODEL_DEFAULT = 'claude-sonnet-4-5'
const OPENAI_MODEL_DEFAULT = 'gpt-4o'
const MAX_TOKENS = 2000

const PROMPT_FILES: Record<string, string> = {
  standup: 'standup.md',
  sales: 'sales-call.md',
  onboarding: 'default.md',
  review: 'default.md',
  strategy: 'default.md',
  auto: 'default.md',
  default: 'default.md'
}

export interface ActionItem {
  person: string
  task: string
  deadline: string | null
  priority: 'high' | 'medium' | 'low'
}

export interface MeetingSummary {
  title: string
  type: string
  language: string
  tldr: string
  context: string
  decisions: string[]
  actionItems: ActionItem[]
  openQuestions: string[]
  sentiment: { positive: number; neutral: number; tense: number }
  keywords: string[]
}

type Provider =
  | { type: 'anthropic'; client: Anthropic; model: string }
  | { type: 'openai'; client: OpenAI; model: string }

export class SummaryEngine {
  private provider: Provider

  constructor(opts: { anthropicApiKey?: string; openaiApiKey: string; model?: string }) {
    if (opts.anthropicApiKey) {
      const model = opts.model || ANTHROPIC_MODEL_DEFAULT
      console.log(`[summary] using Anthropic ${model} (user key)`)
      this.provider = { type: 'anthropic', model, client: new Anthropic({ apiKey: opts.anthropicApiKey }) }
    } else {
      const model = opts.model || OPENAI_MODEL_DEFAULT
      console.log(`[summary] using OpenAI ${model}`)
      this.provider = { type: 'openai', model, client: new OpenAI({ apiKey: opts.openaiApiKey }) }
    }
  }

  private promptsDir(): string {
    return app.isPackaged
      ? join(process.resourcesPath, 'prompts')
      : join(app.getAppPath(), 'src', 'ai', 'prompts')
  }

  private loadPrompt(type: string): string {
    const file = PROMPT_FILES[type] ?? 'default.md'
    let promptPath = join(this.promptsDir(), file)
    if (!existsSync(promptPath)) {
      console.warn(`[summary] prompt ${file} missing, using default.md`)
      promptPath = join(this.promptsDir(), 'default.md')
    }
    return readFileSync(promptPath, 'utf8')
  }

  async generateSummary(transcript: string, meetingType = 'auto'): Promise<MeetingSummary> {
    const provider = this.provider.type
    console.log(`[summary] generating via ${provider} (type=${meetingType}, ${transcript.length} chars)`)
    if (!transcript.trim()) throw new Error('Cannot summarize an empty transcript')

    const systemPrompt = this.loadPrompt(meetingType)

    let raw = await this.call(systemPrompt, transcript)
    try {
      return this.parseAndValidate(raw)
    } catch (err) {
      console.warn('[summary] first parse failed, retrying once:', (err as Error).message)
      raw = await this.call(
        systemPrompt +
          '\n\nIMPORTANT: Return ONLY the raw JSON object. No markdown, no code fences, no commentary.',
        transcript
      )
      return this.parseAndValidate(raw)
    }
  }

  private async call(systemPrompt: string, userContent: string): Promise<string> {
    try {
      if (this.provider.type === 'anthropic') {
        const res = await this.provider.client.messages.create({
          model: this.provider.model,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          messages: [{ role: 'user', content: `Here is the meeting transcript:\n\n${userContent}` }]
        })
        const block = res.content[0]
        if (!block || block.type !== 'text') throw new Error('Anthropic returned no text content')
        return block.text
      } else {
        const res = await this.provider.client.chat.completions.create({
          model: this.provider.model,
          max_tokens: MAX_TOKENS,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Here is the meeting transcript:\n\n${userContent}` }
          ]
        })
        const content = res.choices[0]?.message?.content
        if (!content) throw new Error('OpenAI returned no content')
        return content
      }
    } catch (err) {
      console.error(`[summary] ${this.provider.type} API error`, err)
      throw new Error(`${this.provider.type} API call failed: ${(err as Error).message}`)
    }
  }

  private parseAndValidate(raw: string): MeetingSummary {
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
        `Invalid JSON from AI: ${(err as Error).message}\nRaw: ${raw.slice(0, 200)}`
      )
    }

    const sentiment = (parsed.sentiment as MeetingSummary['sentiment']) ?? {
      positive: 0, neutral: 100, tense: 0
    }

    return {
      title: String(parsed.title ?? 'Untitled Meeting'),
      type: String(parsed.type ?? 'other'),
      language: String(parsed.language ?? 'en'),
      tldr: String(parsed.tldr ?? ''),
      context: String(parsed.context ?? ''),
      decisions: Array.isArray(parsed.decisions) ? (parsed.decisions as string[]) : [],
      actionItems: Array.isArray(parsed.actionItems) ? (parsed.actionItems as ActionItem[]) : [],
      openQuestions: Array.isArray(parsed.openQuestions) ? (parsed.openQuestions as string[]) : [],
      sentiment,
      keywords: Array.isArray(parsed.keywords) ? (parsed.keywords as string[]) : []
    }
  }
}
