import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { invoke, subscribe } from '../lib/ipc'

// =============================================================================
// Agent hand-off UI — send a task from a meeting to the user's own Claude Code
// or Codex (run locally by the main process, see src/main/AgentRunner.ts).
//
//   <SendToAgentModal task context />   confirm + edit the exact prompt, send
//   <AgentRuns />                       live output of running / finished tasks
//   initAgentEvents()                   call once (App) to stream output
// =============================================================================

export type AgentId = 'claude' | 'codex'

export interface AgentInfo {
  id: AgentId
  name: string
  installed: boolean
  version: string | null
}

export interface AgentRun {
  runId: string
  agent: AgentId
  task: string
  status: 'running' | 'done' | 'failed'
  output: string
  startedAt: number
}

export const AGENT_NAMES: Record<AgentId, string> = { claude: 'Claude Code', codex: 'Codex' }

export const useAgentRuns = create<{ runs: AgentRun[] }>(() => ({ runs: [] }))

let wired = false
export function initAgentEvents(): () => void {
  if (wired) return () => {}
  wired = true
  const unsubs = [
    subscribe('agent:output', ({ runId, chunk }: { runId: string; chunk: string }) => {
      useAgentRuns.setState(({ runs }) => ({
        runs: runs.map((r) => (r.runId === runId ? { ...r, output: (r.output + chunk).slice(-40_000) } : r))
      }))
    }),
    subscribe('agent:done', ({ runId, ok }: { runId: string; ok: boolean }) => {
      useAgentRuns.setState(({ runs }) => ({
        runs: runs.map((r): AgentRun => (r.runId === runId ? { ...r, status: ok ? 'done' : 'failed' } : r))
      }))
    })
  ]
  return () => {
    wired = false
    unsubs.forEach((u) => u())
  }
}

export async function detectAgents(): Promise<{ agents: AgentInfo[]; workdir: string }> {
  return invoke<{ agents: AgentInfo[]; workdir: string }>('agent:detect')
}

/** Context about the meeting that goes along with the task. */
export interface MeetingContext {
  title: string
  date?: string
  notes?: string
  transcript?: { speaker: string; text: string }[]
}

export function buildAgentPrompt(task: string, ctx: MeetingContext): string {
  const transcript = (ctx.transcript ?? [])
    .slice(-80)
    .map((l) => `${l.speaker}: ${l.text}`)
    .join('\n')
    .slice(-12_000)
  return [
    'You are helping the user follow up on a meeting they recorded with Minutama.',
    '',
    `TASK: ${task.trim()}`,
    '',
    `MEETING: ${ctx.title}${ctx.date ? ` (${ctx.date})` : ''}`,
    ctx.notes?.trim() ? `\nMEETING NOTES:\n${ctx.notes.trim().slice(0, 12_000)}` : '',
    transcript ? `\nTRANSCRIPT (latest part; "Me" is the user):\n${transcript}` : '',
    '',
    'Do the task with the tools you have. If something is unclear or you lack a permission or tool,',
    'say exactly what you need instead of guessing. End with a short summary of what you did.'
  ]
    .filter((l) => l !== '')
    .join('\n')
}

// ─── Confirm + send modal ───────────────────────────────────────────────────

export function SendToAgentModal({
  task,
  context,
  onClose
}: {
  task: string
  context: MeetingContext
  onClose: () => void
}) {
  const [agents, setAgents] = useState<AgentInfo[] | null>(null)
  const [agent, setAgent] = useState<AgentId>('claude')
  const [prompt, setPrompt] = useState(() => buildAgentPrompt(task, context))
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    Promise.all([detectAgents(), invoke<AgentId>('settings:get', 'agentProvider').catch(() => 'claude' as AgentId)])
      .then(([d, preferred]) => {
        setAgents(d.agents)
        const ready = d.agents.filter((a) => a.installed)
        setAgent(ready.find((a) => a.id === preferred)?.id ?? ready[0]?.id ?? preferred)
      })
      .catch((e) => setError((e as Error).message))
  }, [])

  const send = async () => {
    setSending(true)
    setError('')
    try {
      const { runId } = await invoke<{ runId: string }>('agent:run', { prompt, agent })
      useAgentRuns.setState(({ runs }) => ({
        runs: [{ runId, agent, task, status: 'running' as const, output: '', startedAt: Date.now() }, ...runs].slice(0, 20)
      }))
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setSending(false)
    }
  }

  const installed = agents?.filter((a) => a.installed) ?? []

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 backdrop-blur-sm p-6 font-body">
      <div className="glass-strong w-full max-w-[560px] rounded-modal p-6 animate-fade-up">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-accent-soft flex items-center justify-center">
            <i className="ti ti-robot text-[18px] text-accent" />
          </div>
          <div className="flex-1">
            <h3 className="font-display font-bold text-[18px]">Send to your agent</h3>
            <p className="text-[12px] text-text-3">Runs on this computer with your own account and tools.</p>
          </div>
          <button onClick={onClose} className="text-text-3 hover:text-text">
            <i className="ti ti-x text-[18px]" />
          </button>
        </div>

        {agents === null ? (
          <div className="py-8 text-center text-text-3 text-[13px]">
            <i className="ti ti-loader-2 animate-spin-slow" /> Looking for Claude Code and Codex…
          </div>
        ) : installed.length === 0 ? (
          <div className="mt-5 rounded-card bg-amber-soft border border-amber/30 p-4 text-[13px] text-text-2">
            No agent found on this computer. Install{' '}
            <button className="underline" onClick={() => window.open('https://claude.com/claude-code', '_blank')}>
              Claude Code
            </button>{' '}
            or{' '}
            <button className="underline" onClick={() => window.open('https://developers.openai.com/codex/cli', '_blank')}>
              Codex CLI
            </button>
            , sign in once in the terminal, then come back.
          </div>
        ) : (
          <>
            <div className="mt-5 flex gap-2">
              {(agents ?? []).map((a) => (
                <button
                  key={a.id}
                  disabled={!a.installed}
                  onClick={() => setAgent(a.id)}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-left transition-all disabled:opacity-40 ${
                    agent === a.id ? 'border-accent bg-accent-soft/70' : 'border-border bg-white/60 hover:bg-white'
                  }`}
                >
                  <div className="text-[13px] font-semibold">{a.name}</div>
                  <div className="text-[11px] text-text-3 truncate">{a.installed ? a.version ?? 'Ready' : 'Not installed'}</div>
                </button>
              ))}
            </div>

            <label className="mt-4 block text-[12px] font-medium text-text-2">What the agent will receive (you can edit)</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={9}
              className="mt-1.5 w-full rounded-xl border border-border bg-white/70 px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-text focus:border-accent focus:outline-none"
            />
          </>
        )}

        {error && <div className="mt-3 text-[12px] text-red">{error}</div>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-[13px] text-text-2 hover:bg-white/60">
            Cancel
          </button>
          <button
            onClick={send}
            disabled={sending || installed.length === 0 || !prompt.trim()}
            className="btn-accent rounded-xl px-4 py-2 text-[13px] font-semibold flex items-center gap-1.5 disabled:opacity-50"
          >
            <i className="ti ti-send text-[14px]" /> Send to {AGENT_NAMES[agent]}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Runs list ──────────────────────────────────────────────────────────────

export function AgentRuns({ compact = false }: { compact?: boolean }) {
  const runs = useAgentRuns((s) => s.runs)
  const [open, setOpen] = useState<string | null>(null)
  if (runs.length === 0) return null

  return (
    <div className="space-y-2">
      {runs.map((r) => {
        const expanded = open === r.runId || (!compact && r.status === 'running')
        return (
          <div key={r.runId} className="rounded-card border border-border-soft bg-white/60">
            <button
              onClick={() => setOpen(open === r.runId ? null : r.runId)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left"
            >
              {r.status === 'running' ? (
                <i className="ti ti-loader-2 animate-spin-slow text-accent text-[15px]" />
              ) : r.status === 'done' ? (
                <i className="ti ti-circle-check-filled text-green text-[15px]" />
              ) : (
                <i className="ti ti-alert-circle-filled text-red text-[15px]" />
              )}
              <span className="flex-1 truncate text-[12.5px] font-medium">{r.task}</span>
              <span className="text-[10.5px] text-text-3">{AGENT_NAMES[r.agent]}</span>
            </button>
            {expanded && (
              <div className="border-t border-border-soft px-3 py-2">
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-text-2">
                  {r.output || 'Starting…'}
                </pre>
                {r.status === 'running' && (
                  <button
                    onClick={() => invoke('agent:cancel', r.runId).catch(() => {})}
                    className="mt-1 text-[11px] text-red hover:underline"
                  >
                    Stop
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
