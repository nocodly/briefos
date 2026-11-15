import { useEffect, useRef, useState } from 'react'
import { invoke } from '../lib/ipc'

// Share a meeting: branded PDF (opens its folder so you can send it anywhere),
// email draft, copy, Notion, Slack. PDF / Notion / Slack are part of Pro — the
// main process enforces it and the error explains it.

type Item = { id: string; icon: string; label: string; hint?: string; run: () => Promise<string | null> }

export default function ShareMenu({ meetingId, onOpenIntegrations }: { meetingId: string; onOpenIntegrations?: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const settingsHas = async (key: string) => Boolean(await invoke<string>('settings:get', key).catch(() => ''))

  const items: Item[] = [
    {
      id: 'pdf',
      icon: 'file-type-pdf',
      label: 'Save as PDF',
      hint: 'Beautiful notes, ready to send',
      run: async () => {
        const r = await invoke<{ path?: string; canceled?: boolean }>('export:pdf', { meetingId })
        return r?.canceled ? null : 'PDF saved — its folder is open, send it anywhere'
      }
    },
    {
      id: 'pdf-t',
      icon: 'file-text',
      label: 'PDF with transcript',
      run: async () => {
        const r = await invoke<{ path?: string; canceled?: boolean }>('export:pdf', { meetingId, transcript: true })
        return r?.canceled ? null : 'PDF saved with the full transcript'
      }
    },
    {
      id: 'email',
      icon: 'mail',
      label: 'Email',
      hint: 'Opens your mail app',
      run: async () => {
        await invoke('export:emailDraft', meetingId)
        return 'Email draft opened'
      }
    },
    {
      id: 'copy',
      icon: 'copy',
      label: 'Copy notes',
      run: async () => {
        await invoke('export:clipboard', meetingId)
        return 'Copied to clipboard'
      }
    },
    {
      id: 'notion',
      icon: 'brand-notion',
      label: 'Send to Notion',
      run: async () => {
        if (!(await settingsHas('notionToken'))) {
          onOpenIntegrations?.()
          return 'Connect Notion in Integrations first'
        }
        await invoke('export:notion', meetingId)
        return 'Sent to Notion'
      }
    },
    {
      id: 'slack',
      icon: 'brand-slack',
      label: 'Post to Slack',
      run: async () => {
        const url = await invoke<string>('settings:get', 'slackWebhookUrl').catch(() => '')
        if (!url) {
          onOpenIntegrations?.()
          return 'Connect Slack in Integrations first'
        }
        await invoke('export:slack', { meetingId, webhookUrl: url })
        return 'Posted to Slack'
      }
    }
  ]

  const run = async (it: Item) => {
    setOpen(false)
    setBusy(it.id)
    try {
      const msg = await it.run()
      if (msg) setToast({ ok: true, text: msg })
    } catch (e) {
      setToast({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(null)
      setTimeout(() => setToast(null), 4500)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-white/[.06] px-3.5 text-[12.5px] font-semibold text-text hover:border-accent/50 hover:bg-white/[.1]"
      >
        {busy ? <i className="ti ti-loader-2 animate-spin-slow text-[15px] text-accent" /> : <i className="ti ti-share text-[15px] text-accent" />}
        Share
      </button>

      {open && (
        <div className="glass-strong absolute right-0 top-11 z-50 w-[240px] rounded-card p-1.5 animate-fade-up">
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => void run(it)}
              className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-white/[.07]"
            >
              <i className={`ti ti-${it.icon} mt-0.5 text-[16px] text-accent`} />
              <span>
                <span className="block text-[12.5px] font-medium text-text">{it.label}</span>
                {it.hint && <span className="block text-[11px] text-text-3">{it.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[90] max-w-[360px] rounded-card border px-4 py-3 text-[13px] animate-fade-up ${
            toast.ok ? 'border-green/30 bg-green-soft text-green' : 'border-red/30 bg-red-soft text-red'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}
