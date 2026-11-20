// =============================================================================
// Note templates. Each template only describes the SECTIONS of the enhanced
// notes; the shared system prompt (in enhance-notes) handles style, language
// and how to merge the user's own notes with the transcript.
// =============================================================================

export interface Template {
  id: string
  name: string
  sections: string[]
  /** Extra rules for this template (appended to the system prompt). */
  instructions?: string
}

export const TEMPLATES: Record<string, Template> = {
  'client-call': {
    id: 'client-call',
    name: 'Client call',
    sections: [
      'Project brief',
      'Scope & deliverables',
      'Budget & price',
      'Deadlines',
      'Tools & stack',
      'Open points',
      'Estimate draft',
      'Follow-up email'
    ],
    instructions: [
      'This is a call between a freelancer ("Me") and a client ("Them").',
      '- Project brief: 2–4 sentences — what the client wants and why.',
      '- Budget & price: every amount, rate or budget mentioned, exactly as said. If none, write one bullet',
      '  saying the budget was not discussed (in the output language).',
      '- Open points: what is still unclear or undecided (budget, ownership, access, acceptance criteria…).',
      '  These are questions the freelancer should ask next.',
      '- Estimate draft: a markdown table "Task | Rough hours" built ONLY from the scope discussed, plus a',
      '  total row. Mark it clearly as a draft for the freelancer to edit. Base hours on typical effort; if the',
      '  scope is too vague to estimate, say so instead of a table.',
      '- Deadlines: every date or deadline that was said ("by Friday", "next week"), with who does what.',
      '- Follow-up email (JSON field "followUpEmail", always filled): a short, friendly, ready-to-send email from',
      '  "Me" to the client that thanks them, confirms what was discussed, the next step and any deadline.',
      '  Price only if agreed. Write it in the language the CLIENT spoke, even if the notes are in another language.',
      '  Plain text with a greeting and a sign-off line "Best regards," — no markdown.',
      '- Never invent prices, dates or promises that were not said.'
    ].join('\n')
  },
  general: {
    id: 'general',
    name: 'General meeting',
    sections: ['Summary', 'Key points', 'Decisions', 'Action items', 'Open questions']
  },
  'one-on-one': {
    id: 'one-on-one',
    name: '1:1',
    sections: ['How they are doing', 'Updates', 'Blockers', 'Feedback', 'Action items']
  },
  standup: {
    id: 'standup',
    name: 'Standup',
    sections: ['Done since last time', 'Plans', 'Blockers', 'Action items']
  },
  'sales-call': {
    id: 'sales-call',
    name: 'Sales call',
    sections: [
      'Company & contact',
      'Pain points',
      'Current solution',
      'Budget & timeline',
      'Decision makers',
      'Objections',
      'Next steps'
    ]
  },
  interview: {
    id: 'interview',
    name: 'Job interview',
    sections: ['Candidate background', 'Strengths', 'Concerns', 'Notable answers', 'Recommendation', 'Next steps']
  },
  'customer-discovery': {
    id: 'customer-discovery',
    name: 'Customer discovery',
    sections: ['Who they are', 'Problems', 'Workarounds today', 'Quotes', 'Insights', 'Follow-ups']
  }
}
