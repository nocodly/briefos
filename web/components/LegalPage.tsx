import { Footer, Nav } from './Chrome'

export function LegalPage({
  title,
  updated,
  children
}: {
  title: string
  updated: string
  children: React.ReactNode
}) {
  return (
    <>
      <Nav />
      <main className="container-x max-w-3xl py-16">
        <h1 className="font-display text-[40px] font-extrabold tracking-[-0.02em]">{title}</h1>
        <p className="mt-2 text-[14px] text-ink-3">Last updated: {updated}</p>
        <div className="prose-legal mt-8">{children}</div>
      </main>
      <Footer />
    </>
  )
}
