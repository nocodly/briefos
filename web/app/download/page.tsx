import type { Metadata } from 'next'
import { Footer, Nav, WindowsIcon } from '@/components/Chrome'
import { Waitlist } from '@/components/Waitlist'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Download for Windows',
  description: 'Download Minutama for Windows 10 and 11 — free. AI meeting notes without a bot.',
  alternates: { canonical: '/download' }
}

const STEPS = [
  'Run Minutama-Setup.exe and follow the installer.',
  'Sign in with Google or email.',
  'Allow the microphone when Windows asks.',
  'In your next call press Ctrl+Shift+B — that’s it.'
]

export default function DownloadPage() {
  return (
    <>
      <Nav />
      <main className="container-x py-16 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Download</p>
          <h1 className="mt-3 font-display text-[44px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[56px]">
            Minutama for Windows
          </h1>
          <p className="mt-4 text-[17px] text-ink-2">Free · Windows 10 and 11 · 64-bit · no drivers needed</p>
          <a href={SITE.downloadUrl} className="btn-accent mt-8 px-7 py-4 text-[16px]">
            <WindowsIcon className="h-5 w-5" /> Download Minutama
          </a>
          <p className="mt-3 text-[13px] text-ink-3">
            If Windows shows “Windows protected your PC”, click <b>More info → Run anyway</b>. We are finishing code
            signing for our installer.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl gap-5 md:grid-cols-2">
          <div className="rounded-xl2 border border-line bg-white p-7">
            <h2 className="font-display text-[20px] font-bold">Get started in a minute</h2>
            <ol className="mt-4 space-y-3">
              {STEPS.map((s, i) => (
                <li key={s} className="flex gap-3 text-[15px] text-ink-2">
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-ink text-[12px] font-bold text-paper">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-xl2 border border-line bg-sand p-7">
            <h2 className="font-display text-[20px] font-bold">On a Mac?</h2>
            <p className="mt-2 text-[15px] text-ink-2">
              The Mac app is on its way. Leave your email and we&apos;ll send exactly one message when it&apos;s ready.
            </p>
            <div className="mt-5">
              <Waitlist platform="mac" />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
