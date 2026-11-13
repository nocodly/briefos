import { ApiError, adminClient, authenticate, json, serve } from '../_shared/http.ts'

// =============================================================================
// POST /meeting-start
// Called when the user starts taking notes. Atomically checks the monthly
// meeting quota and returns a server meeting id that every later call
// (transcribe-chunk, enhance-notes) must reference.
// Response: { meetingId, tier, limits }
// =============================================================================

serve(async (req) => {
  const auth = await authenticate(req)
  console.log('[meeting-start] user', auth.userId, 'plan', auth.plan)

  const { data, error } = await adminClient().rpc('try_start_meeting', {
    p_user: auth.userId,
    p_meeting_limit: auth.limits.meetingsPerMonth
  })
  if (error) throw new Error(`try_start_meeting failed: ${error.message}`)

  if (!data) {
    throw new ApiError(
      402,
      'meeting_quota',
      `You've used all ${auth.limits.meetingsPerMonth} free meetings this month. Upgrade to Pro for unlimited meetings.`
    )
  }

  return json({
    meetingId: data as string,
    tier: auth.limits.tier,
    limits: {
      meetingsPerMonth: auth.limits.meetingsPerMonth,
      maxMeetingMinutes: auth.limits.maxMeetingMinutes,
      historyDays: auth.limits.historyDays,
      templates: auth.limits.templates,
      proFeatures: auth.limits.proFeatures
    }
  })
})
