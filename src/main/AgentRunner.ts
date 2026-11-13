import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { getSetting } from './store'

// =============================================================================
// AgentRunner — hands a task from a meeting to the user's own coding agent:
// Claude Code (`claude -p`) or OpenAI Codex (`codex exec`), installed and signed
// in on this computer. The agent runs with the user's subscription and every
// tool/MCP server they configured for it.
//
// Safety:
// - The prompt goes over STDIN, never on the command line, so nothing the
//   meeting said can be interpreted by the shell.
// - 'safe' autonomy (default): Claude Code's normal permission mode (anything
//   not pre-approved in the user's own Claude settings is denied) / Codex
//   read-only sandbox. 'full': Claude may edit files (acceptEdits) / Codex
//   --full-auto. Never "bypass permissions".
// - The renderer shows the exact prompt and asks before calling agent:run.
// =============================================================================

export type AgentId = 'claude' | 'codex'

export interface AgentInfo {
  id: AgentId
  name: string
  installed: boolean
  version: string | null
  path: string | null
}

const NAMES: Record<AgentId, string> = { claude: 'Claude Code', codex: 'Codex' }
const TIMEOUT_MS = 15 * 60 * 1000

function run(cmd: string, args: string[], timeout = 15_000): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout, shell: process.platform === 'win32' }, (err, stdout) =>
      resolve(err ? null : String(stdout).trim())
    )
  })
}

async function locate(bin: AgentId): Promise<string | null> {
  const out = await run(process.platform === 'win32' ? 'where.exe' : 'which', [bin])
  if (!out) return null
  const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  // Prefer the Windows shim (.cmd/.exe) over the extension-less POSIX script.
  return lines.find((l) => /\.(cmd|exe)$/i.test(l)) ?? lines[0] ?? null
}

export async function detectAgents(): Promise<AgentInfo[]> {
  const ids: AgentId[] = ['claude', 'codex']
  return Promise.all(
    ids.map(async (id) => {
      const path = await locate(id)
      const version = path ? await run(`"${path}"`, ['--version']) : null
      return { id, name: NAMES[id], installed: Boolean(path), version: version?.split(/\r?\n/)[0] ?? null, path }
    })
  )
}

export function agentWorkdir(): string {
  const dir = getSetting('agentWorkdir') || join(app.getPath('documents'), 'Minutama')
  mkdirSync(dir, { recursive: true })
  return dir
}

function argsFor(id: AgentId, autonomy: 'safe' | 'full'): string[] {
  if (id === 'claude') {
    return ['-p', '--output-format', 'text', '--permission-mode', autonomy === 'full' ? 'acceptEdits' : 'default']
  }
  return ['exec', '--skip-git-repo-check', ...(autonomy === 'full' ? ['--full-auto'] : ['--sandbox', 'read-only']), '-']
}

/** With shell:true the child is cmd.exe; kill the whole tree on Windows. */
function killTree(child: ChildProcess): void {
  if (process.platform === 'win32' && child.pid) {
    execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {})
  } else {
    child.kill()
  }
}

interface Run {
  child: ChildProcess
  output: string
}
const runs = new Map<string, Run>()

export interface AgentRunEvents {
  onOutput: (runId: string, chunk: string) => void
  onDone: (runId: string, result: { ok: boolean; code: number | null; output: string }) => void
}

/** Start the agent on a task; returns the run id. Output streams via events. */
export async function startAgentRun(prompt: string, events: AgentRunEvents, agent?: AgentId): Promise<string> {
  const id: AgentId = agent ?? getSetting('agentProvider') ?? 'claude'
  const path = await locate(id)
  if (!path) {
    throw new Error(
      id === 'claude'
        ? 'Claude Code is not installed. Install it from claude.com/claude-code, sign in once, then try again.'
        : 'Codex is not installed. Install the Codex CLI, sign in once, then try again.'
    )
  }
  const runId = `${id}-${Date.now().toString(36)}`
  const cwd = agentWorkdir()
  const autonomy = getSetting('agentAutonomy') === 'full' ? 'full' : 'safe'
  console.log('[agent] start', runId, id, autonomy, cwd)

  // shell:true is required to launch .cmd shims on Windows; the arguments are
  // fixed strings and the task itself is written to stdin.
  const child = spawn(`"${path}"`, argsFor(id, autonomy), {
    cwd,
    shell: process.platform === 'win32',
    windowsHide: true,
    env: process.env
  })
  const entry: Run = { child, output: '' }
  runs.set(runId, entry)

  const push = (buf: Buffer) => {
    const chunk = buf.toString('utf8')
    entry.output += chunk
    events.onOutput(runId, chunk)
  }
  child.stdout?.on('data', push)
  child.stderr?.on('data', push)

  const timer = setTimeout(() => {
    push(Buffer.from('\n[Minutama] Stopped after 15 minutes.\n'))
    killTree(child)
  }, TIMEOUT_MS)

  child.on('close', (code) => {
    clearTimeout(timer)
    runs.delete(runId)
    console.log('[agent] done', runId, code)
    events.onDone(runId, { ok: code === 0, code, output: entry.output })
  })
  child.on('error', (err) => push(Buffer.from(`\n[Minutama] ${err.message}\n`)))

  child.stdin?.write(prompt)
  child.stdin?.end()
  return runId
}

export function cancelAgentRun(runId: string): boolean {
  const r = runs.get(runId)
  if (!r) return false
  killTree(r.child)
  return true
}
