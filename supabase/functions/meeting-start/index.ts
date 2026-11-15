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

  // Monthly hours are checked only here: a meeting that has started is never
  // cut off by the monthly limit (the per-meeting cap still applies).
  // usage.seconds counts both audio channels → ×2.
  const { data, error } = await adminClient().rpc('start_meeting', {
    p_user: auth.userId,
    p_meeting_limit: auth.limits.meetingsPerMonth,
    p_month_cap: auth.limits.monthlyMinutes === null ? null : auth.limits.monthlyMinutes * 60 * 2
  })
  if (error) throw new Error(`start_meeting failed: ${error.message}`)
  const row = (Array.isArray(data) ? data[0] : data) as { meeting_id: string | null; reason: string | null } | null

  if (!row?.meeting_id) {
    if (row?.reason === 'hours_used') {
      throw new ApiError(
        402,
        'hours_used',
        auth.limits.tier === 'max'
          ? `You've used your ${auth.limits.monthlyMinutes! / 60} hours this month. Add 10 more hours or wait for the next month.`
          : `You've used your ${auth.limits.monthlyMinutes! / 60} Pro hours this month. Add 10 hours, or move to Pro Max for 100 hours.`
      )
    }
    throw new ApiError(
      402,
      'meeting_quota',
      `You've used all ${auth.limits.meetingsPerMonth} free meetings this month. Upgrade to Pro to keep going.`
    )
  }

  return json({
    meetingId: row.meeting_id,
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
