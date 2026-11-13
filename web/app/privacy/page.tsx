import type { Metadata } from 'next'
import { LegalPage } from '@/components/LegalPage'
import { LEGAL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  alternates: { canonical: '/privacy' }
}

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="13 November 2026">
      <p>
        This policy explains what personal data Minutama (&quot;we&quot;) processes when you use our website and our
        desktop app, why, and what your rights are under the EU General Data Protection Regulation (GDPR).
      </p>

      <h2>1. Who is responsible</h2>
      <p>
        {LEGAL.owner}, {LEGAL.address}. Email: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
      </p>

      <h2>2. The short version</h2>
      <ul>
        <li>Minutama never saves recordings of your meetings.</li>
        <li>Your notes and transcripts are stored on your own computer.</li>
        <li>We keep only what we need to run your account: your email, your plan and how many meetings you used.</li>
        <li>We do not sell data and we do not use your meetings to train AI models.</li>
      </ul>

      <h2>3. What we process and why</h2>
      <h3>Account</h3>
      <p>
        Email address and sign-in data (including your Google profile name if you sign in with Google), your plan and
        monthly usage counters (number of meetings and recorded minutes). Purpose: providing the service and enforcing
        plan limits. Legal basis: performance of a contract (Art. 6(1)(b) GDPR).
      </p>
      <h3>Meeting audio</h3>
      <p>
        While you take notes, the app sends short pieces of audio from your microphone and your computer&apos;s sound
        over an encrypted connection to our servers, which forward them to our transcription provider and return the
        text. We do not store the audio. Legal basis: Art. 6(1)(b) GDPR.
      </p>
      <h3>Notes and transcripts</h3>
      <p>
        To create AI notes, the transcript and your own notes are sent to our AI provider, and the result is returned to
        your app. Notes and transcripts are saved locally on your computer, not on our servers. You can delete them in
        the app at any time.
      </p>
      <h3>Payments</h3>
      <p>
        Payments for Pro are handled by Stripe. We receive your Stripe customer ID and subscription status, never your
        card details. Legal basis: Art. 6(1)(b) and (c) GDPR (tax and accounting obligations).
      </p>
      <h3>Waitlist</h3>
      <p>
        If you join a waitlist we store your email address and the platform you are interested in, only to send you one
        launch message. Legal basis: consent (Art. 6(1)(a) GDPR); you can withdraw it any time by writing to us.
      </p>
      <h3>Website</h3>
      <p>
        Our hosting provider processes technical data (IP address, browser, time of request) in server logs to deliver
        and protect the website (Art. 6(1)(f) GDPR). We do not use advertising or analytics cookies on this website.
      </p>

      <h2>4. Your responsibility when recording</h2>
      <p>
        You decide when Minutama listens. Please inform the other participants that you use an AI notetaker and follow
        the recording laws that apply to you and to them.
      </p>

      <h2>5. Service providers</h2>
      <ul>
        <li>Supabase Inc. — authentication, database and server functions ({LEGAL.supabaseRegion}).</li>
        <li>OpenAI, L.L.C. (USA) — speech-to-text and AI notes via its API. API data is not used to train models.</li>
        <li>Stripe Payments Europe Ltd. — payments.</li>
        <li>Our website hosting provider — delivery of minutama.com.</li>
      </ul>
      <p>
        Where data is transferred outside the EU/EEA, we rely on the EU–US Data Privacy Framework and/or the European
        Commission&apos;s Standard Contractual Clauses.
      </p>

      <h2>6. How long we keep data</h2>
      <p>
        Account data: as long as your account exists. Usage counters: up to 24 months. Billing records: as required by
        tax law (usually 10 years in Germany). Waitlist emails: until the launch message is sent or you ask us to delete
        them.
      </p>

      <h2>7. Your rights</h2>
      <p>
        You have the right to access, correct, delete and port your data, to restrict or object to processing, and to
        withdraw consent. Write to <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. You can also lodge a complaint
        with a data protection supervisory authority.
      </p>

      <h2>8. Changes</h2>
      <p>We will update this page when our processing changes and change the date above.</p>
    </LegalPage>
  )
}
