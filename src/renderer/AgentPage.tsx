import { Page, SoonBadge } from './components/Page'
import { AgentRuns, useAgentRuns } from './components/Agent'
import { useEffect, useState } from 'react'
import { AgentsSettings, Panel, Toggle, useAppSettings } from './Settings'
import { MEETING_LANGUAGES, nativeLanguageName } from './recording/meetingSession'

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

      <Panel
        title="Client questions"
        icon="help-circle"
        desc="When the client asks something, a card shows their exact words and the translation in your language."
      >
        <Toggle label="Show question cards during calls" value={s.replyHints} onSave={(v) => set('replyHints', v)} />
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-text">Client speaks</label>
          <select
            value={s.clientLanguage}
            onChange={(e) => set('clientLanguage', e.target.value)}
            className="w-full rounded-xl border border-border bg-white/[.06] px-3 py-2.5 text-[13px] text-text focus:border-accent focus:outline-none"
          >
            {MEETING_LANGUAGES.filter((l) => l.code).map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-text-3">Fixed for live captions, so other languages never slip in.</p>
        </div>
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-text">Your language (you speak it; translations go into it)</label>
          <select
            value={s.nativeLanguage}
            onChange={(e) => set('nativeLanguage', e.target.value)}
            className="w-full rounded-xl border border-border bg-white/[.06] px-3 py-2.5 text-[13px] text-text focus:border-accent focus:outline-none"
          >
            <option value="">My Windows language ({nativeLanguageName('')})</option>
            {MEETING_LANGUAGES.filter((l) => l.code).map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <Toggle
          label="Also suggest what to mention (off by default — you answer in your own words)"
          value={s.answerHints}
          onSave={(v) => set('answerHints', v)}
        />
        <AboutMe value={s.aboutMe} onSave={(v) => set('aboutMe', v)} />
      </Panel>

      <Panel title="During calls" icon="sparkles" desc="The floating capsule at the edge of your screen.">
        <Toggle label="Offer to take notes when a call starts" value={s.detectCalls} onSave={(v) => set('detectCalls', v)} />
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

function AboutMe({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-text">About you (used on every call)</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && onSave(text.slice(0, 2000))}
        rows={3}
        placeholder="e.g. Full-stack developer: Next.js, Node, AWS (Lambda, API Gateway), Stripe. Rate $45/h."
        className="w-full resize-y rounded-xl border border-border bg-white/[.06] px-3 py-2.5 text-[12.5px] leading-snug text-text placeholder:text-text-4 focus:border-accent focus:outline-none"
      />
      <p className="mt-1 text-[11px] text-text-3">Helps Minutama get your terms right and write a realistic estimate.</p>
    </div>
  )
}
