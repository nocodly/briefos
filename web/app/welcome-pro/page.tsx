import type { Metadata } from 'next'
import Link from 'next/link'
import { Footer, Nav } from '@/components/Chrome'

// Stripe Payment Link "after payment" redirect target.
export const metadata: Metadata = {
  title: 'Welcome to Pro',
  robots: { index: false, follow: false }
}

export default function WelcomePro() {
  return (
    <>
      <Nav />
      <main className="container-x py-24 text-center">
        <div className="mx-auto max-w-xl">
          <div className="text-[44px]" aria-hidden="true">
            ✦
          </div>
          <h1 className="mt-2 font-display text-[44px] font-extrabold tracking-[-0.03em]">You&apos;re on Pro</h1>
          <p className="mt-4 text-[17px] text-ink-2">
            Thank you! Your plan updates in the app within a few seconds — unlimited meetings, all templates, Period
            Reports and exports are unlocked.
          </p>
          <p className="mt-2 text-[14px] text-ink-3">
            Don&apos;t see it? Restart Minutama, or write to{' '}
            <a href="mailto:hello@minutama.com" className="underline">
              hello@minutama.com
            </a>
            .
          </p>
          <Link href="/" className="btn-ghost mt-8">
            Back to minutama.com
          </Link>
        </div>
      </main>
      <Footer />
    </>
  )
}
