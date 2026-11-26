import type { Metadata } from 'next'
import { Landing } from '@/components/landing/Landing'
import { COPY } from '@/lib/freelancers-i18n'

// Spanish home page (same page as /, Spanish texts).
const t = COPY.es.meta

export const metadata: Metadata = {
  title: t.title,
  description: t.description,
  alternates: { canonical: '/es', languages: { en: '/', es: '/es' } },
  openGraph: { title: `${t.title} · Minutama`, description: t.description, locale: 'es_ES' }
}

export default function Page() {
  return <Landing locale="es" />
}
