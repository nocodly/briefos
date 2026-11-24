import { ApiError, adminClient, authenticate, json, serve } from '../_shared/http.ts'

// =============================================================================
// POST /feedback   { name?, rating?: 1-5, message, appVersion? } → { ok, emailed }
//
// "Help us improve Minutama" form in the app. Saved to public.feedback and,
// when RESEND_API_KEY is set, emailed to the team (FEEDBACK_TO, default
// hello@minutama.com) from FEEDBACK_FROM (a verified Resend sender).
// =============================================================================

const TO = Deno.env.get('FEEDBACK_TO') ?? 'hello@minutama.com'
const FROM = Deno.env.get('FEEDBACK_FROM') ?? 'Minutama Feedback <feedback@minutama.com>'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

serve(async (req) => {
  const auth = await authenticate(req)
  let body: { name?: unknown; rating?: unknown; message?: unknown; appVersion?: unknown }
  try {
    body = await req.json()
  } catch {
    throw new ApiError(400, 'bad_request', 'Expected JSON body.')
  }
  const message = String(body.message ?? '').trim().slice(0, 5000)
  if (message.length < 2) throw new ApiError(400, 'bad_request', 'Write a few words first.')
  const name = String(body.name ?? '').trim().slice(0, 120) || null
  const r = Number(body.rating)
  const rating = Number.isInteger(r) && r >= 1 && r <= 5 ? r : null
  const appVersion = String(body.appVersion ?? '').slice(0, 30) || null

  const db = adminClient()
  const { data: user } = await db.auth.admin.getUserById(auth.userId)
  const email = user?.user?.email ?? null

  // Light spam guard: max 10 messages per user per day.
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { count } = await db.from('feedback').select('id', { count: 'exact', head: true }).eq('user_id', auth.userId).gte('created_at', since)
  if ((count ?? 0) >= 10) throw new ApiError(429, 'feedback_quota', 'Thanks — we got your messages today. Write again tomorrow.')

  const { error } = await db.from('feedback').insert({ user_id: auth.userId, email, name, rating, message, app_version: appVersion })
  if (error) throw new Error(`feedback insert failed: ${error.message}`)

  let emailed = false
  const key = Deno.env.get('RESEND_API_KEY')
  if (key) {
    const stars = rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : '—'
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        ...(email ? { reply_to: email } : {}),
        subject: `Minutama feedback ${stars}${name ? ` — ${name}` : ''}`,
        html:
          `<p><b>Rating:</b> ${stars}</p><p><b>From:</b> ${esc(name ?? '—')} &lt;${esc(email ?? 'unknown')}&gt;</p>` +
          `<p><b>App:</b> ${esc(appVersion ?? '?')}</p><hr><p style="white-space:pre-wrap">${esc(message)}</p>`
      })
    })
    emailed = res.ok
    if (!res.ok) console.error('[feedback] resend error', res.status, (await res.text()).slice(0, 200))
  }
  console.log('[feedback] saved', auth.userId, 'rating', rating, 'emailed', emailed)
  return json({ ok: true, emailed })
})
