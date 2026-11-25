import { Page } from './components/Page'
import { AgentRuns, useAgentRuns } from './components/Agent'
import { AgentsSettings, Panel, useAppSettings } from './Settings'

// =============================================================================
// Agent — everything about Minutama Agent in one place: the coding agent it
// hands tasks to (Claude Code / Codex), what it may do, the call capsule and
// live reply hints, and recent agent activity.
// =============================================================================

export default function AgentPage() {
  const { s, set, error } = useAppSettings()
  const runs = useAgentRuns((st) => st.runs)

  return (
    <Page title="Coding agent" subtitle="Advanced: hand tasks from your calls to Claude Code or Codex on this computer. It asks before it acts.">
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

      <Panel title="Activity" icon="history" desc="Tasks your agent worked on in this session.">
        {runs.length === 0 ? (
          <p className="text-[12.5px] text-text-3">
            Nothing yet. Tasks you send to your agent show up here.
          </p>
        ) : (
          <AgentRuns compact />
        )}
      </Panel>
    </Page>
  )
}
