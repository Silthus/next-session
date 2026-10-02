import { legal, type LegalKey } from '../mock'
import { LegalFooter, Wordmark } from '../ui'

export function LegalScreen({ page }: { page: LegalKey }) {
  const doc = legal[page]
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-5">
        <Wordmark />
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">Updated {doc.updated}</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight">{doc.title}</h1>
        <div className="mt-8 flex flex-col gap-6">
          {doc.sections.map(([heading, body]) => (
            <section key={heading}>
              <h2 className="font-display text-xl font-bold">{heading}</h2>
              <p className="mt-1.5 leading-relaxed text-ink-2">{body}</p>
            </section>
          ))}
        </div>
      </main>
      <LegalFooter className="mx-auto w-full max-w-2xl px-5 pb-6" />
    </div>
  )
}
