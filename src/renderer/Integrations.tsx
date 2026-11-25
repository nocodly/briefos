import type { NavigateFn } from './App'
import { Page, SoonBadge } from './components/Page'
import { Password, Text, useAppSettings } from './Settings'

// =============================================================================
// Integrations — where your meetings go. Working ones are configurable here;
// the rest are clearly marked "Soon".
// =============================================================================

function Card({
  icon,
  title,
  desc,
  status,
  children
}: {
  icon: string
  title: string
  desc: string
  status?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="glass rounded-panel p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accent-soft">
          <i className={`ti ti-${icon} text-[18px] text-accent`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display text-[15px] font-bold">{title}</span>
            <span className="ml-auto">{status}</span>
          </div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-text-3">{desc}</p>
        </div>
      </div>
      {children && <div className="mt-4 space-y-3">{children}</div>}
    </div>
  )
}

function Connected({ on }: { on: boolean }) {
  return on ? (
    <span className="flex items-center gap-1 text-[11px] font-semibold text-green">
      <i className="ti ti-circle-check-filled" /> Connected
    </span>
  ) : (
    <span className="text-[11px] text-text-3">Not connected</span>
  )
}

export default function Integrations({ navigate }: { navigate: NavigateFn }) {
  const { s, set, saved, error } = useAppSettings()

  return (
    <Page title="Integrations" subtitle="Send your meetings where you work. Exports to Notion and Slack are part of Pro." wide>
      {error && <div className="rounded-lg border border-red/20 bg-red-soft px-3 py-2 text-[12px] text-red">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        <Card
          icon="robot"
          title="Claude Code · Codex"
          desc="Hand any task from a call to the coding agent on your computer."
          status={
            <button onClick={() => navigate('agent')} className="text-[11.5px] font-semibold text-accent-ink hover:underline">
              Set up →
            </button>
          }
        />

        <Card icon="brand-notion" title="Notion" desc="Export a meeting as a Notion page." status={<Connected on={Boolean(s.notionToken && s.notionParentPageId)} />}>
          <Password
            label="Integration token"
            value={s.notionToken}
            saved={saved === 'notionToken'}
            onSave={(v) => set('notionToken', v)}
            placeholder="secret_…"
          />
          <Text
            label="Parent page ID"
            value={s.notionParentPageId}
            saved={saved === 'notionParentPageId'}
            onSave={(v) => set('notionParentPageId', v)}
            placeholder="32-char page id"
            mono
          />
        </Card>

        <Card icon="brand-slack" title="Slack" desc="Post meeting notes to a channel." status={<Connected on={Boolean(s.slackWebhookUrl)} />}>
          <Text
            label="Incoming webhook URL"
            value={s.slackWebhookUrl}
            saved={saved === 'slackWebhookUrl'}
            onSave={(v) => set('slackWebhookUrl', v)}
            placeholder="https://hooks.slack.com/…"
            mono
          />
        </Card>

        <Card icon="sparkles" title="Add to Claude" desc="Let Claude search and use all your meetings (MCP connector)." status={<SoonBadge />} />
        <Card icon="webhook" title="Webhook · Zapier · Make · n8n" desc="Send every finished meeting to any tool automatically." status={<SoonBadge />} />
        <Card
          icon="mail"
          title="Follow-up email"
          desc="Every call's notes end with a ready follow-up email in the client's language — copy it or open it in your mail app (Share → Email)."
          status={<span className="text-[11px] font-semibold text-green">Included</span>}
        />
        <Card
          icon="calendar"
          title="Google Calendar · Outlook"
          desc="Paste your private calendar link in Settings → Calendar: Minutama reminds you before a call and uses the event description."
          status={<span className="text-[11px] font-semibold text-green">In Settings</span>}
        />
        <Card icon="checkbox" title="Todoist · Linear · Asana" desc="Turn action items into tasks in your tracker." status={<SoonBadge />} />
      </div>
    </Page>
  )
}
