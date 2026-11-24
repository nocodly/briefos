import { useCallback, useEffect, useMemo, useState } from 'react'
import type { NavigateFn } from './App'
import { invoke } from './lib/ipc'
import { Page } from './components/Page'
import TaskShare from './components/TaskShare'

// =============================================================================
// Tasks — every action item from every call in one list. Tick them off, or
// share one wherever you keep to-dos: calendar, Telegram, WhatsApp, email.
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

type Filter = 'open' | 'done' | 'all'

const keyOf = (t: Task) => `${t.meetingId}::${t.task}`

export default function Tasks({ navigate }: { navigate: NavigateFn }) {
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [filter, setFilter] = useState<Filter>('open')

  const load = useCallback(() => {
    invoke<Task[]>('tasks:getAll')
      .then((t) => setTasks(t ?? []))
      .catch(() => setTasks([]))
  }, [])
  useEffect(load, [load])

  // Ticking a task: the green check pops in, the row stays a moment so you
  // see it, then slides away (Open view). Each task animates on its own.
  const [ticking, setTicking] = useState<Set<string>>(new Set())
  const [leaving, setLeaving] = useState<Set<string>>(new Set())
  const toggle = async (t: Task) => {
    const k = keyOf(t)
    if (ticking.has(k)) return
    const done = !t.done
    void invoke('tasks:setDone', { meetingId: t.meetingId, task: t.task, done }).catch(load)
    if (done && filter === 'open') {
      setTicking((s) => new Set(s).add(k))
      setTimeout(() => setLeaving((s) => new Set(s).add(k)), 700)
      setTimeout(() => {
        setTasks((cur) => cur?.map((x) => (keyOf(x) === k ? { ...x, done: true } : x)) ?? null)
        setTicking((s) => {
          const n = new Set(s)
          n.delete(k)
          return n
        })
        setLeaving((s) => {
          const n = new Set(s)
          n.delete(k)
          return n
        })
      }, 1050)
      return
    }
    setTasks((cur) => cur?.map((x) => (keyOf(x) === k ? { ...x, done } : x)) ?? null)
  }

  const shown = useMemo(() => {
    const all = tasks ?? []
    if (filter === 'open') return all.filter((t) => !t.done)
    if (filter === 'done') return all.filter((t) => t.done)
    return all
  }, [tasks, filter])

  const openCount = tasks?.filter((t) => !t.done).length ?? 0

  return (
    <Page title="Tasks" subtitle={tasks ? `${openCount} open from ${new Set(tasks.map((t) => t.meetingId)).size} calls` : 'Loading…'}>
      <div className="flex gap-1 rounded-xl bg-white/[.04] p-1">
        {(
          [
            ['open', 'Open'],
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
          {shown.map((t) => {
            const k = keyOf(t)
            const checked = t.done || ticking.has(k)
            const gone = leaving.has(k)
            return (
            <div
              key={k}
              className={`group grid transition-all duration-300 ease-out ${gone ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}
            >
            <div className="overflow-hidden">
            <div className="flex items-start gap-3 px-4 py-3 hover:bg-white/[.03]">
              <button
                onClick={() => void toggle(t)}
                title={t.done ? 'Mark as open' : 'Mark as done'}
                className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-colors duration-200 ${
                  checked ? 'border-green bg-green text-white' : 'border-border hover:border-green/70'
                }`}
              >
                {checked && <i key={String(ticking.has(k))} className="ti ti-check animate-check-pop text-[12px]" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className={`text-[13.5px] transition-colors duration-300 ${checked ? 'text-text-3 line-through' : 'text-text'}`}>{t.task}</div>
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
              {!checked && <TaskShare task={t} />}
            </div>
            </div>
            </div>
            )
          })}
        </div>
      )}

    </Page>
  )
}
