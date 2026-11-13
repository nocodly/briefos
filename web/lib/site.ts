// Single place for facts shown on the website. Keep prices and limits in sync
// with supabase/functions/_shared/plans.ts.

export const SITE = {
  name: 'Minutama',
  url: 'https://minutama.com',
  tagline: 'Your AI meeting agent. No bot joins the call.',
  description:
    'Minutama Agent listens to your calls right on your computer — no bot joins — writes clear notes, decisions and next steps, and gets them to where you work. Free for Windows.',
  email: 'hello@minutama.com',
  /** Windows installer. Override with NEXT_PUBLIC_DOWNLOAD_URL once releases move. */
  downloadUrl:
    process.env.NEXT_PUBLIC_DOWNLOAD_URL ??
    'https://github.com/nocodly/briefos/releases/latest/download/Minutama-Setup.exe'
} as const

export const PLANS = {
  free: {
    name: 'Free',
    price: '$0',
    meetingsPerMonth: 10,
    maxMeetingMinutes: 60,
    historyDays: 30
  },
  pro: {
    name: 'Pro',
    price: '$12',
    monthlyHours: 40,
    maxMeetingMinutes: 240
  }
} as const

// Legal entity for Impressum / Privacy / Terms.
// TODO(owner): replace every [placeholder] before launch.
export const LEGAL = {
  owner: '[Full name or company name]',
  address: '[Street and number], [Postal code] [City], Germany',
  email: 'hello@minutama.com',
  phone: '[Phone number]',
  vatId: '[USt-IdNr., if any]',
  supabaseRegion: 'EU — Stockholm, Sweden'
} as const
