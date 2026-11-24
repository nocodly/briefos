import { useEffect, useRef, useState } from 'react'
import { invoke } from '../lib/ipc'

// Share one task wherever the user keeps their to-dos: calendar, a messenger,
// email, or just copy it. Each target opens its own app/screen — the user
// picks the chat or the day there; nothing is sent without them.

export interface ShareableTask {
  task: string
  /** Resolved date (YYYY-MM-DD) or null. */
  dueDate?: string | null
  /** As said in the call ("by Friday"). */
  deadline?: string | null
  person?: string
  meetingTitle: string
}

function dateLabel(t: ShareableTask): string | null {
  if (t.dueDate) {
    return new Date(`${t.dueDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
  }
  return t.deadline || null
}

/** "Send the estimate — due Fri, Nov 27 (from: Coffee shop website)". */
function taskText(t: ShareableTask): string {
  const due = dateLabel(t)
  return `${t.task}${due ? ` — due ${due}` : ''}\n(from the call: ${t.meetingTitle})`
}

type Target = { id: string; icon: string; label: string; run: () => Promise<string | null> }

export default function TaskShare({ task, compact = false }: { task: ShareableTask; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const text = taskText(task)
  const details = `From the call: ${task.meetingTitle}`
  const targets: Target[] = [
    {
      id: 'google',
      icon: 'brand-google',
      label: 'Google Calendar',
      run: async () => {
        await invoke('calendar:add', { title: task.task, date: task.dueDate ?? '', details, target: 'google' })
        return null
      }
    },
    {
      id: 'ics',
      icon: 'calendar-plus',
      label: 'Outlook / Windows calendar',
      run: async () => {
        await invoke('calendar:add', { title: task.task, date: task.dueDate ?? '', details, target: 'ics' })
        return 'Opened in your calendar app'
      }
    },
    {
      id: 'telegram',
      icon: 'brand-telegram',
      label: 'Telegram',
      run: async () => {
        await invoke('share:task', { target: 'telegram', text })
        return null
      }
    },
    {
      id: 'whatsapp',
      icon: 'brand-whatsapp',
      label: 'WhatsApp',
      run: async () => {
        await invoke('share:task', { target: 'whatsapp', text })
        return null
      }
    },
    {
      id: 'email',
      icon: 'mail',
      label: 'Email',
      run: async () => {
        await invoke('share:task', { target: 'email', text, subject: task.task })
        return null
      }
    },
    {
      id: 'copy',
      icon: 'copy',
      label: 'Copy text',
      run: async () => {
        await navigator.clipboard.writeText(text)
        return 'Copied — paste it anywhere'
      }
    }
  ]

  const pick = async (t: Target) => {
    setOpen(false)
    try {
      const msg = await t.run()
      if (msg) {
        setFlash(msg)
        setTimeout(() => setFlash(null), 2500)
      }
    } catch (err) {
      setFlash((err as Error).message)
      setTimeout(() => setFlash(null), 3500)
    }
  }

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Add to calendar, send to Telegram, WhatsApp, email…"
        className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium transition-all ${
          open ? 'border-accent/60 text-accent-ink' : 'border-border text-text-2 hover:border-accent/50 hover:text-accent-ink'
        }`}
      >
        <i className="ti ti-share-3 text-[13px]" />
        {!compact && 'Share'}
      </button>
      {flash && (
        <div className="absolute right-0 top-full z-30 mt-1 whitespace-nowrap rounded-lg border border-green/30 bg-green-soft px-2.5 py-1 text-[11px] text-green">
          {flash}
        </div>
      )}
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-[230px] rounded-xl border border-border bg-[#17181C] p-1 shadow-xl animate-fade-up">
          {task.dueDate || task.deadline ? (
            <div className="px-2.5 pb-1 pt-1.5 text-[10.5px] text-text-3">
              <i className="ti ti-calendar text-[11px]" /> {dateLabel(task)}
            </div>
          ) : (
            <div className="px-2.5 pb-1 pt-1.5 text-[10.5px] text-text-3">No date — pick it in the calendar</div>
          )}
          {targets.map((t, i) => (
            <div key={t.id}>
              {i === 2 && <div className="mx-2 my-1 border-t border-border-soft" />}
              <button
                onClick={() => void pick(t)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-text-2 hover:bg-white/[.06] hover:text-text"
              >
                <i className={`ti ti-${t.icon} text-[15px] text-accent`} />
                {t.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
