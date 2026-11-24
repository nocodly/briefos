// =============================================================================
// CalendarWatcher — prepares calls from the user's calendar, no sign-in needed.
//
// The user pastes their calendar's private iCal link (Google Calendar:
// Settings → your calendar → "Secret address in iCal format"; Outlook:
// Settings → Calendar → Shared calendars → Publish → ICS). Every few minutes
// this process reads it (on this computer only) and:
//   - 5 minutes before an event: shows the capsule prompt "Call with … at 15:00"
//   - when notes start around an event: hands its title + description to the
//     session as "About this call", so the AI already knows the context.
// Recurring events: DAILY / WEEKLY rules are expanded for the next 24 hours.
// =============================================================================

export interface CalEvent {
  uid: string
  title: string
  start: number
  end: number
  description: string
  location: string
}

const REFRESH_MS = 5 * 60 * 1000
const PROMPT_BEFORE_MS = 5 * 60 * 1000

let events: CalEvent[] = []
let lastUrl = ''
let lastError: string | null = null
const prompted = new Set<string>()

// ── ICS parsing ─────────────────────────────────────────────────────────────

function unfold(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/)
}

function unescape(v: string): string {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

/** Offset (ms) of an IANA time zone at a given instant; 0 when unknown. */
function tzOffset(at: number, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).formatToParts(new Date(at))
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
    return asUtc - at
  } catch {
    return NaN
  }
}

/** DTSTART value → epoch ms. Handles UTC ("Z"), TZID=Area/City, floating and all-day. */
function parseDate(params: string, value: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim())
  if (!m) return null
  const [, y, mo, d, h = '00', mi = '00', s = '00', z] = m
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)
  if (z) return wall
  const tz = /TZID=([^;:]+)/.exec(params)?.[1]
  if (tz) {
    const off = tzOffset(wall, tz)
    if (!Number.isNaN(off)) return wall - tzOffset(wall - off, tz)
  }
  // Floating / unknown zone (e.g. Windows zone names): treat as local time.
  return new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime()
}

const DAY = 86_400_000
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/** Occurrences of a DAILY/WEEKLY rule that start inside [from, to]. */
function expand(start: number, dur: number, rule: string, from: number, to: number): number[] {
  const r = Object.fromEntries(rule.split(';').map((p) => p.split('=')))
  const freq = r.FREQ
  if (freq !== 'DAILY' && freq !== 'WEEKLY') return []
  const interval = Math.max(1, Number(r.INTERVAL) || 1)
  const until = r.UNTIL ? parseDate('', r.UNTIL) ?? Infinity : Infinity
  const days = r.BYDAY ? String(r.BYDAY).split(',').map((x) => BYDAY.indexOf(x.slice(-2))) : null
  const out: number[] = []
  // Walk day by day over the window (≤ 2 days), keeping the original time of day.
  for (let t = start + Math.max(0, Math.floor((from - start) / DAY) - 1) * DAY; t <= to; t += DAY) {
    if (t < start || t > until) continue
    const daysSince = Math.round((t - start) / DAY)
    const wd = new Date(t).getDay()
    const ok =
      freq === 'DAILY'
        ? daysSince % interval === 0
        : Math.floor(daysSince / 7) % interval === 0 && (days ? days.includes(wd) : wd === new Date(start).getDay())
    if (ok && t + dur >= from) out.push(t)
  }
  return out
}

export function parseIcs(text: string, now = Date.now()): CalEvent[] {
  const from = now - 2 * 60 * 60 * 1000
  const to = now + DAY
  const out: CalEvent[] = []
  let cur: Record<string, { params: string; value: string }> | null = null
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') cur = {}
    else if (line === 'END:VEVENT' && cur) {
      const ds = cur.DTSTART
      const start = ds ? parseDate(ds.params, ds.value) : null
      if (start !== null && cur.STATUS?.value !== 'CANCELLED') {
        const de = cur.DTEND
        const end = de ? parseDate(de.params, de.value) ?? start + 30 * 60 * 1000 : start + 30 * 60 * 1000
        const allDay = /VALUE=DATE(?!-)/.test(ds.params) || ds.value.length === 8
        const base = {
          uid: cur.UID?.value ?? `${start}`,
          title: unescape(cur.SUMMARY?.value ?? 'Call').slice(0, 200),
          description: unescape(cur.DESCRIPTION?.value ?? '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/[ \t]+/g, ' ')
            .trim()
            .slice(0, 4000),
          location: unescape(cur.LOCATION?.value ?? '').slice(0, 300)
        }
        if (!allDay) {
          const starts = cur.RRULE ? expand(start, end - start, cur.RRULE.value, from, to) : start >= from && start <= to ? [start] : []
          for (const s of starts) out.push({ ...base, uid: `${base.uid}@${s}`, start: s, end: s + (end - start) })
        }
      }
      cur = null
    } else if (cur) {
      const i = line.indexOf(':')
      if (i < 0) continue
      const head = line.slice(0, i)
      const [name, ...rest] = head.split(';')
      if (!(name in cur)) cur[name] = { params: rest.join(';'), value: line.slice(i + 1) }
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

// ── Polling ─────────────────────────────────────────────────────────────────

async function refresh(url: string): Promise<void> {
  if (!url) {
    events = []
    lastError = null
    return
  }
  try {
    const res = await fetch(url.replace(/^webcal:/i, 'https:'), { redirect: 'follow' })
    if (!res.ok) throw new Error(`Calendar link returned ${res.status}`)
    const text = await res.text()
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('This link is not an iCal calendar')
    events = parseIcs(text)
    lastError = null
    console.log('[calendar] events in the next 24 h:', events.length)
  } catch (err) {
    lastError = (err as Error).message
    console.warn('[calendar] refresh failed', lastError)
  }
}

export function startCalendarWatcher(opts: {
  getUrl: () => string
  isRecording: () => boolean
  onSoon: (ev: CalEvent) => void
}): void {
  const tick = async () => {
    const url = opts.getUrl().trim()
    if (url !== lastUrl) {
      lastUrl = url
      await refresh(url)
    }
  }
  void tick()
  setInterval(() => void refresh((lastUrl = opts.getUrl().trim())), REFRESH_MS)
  setInterval(() => {
    void tick()
    const now = Date.now()
    if (opts.isRecording()) return
    const soon = events.find((e) => e.start > now && e.start - now <= PROMPT_BEFORE_MS && !prompted.has(e.uid))
    if (soon) {
      prompted.add(soon.uid)
      opts.onSoon(soon)
    }
  }, 30_000)
}

/** The event a call that starts now most likely belongs to. */
export function currentEvent(now = Date.now()): CalEvent | null {
  return (
    events.find((e) => e.start - 15 * 60 * 1000 <= now && now <= e.end) ??
    events.find((e) => e.start > now && e.start - now <= 15 * 60 * 1000) ??
    null
  )
}

/** For Settings: check a link right away. */
export async function testCalendar(url: string): Promise<{ ok: boolean; count: number; next: CalEvent | null; error: string | null }> {
  lastUrl = url.trim()
  await refresh(lastUrl)
  return { ok: !lastError, count: events.length, next: events.find((e) => e.end > Date.now()) ?? null, error: lastError }
}
