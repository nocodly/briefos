import axios from 'axios'
import { getDatabase } from '@storage/Database'
import { buildMeetingMarkdown } from './markdown'

// =============================================================================
// SlackNotifier — posts a meeting brief to a Slack Incoming Webhook URL.
// Slack renders mrkdwn, which is close enough to our markdown for a readable post.
// =============================================================================

export async function exportToSlack(meetingId: string, webhookUrl: string): Promise<void> {
  console.log('[slack] exporting meeting', meetingId)
  if (!webhookUrl) throw new Error('Slack webhook URL not set (Settings → Integrations)')

  const meeting = getDatabase().getMeeting(meetingId)
  if (!meeting) throw new Error(`Meeting ${meetingId} not found`)

  const text = buildMeetingMarkdown(meeting)
  try {
    await axios.post(
      webhookUrl,
      { text },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    )
    console.log('[slack] posted')
  } catch (err) {
    console.error('[slack] post failed', err)
    throw new Error(`Slack export failed: ${(err as Error).message}`)
  }
}
