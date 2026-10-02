import { navigate } from '../router'
import { Button, LegalFooter, Logo, Wordmark } from '../ui'

export function NotFoundScreen({ kind }: { kind: 'link' | 'page' }) {
  const isLink = kind === 'link'
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-2xl items-center px-5 py-5">
        <Wordmark />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-5 pb-16 text-center">
        <Logo className="size-14 opacity-40 grayscale" />
        <h1 className="font-display text-3xl font-extrabold tracking-tight">
          {isLink ? 'This link no longer works' : 'Nothing here'}
        </h1>
        <p className="text-ink-2">
          {isLink
            ? 'The GM may have rotated the link or deleted the group. Ask them for the current one.'
            : 'The page you were looking for does not exist.'}
        </p>
        <div className="mt-2 flex flex-col items-center gap-2">
          <Button variant="secondary" onClick={() => navigate('/')}>
            Plan your own game
          </Button>
          <span className="text-xs text-ink-3">One click, no sign-up.</span>
        </div>
      </main>
      <LegalFooter className="mx-auto w-full max-w-2xl justify-center px-5 pb-6" />
    </div>
  )
}
