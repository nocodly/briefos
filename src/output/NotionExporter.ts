import { Client } from '@notionhq/client'
import { getDatabase } from '@storage/Database'
import type { ActionItem } from '@ai/SummaryEngine'

// =============================================================================
// NotionExporter — creates a Notion page for a meeting brief under a parent
// page. Requires an integration token + the parent page id (Settings →
// Integrations), and the integration must be shared with that page.
// =============================================================================

type Block = Record<string, any>

function heading(text: string): Block {
  return {
    object: 'block',
    type: 'heading_2',
    heading_2: { rich_text: [{ type: 'text', text: { content: text } }] }
  }
}
function paragraph(text: string): Block {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content: text || '—' } }] }
  }
}
function bullet(text: string): Block {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: [{ type: 'text', text: { content: text } }] }
  }
}

function buildBlocks(summary: Record<string, any>): Block[] {
  const blocks: Block[] = []
  if (summary.tldr) {
    blocks.push(heading('TL;DR'), paragraph(summary.tldr))
  }
  if (summary.context) {
    blocks.push(heading('Context'), paragraph(summary.context))
  }
  const decisions: string[] = summary.decisions ?? []
  if (decisions.length) {
    blocks.push(heading('Decisions'), ...decisions.map(bullet))
  }
  const actions: ActionItem[] = summary.actionItems ?? []
  if (actions.length) {
    blocks.push(
      heading('Action Items'),
      ...actions.map((a) =>
        bullet(`${a.person} [${a.priority}] — ${a.task}${a.deadline ? ` (due ${a.deadline})` : ''}`)
      )
    )
  }
  const questions: string[] = summary.openQuestions ?? []
  if (questions.length) {
    blocks.push(heading('Open Questions'), ...questions.map(bullet))
  }
  // Notion caps children at 100 blocks per create call.
  return blocks.slice(0, 100)
}

export async function exportToNotion(
  meetingId: string,
  token: string,
  parentPageId: string
): Promise<string> {
  console.log('[notion] exporting meeting', meetingId)
  if (!token) throw new Error('Notion token not set (Settings → Integrations)')
  if (!parentPageId) throw new Error('Notion parent page id not set (Settings → Integrations)')

  const meeting = getDatabase().getMeeting(meetingId)
  if (!meeting) throw new Error(`Meeting ${meetingId} not found`)
  const summary = (meeting.summary ?? {}) as Record<string, any>

  const notion = new Client({ auth: token })
  try {
    const page = await notion.pages.create({
      parent: { type: 'page_id', page_id: parentPageId },
      properties: {
        title: {
          title: [{ type: 'text', text: { content: String(meeting.title || 'Meeting Brief') } }]
        }
      },
      // Cast: our generic blocks are valid Notion blocks, but the SDK's
      // BlockObjectRequest union is too strict to satisfy structurally.
      children: buildBlocks(summary) as never
    })
    console.log('[notion] created page', (page as { id: string }).id)
    return (page as { id: string }).id
  } catch (err) {
    console.error('[notion] export failed', err)
    throw new Error(`Notion export failed: ${(err as Error).message}`)
  }
}
