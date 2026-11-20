import { useCallback, useEffect, useMemo, useState } from 'react'
import type { NavigateFn } from './App'
import { invoke } from './lib/ipc'
import { Page } from './components/Page'
import { AgentRuns, SendToAgentModal, useAgentRuns } from './components/Agent'

// =============================================================================
// Tasks — every action item from every meeting in one list. Tick them off,
// or hand one to Claude Code / Codex with the meeting as context.
// =============================================================================

interface Task {
  meetingId: string
  meetingTitle: string
  startedAt: string
  task: string
  person: string
  deadline: string | null
  dueDate?: string | null
  done: boolean
}

type Filter = 'open' | 'mine' | 'done' | 'all'

export default function Tasks({ navigate }: { navigate: NavigateFn }) {
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [filter, setFilter] = useState<Filter>('open')
  const runCount = useAgentRuns((st) => st.runs.length)
  const [agentTask, setAgentTask] = useState<Task | null>(null)
  const [context, setContext] = useState<{ notes: string; transcript: { speaker: string; text: string }[] } | null>(null)

  const load = useCallback(() => {
    invoke<Task[]>('tasks:getAll')
      .then((t) => setTasks(t ?? []))
      .catch(() => setTasks([]))
  }, [])
  useEffect(load, [load])

  const toggle = async (t: Task) => {
    setTasks((cur) => cur?.map((x) => (x === t ? { ...x, done: !x.done } : x)) ?? null)
    await invoke('tasks:setDone', { meetingId: t.meetingId, task: t.task, done: !t.done }).catch(load)
  }

  const openAgent = async (t: Task) => {
    const m = await invoke<{
      enhanced_notes?: string | null
      user_notes?: string | null
      transcript?: { speaker: string; text: string }[]
    }>('meetings:getOne', t.meetingId).catch(() => null)
    setContext({
      notes: m?.enhanced_notes ?? m?.user_notes ?? '',
      transcript: (m?.transcript ?? []).map((r) => ({ speaker: r.speaker, text: r.text }))
    })
    setAgentTask(t)
  }

  const shown = useMemo(() => {
    const all = tasks ?? []
    if (filter === 'open') return all.filter((t) => !t.done)
    if (filter === 'done') return all.filter((t) => t.done)
    if (filter === 'mine') return all.filter((t) => !t.done && /^(me|я|i)$/i.test(t.person.trim()))
    return all
  }, [tasks, filter])

  const openCount = tasks?.filter((t) => !t.done).length ?? 0

  return (
    <Page title="Tasks" subtitle={tasks ? `${openCount} open from ${new Set(tasks.map((t) => t.meetingId)).size} calls` : 'Loading…'}>
      <div className="flex gap-1 rounded-xl bg-white/[.04] p-1">
        {(
          [
            ['open', 'Open'],
            ['mine', 'Mine'],
            ['done', 'Done'],
            ['all', 'All']
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`flex-1 rounded-lg py-2 text-[12.5px] font-semibold ${
              filter === id ? 'bg-white/[.1] text-text' : 'text-text-3 hover:text-text-2'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tasks !== null && shown.length === 0 ? (
        <div className="glass rounded-panel p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-panel bg-accent-soft">
            <i className="ti ti-checklist text-[22px] text-accent" />
          </div>
          <div className="font-display text-[16px] font-bold">{filter === 'done' ? 'Nothing done yet' : 'No open tasks'}</div>
          <p className="mt-1 text-[12.5px] text-text-3">Tasks from your calls appear here automatically.</p>
        </div>
      ) : (
        <div className="glass divide-y divide-border-soft overflow-hidden rounded-panel">
          {shown.map((t, i) => (
            <div key={`${t.meetingId}-${i}`} className="group flex items-start gap-3 px-4 py-3 hover:bg-white/[.03]">
              <button
                onClick={() => void toggle(t)}
                title={t.done ? 'Mark as open' : 'Mark as done'}
                className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border ${
                  t.done ? 'border-green bg-green text-white' : 'border-border hover:border-accent'
                }`}
              >
                {t.done && <i className="ti ti-check text-[12px]" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className={`text-[13.5px] ${t.done ? 'text-text-3 line-through' : 'text-text'}`}>{t.task}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-text-3">
                  {t.person && <span className="font-medium text-text-2">{t.person}</span>}
                  {(t.dueDate || t.deadline) && (
                    <span>
                      <i className="ti ti-calendar text-[11px]" />{' '}
                      {t.dueDate
                        ? new Date(`${t.dueDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
                        : t.deadline}
                    </span>
                  )}
                  <button onClick={() => navigate('meeting', t.meetingId)} className="truncate hover:text-accent-ink">
                    {t.meetingTitle} · {new Date(t.startedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                  </button>
                </div>
              </div>
              {!t.done && t.dueDate && (
                <button
                  onClick={() =>
                    void invoke('calendar:add', {
                      title: t.task,
                      date: t.dueDate,
                      details: `From the call: ${t.meetingTitle}`,
                      target: 'google'
                    }).catch(() => {})
                  }
                  title="Add to Google Calendar"
                  className="flex-shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] font-medium text-text-2 hover:border-accent/50 hover:text-accent-ink"
                >
                  <i className="ti ti-calendar-plus text-[12px]" /> Add to calendar
                </button>
              )}
              {!t.done && (
                <button
                  onClick={() => void openAgent(t)}
                  className="flex-shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] font-medium text-text-2 opacity-0 hover:border-accent/50 hover:text-accent-ink group-hover:opacity-100"
                >
                  <i className="ti ti-send text-[12px]" /> Send to agent
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Only for people who use the (advanced) coding agent. */}
      {runCount > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.1em] text-text-3">
            <i className="ti ti-robot text-[14px] text-accent" /> Agent activity
          </div>
          <AgentRuns compact />
        </div>
      )}

      {agentTask && context && (
        <SendToAgentModal
          task={agentTask.task}
          context={{
            title: agentTask.meetingTitle,
            date: new Date(agentTask.startedAt).toLocaleDateString(),
            notes: context.notes,
            transcript: context.transcript
          }}
          onClose={() => setAgentTask(null)}
        />
      )}
    </Page>
  )
}
