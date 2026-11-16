import type { Metadata } from 'next'
import { LegalPage } from '@/components/LegalPage'
import { LEGAL, PLANS } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Terms of Service',
  alternates: { canonical: '/terms' }
}

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="16 November 2026">
      <p>
        These terms apply to the Minutama desktop app and related services provided by {LEGAL.business} (&quot;we&quot;).
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
          Free: {PLANS.free.meetingsPerMonth} meetings per month, up to {PLANS.free.maxMeetingMinutes} minutes each.
        </li>
        <li>
          Pro: {PLANS.pro.price} per month with {PLANS.pro.monthlyHours} hours of meetings; Pro Max:{' '}
          {PLANS.max.price} per month with {PLANS.max.monthlyHours} hours. Billed in advance through Stripe, renews
          automatically until cancelled. Unused hours do not carry over.
        </li>
        <li>
          Extra hours: {PLANS.topup.hours} hours for {PLANS.topup.price}, a one-time purchase valid until the end of the
          calendar month (UTC). When your hours are used up, a meeting already in progress continues to the end; new
          meetings need more hours or a higher plan.
        </li>
        <li>
          You can cancel anytime at <a href="/account">minutama.com/account</a> or in the app (Settings → Plan); your plan
          stays active until the end of the paid period. Apart from the 14-day withdrawal right below, payments are not
          refunded except where required by law.
        </li>
        <li>
          Prices are final prices in US dollars. As a small business under § 19 UStG (German VAT Act) we do not charge
          VAT.
        </li>
        <li>We may change prices with at least 30 days&apos; notice by email; changes apply from your next billing period.</li>
      </ul>

      <h2>5. Right of withdrawal (Widerrufsrecht)</h2>
      <p>
        If you are a consumer, you have the right to withdraw from a paid plan or a purchase of extra hours within 14
        days without giving any reason. The withdrawal period is 14 days from the day the contract is concluded.
      </p>
      <p>
        To exercise it, inform us ({LEGAL.business}, {LEGAL.address}, <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>)
        by a clear statement, for example an email. You may use the model form below, but you don&apos;t have to. It is
        enough to send the statement before the 14 days are over.
      </p>
      <p>
        <strong>Effects of withdrawal.</strong> We refund all payments we received from you for that contract, without
        undue delay and at the latest within 14 days from the day we receive your withdrawal, using the same means of
        payment you used, at no cost to you. We refund the full amount even if you already used the service during the
        14 days.
      </p>
      <h3>Model withdrawal form (Muster-Widerrufsformular)</h3>
      <p>
        To {LEGAL.business}, {LEGAL.address}, {LEGAL.email}:
        <br />
        I/We (*) hereby give notice that I/we (*) withdraw from my/our (*) contract for the following service: ____
        <br />
        Ordered on (*) / received on (*): ____
        <br />
        Name and email address of the account: ____
        <br />
        Date: ____
        <br />
        (*) Delete as appropriate.
      </p>

      <h2>6. Acceptable use</h2>
      <p>
        Do not misuse the service: no attempts to bypass limits, reverse engineer our servers, overload them, or use
        Minutama for unlawful surveillance.
      </p>

      <h2>7. Your content</h2>
      <p>
        Your recordings, transcripts and notes belong to you. You grant us only the rights needed to process them to
        provide the service. See our <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>8. Liability</h2>
      <p>
        We are liable without limitation for intent and gross negligence and for injury to life, body or health. For
        slight negligence we are liable only for breach of essential contractual obligations, limited to the damage
        typically foreseeable. Liability under the German Product Liability Act is unaffected.
      </p>

      <h2>9. Ending the service</h2>
      <p>
        You can delete your account at any time by writing to <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. We
        may suspend accounts that seriously breach these terms.
      </p>

      <h2>10. Law</h2>
      <p>
        German law applies, excluding the UN Convention on Contracts for the International Sale of Goods. Mandatory
        consumer protection rules of your country of residence remain unaffected.
      </p>
    </LegalPage>
  )
}
