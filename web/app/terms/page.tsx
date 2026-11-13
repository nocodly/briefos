import type { Metadata } from 'next'
import { LegalPage } from '@/components/LegalPage'
import { LEGAL, PLANS } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Terms of Service',
  alternates: { canonical: '/terms' }
}

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="13 November 2026">
      <p>
        These terms apply to the Minutama desktop app and related services provided by {LEGAL.owner} (&quot;we&quot;).
        By creating an account you agree to them.
      </p>

      <h2>1. The service</h2>
      <p>
        Minutama records audio on your computer while you take notes, transcribes it and creates AI-generated notes.
        AI output can contain mistakes — please review important notes before relying on or sharing them.
      </p>

      <h2>2. Your account</h2>
      <p>
        You must be at least 16 years old. Keep your sign-in secure; you are responsible for activity in your account.
      </p>

      <h2>3. Recording and consent</h2>
      <p>
        You are responsible for informing meeting participants and for obtaining any consent required by law before
        using Minutama in a conversation. Do not use Minutama where recording is prohibited.
      </p>

      <h2>4. Plans and payment</h2>
      <ul>
        <li>
          Free: {PLANS.free.meetingsPerMonth} meetings per month, up to {PLANS.free.maxMeetingMinutes} minutes each,
          notes kept for {PLANS.free.historyDays} days.
        </li>
        <li>
          Pro: {PLANS.pro.price} per month, billed in advance through Stripe, renews automatically until cancelled.
          Fair use: up to {PLANS.pro.monthlyHours} hours of recording per month.
        </li>
        <li>You can cancel anytime; Pro stays active until the end of the paid period. Payments are not refunded except where required by law.</li>
        <li>We may change prices with at least 30 days&apos; notice by email; changes apply from your next billing period.</li>
      </ul>

      <h2>5. Acceptable use</h2>
      <p>
        Do not misuse the service: no attempts to bypass limits, reverse engineer our servers, overload them, or use
        Minutama for unlawful surveillance.
      </p>

      <h2>6. Your content</h2>
      <p>
        Your recordings, transcripts and notes belong to you. You grant us only the rights needed to process them to
        provide the service. See our <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>7. Liability</h2>
      <p>
        We are liable without limitation for intent and gross negligence and for injury to life, body or health. For
        slight negligence we are liable only for breach of essential contractual obligations, limited to the damage
        typically foreseeable. Liability under the German Product Liability Act is unaffected.
      </p>

      <h2>8. Ending the service</h2>
      <p>
        You can delete your account at any time by writing to <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. We
        may suspend accounts that seriously breach these terms.
      </p>

      <h2>9. Law</h2>
      <p>
        German law applies, excluding the UN Convention on Contracts for the International Sale of Goods. Mandatory
        consumer protection rules of your country of residence remain unaffected.
      </p>
    </LegalPage>
  )
}
