// =============================================================================
// Note templates. Each template only describes the SECTIONS of the enhanced
// notes; the shared system prompt (in enhance-notes) handles style, language
// and how to merge the user's own notes with the transcript.
// =============================================================================

export interface Template {
  id: string
  name: string
  sections: string[]
}

export const TEMPLATES: Record<string, Template> = {
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
