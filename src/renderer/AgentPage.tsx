import { Page, SoonBadge } from './components/Page'
import { AgentRuns, useAgentRuns } from './components/Agent'
import { AgentsSettings, Panel, Toggle, useAppSettings } from './Settings'

// =============================================================================
// Agent — everything about Minutama Agent in one place: the coding agent it
// hands tasks to (Claude Code / Codex), what it may do, the call capsule and
// live reply hints, and recent agent activity.
// =============================================================================

export default function AgentPage() {
  const { s, set, error } = useAppSettings()
  const runs = useAgentRuns((st) => st.runs)

  return (
    <Page title="Agent" subtitle="Your meeting agent — only you see it, and it asks before it acts.">
      {error && <div className="rounded-lg border border-red/20 bg-red-soft px-3 py-2 text-[12px] text-red">{error}</div>}

      <Panel
        title="Connect your coding agent"
        icon="robot"
        desc="Tasks from your calls go to Claude Code or Codex on this computer — with your own account, files and tools."
      >
        <AgentsSettings
          provider={s.agentProvider}
          autonomy={s.agentAutonomy}
          onProvider={(v) => set('agentProvider', v)}
          onAutonomy={(v) => set('agentAutonomy', v)}
        />
      </Panel>

      <Panel title="During calls" icon="sparkles" desc="The floating capsule at the edge of your screen.">
        <Toggle label="Offer to take notes when a call starts" value={s.detectCalls} onSave={(v) => set('detectCalls', v)} />
        <Toggle label="Live reply hints when someone asks you a question" value={s.replyHints} onSave={(v) => set('replyHints', v)} />
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-text">Voice commands (“Hey …, add a task”)</span>
          <SoonBadge />
        </div>
      </Panel>

      <Panel title="Activity" icon="history" desc="Tasks your agent worked on in this session.">
        {runs.length === 0 ? (
          <p className="text-[12.5px] text-text-3">
            Nothing yet. Type a task in the capsule during a call, or use “Send to agent” on a meeting or in Tasks.
          </p>
        ) : (
          <AgentRuns compact />
        )}
      </Panel>
    </Page>
  )
}
