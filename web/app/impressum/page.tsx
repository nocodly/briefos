import type { Metadata } from 'next'
import { LegalPage } from '@/components/LegalPage'
import { LEGAL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Impressum',
  alternates: { canonical: '/impressum' }
}

export default function Impressum() {
  return (
    <LegalPage title="Impressum" updated="13 November 2026">
      <h2>Angaben gemäß § 5 DDG</h2>
      <p>
        {LEGAL.owner}
        <br />
        {LEGAL.address}
      </p>

      <h2>Kontakt</h2>
      <p>
        E-Mail: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
        <br />
        Telefon: {LEGAL.phone}
      </p>

      <h2>Umsatzsteuer-ID</h2>
      <p>{LEGAL.vatId}</p>

      <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <p>
        {LEGAL.owner}, {LEGAL.address}
      </p>

      <h2>Verbraucherstreitbeilegung</h2>
      <p>
        Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
        teilzunehmen.
      </p>
    </LegalPage>
  )
}
