import Link from 'next/link'
import { Logo } from './Logo'
import { SITE } from '@/lib/site'

export function WindowsIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M3 5.1 10.4 4v7.2H3V5.1Zm0 13.8 7.4 1.1v-7.1H3v6Zm8.3 1.2L21 21.5v-8.6h-9.7v7.2Zm0-16.2v7.3H21V2.5l-9.7 1.4Z" />
    </svg>
  )
}

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur">
      <nav className="container-x flex h-16 items-center justify-between">
        <Link href="/" aria-label="Minutama home">
          <Logo />
        </Link>
        <div className="hidden items-center gap-8 text-[14px] font-medium text-ink-2 md:flex">
          <Link href="/#how" className="hover:text-ink">How it works</Link>
          <Link href="/#features" className="hover:text-ink">Features</Link>
          <Link href="/#pricing" className="hover:text-ink">Pricing</Link>
          <Link href="/#faq" className="hover:text-ink">FAQ</Link>
        </div>
        <Link href="/download" className="btn-primary !px-4 !py-2 text-[14px]">
          <WindowsIcon /> Download free
        </Link>
      </nav>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-line bg-paper">
      <div className="container-x flex flex-col gap-8 py-12 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-3 text-[14px] text-ink-3">{SITE.tagline}</p>
        </div>
        <div className="grid grid-cols-2 gap-x-14 gap-y-2 text-[14px] text-ink-2 sm:grid-cols-3">
          <div className="space-y-2">
            <div className="font-semibold text-ink">Product</div>
            <Link href="/download" className="block hover:text-ink">Download</Link>
            <Link href="/#pricing" className="block hover:text-ink">Pricing</Link>
            <Link href="/#faq" className="block hover:text-ink">FAQ</Link>
          </div>
          <div className="space-y-2">
            <div className="font-semibold text-ink">Legal</div>
            <Link href="/privacy" className="block hover:text-ink">Privacy</Link>
            <Link href="/terms" className="block hover:text-ink">Terms</Link>
            <Link href="/impressum" className="block hover:text-ink">Impressum</Link>
          </div>
          <div className="space-y-2">
            <div className="font-semibold text-ink">Contact</div>
            <a href={`mailto:${SITE.email}`} className="block hover:text-ink">{SITE.email}</a>
          </div>
        </div>
      </div>
      <div className="container-x pb-10 text-[13px] text-ink-3">© {new Date().getFullYear()} Minutama</div>
    </footer>
  )
}
