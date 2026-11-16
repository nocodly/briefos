import type { Metadata } from 'next'
import { LegalPage } from '@/components/LegalPage'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Manage or cancel your subscription',
  alternates: { canonical: '/account' }
}

export default function Account() {
  return (
    <LegalPage title="Your subscription" updated="16 November 2026">
      <p>
        Manage your Minutama Pro or Pro Max subscription: cancel it, switch plans, update your card or download
        invoices. Sign in with the email you paid with; Stripe sends you a one-time code.
      </p>
      <p>
        <a href={SITE.billingPortalUrl} className="btn-primary inline-flex !text-paper !no-underline" rel="noopener">
          Verträge hier kündigen · Cancel subscription
        </a>
      </p>
      <h2>What happens when you cancel</h2>
      <ul>
        <li>Your plan stays active until the end of the period you already paid for. There is no penalty.</li>
        <li>After that your account moves to Free. Your notes stay on your computer.</li>
        <li>You see the confirmation on screen right away, and we confirm it by email.</li>
      </ul>
      <p>
        In the app you can also go to <strong>Settings → Plan → Manage or cancel subscription</strong>. Problems?
        Write to <a href={`mailto:${SITE.email}`}>{SITE.email}</a> with the subject “Kündigung” and we cancel it for
        you.
      </p>
    </LegalPage>
  )
}
