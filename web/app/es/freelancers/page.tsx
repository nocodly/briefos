import type { Metadata } from 'next'
import { FreelancersLanding } from '@/components/FreelancersLanding'
import { COPY } from '@/lib/freelancers-i18n'

const t = COPY.es.meta

export const metadata: Metadata = {
  title: t.title,
  description: t.description,
  alternates: {
    canonical: '/es/freelancers',
    languages: { en: '/freelancers', es: '/es/freelancers', pt: '/pt/freelancers' }
  },
  openGraph: { title: `${t.title} · Minutama`, description: t.description, locale: 'es' }
}

export default function Page() {
  return <FreelancersLanding locale="es" />
}
