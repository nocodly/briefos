import type { Metadata } from 'next'
import { FreelancersLanding } from '@/components/FreelancersLanding'
import { COPY } from '@/lib/freelancers-i18n'

// The home page is the freelancer landing: live captions in your language,
// Ask AI during the call, brief + estimate + follow-up email after it.
const t = COPY.en.meta

export const metadata: Metadata = {
  title: t.title,
  description: t.description,
  alternates: {
    canonical: '/',
    languages: { en: '/', es: '/es/freelancers', pt: '/pt/freelancers' }
  },
  openGraph: { title: `${t.title} · Minutama`, description: t.description }
}

export default function Page() {
  return <FreelancersLanding locale="en" />
}
