import { useEffect, useState } from 'react'
import { navigate, setParam, useLocation } from '../router'
import { Button, LegalFooter, ShareLinkCard, Wordmark, cn } from '../ui'
import { emptyGroup, shareUrl } from '../mock'

type Phase = 'idle' | 'creating' | 'created'

function DemoStrip() {
  const cells = [
    [1, 1, 0, 2, 1], [1, 2, 1, 1, 0], [0, 0, 2, 1, 1], [1, 1, 1, 1, 1], [2, 1, 0, 0, 1], [1, 1, 1, 1, 2], [0, 2, 1, 0, 0],
  ]
  const tone = ['bg-busy', 'bg-free', 'bg-maybe']
  return (
    <div className="grid grid-cols-7 gap-1.5" aria-hidden="true">
      {cells.map((col, i) => {
        const free = col.filter((v) => v === 1).length
        const perfect = free === col.length
        return (
          <div key={i} className={cn('flex flex-col items-center gap-1 rounded-md border p-1.5', perfect ? 'border-free bg-free-soft' : 'border-line bg-surface')}>
            <span className="text-[10px] font-semibold text-ink-3">{['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'][i]}</span>
            <div className="flex gap-0.5">
              {col.map((v, j) => (
                <span key={j} className={cn('h-3 w-1 rounded-full', tone[v])} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function Landing() {
  const { params } = useLocation()
  const [phase, setPhase] = useState<Phase>(params.get('state') === 'created' ? 'created' : 'idle')

  useEffect(() => {
    if (phase !== 'creating') return
    const t = setTimeout(() => {
      setPhase('created')
      setParam('state', 'created')
    }, 700)
    return () => clearTimeout(t)
  }, [phase])

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <Wordmark />
        <Button variant="ghost" size="sm" onClick={() => navigate('/g/thu?save=1')}>
          Log in
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-10 px-5 pb-16 pt-6 lg:flex-row lg:items-center lg:gap-16">
        <section className="flex max-w-xl flex-col gap-6">
          <h1 className="font-display text-5xl font-extrabold leading-[0.98] tracking-tight text-ink sm:text-6xl lg:text-7xl">
            Stop chasing
            <br />
            the date.
          </h1>
          <p className="max-w-md text-lg text-ink-2">
            One link for your group. Players tap the nights they can play, no accounts. The free nights fall out by themselves.
          </p>

          {phase !== 'created' ? (
            <div className="flex flex-col gap-3">
              <Button
                size="lg"
                onClick={() => setPhase('creating')}
                disabled={phase === 'creating'}
                className="w-full max-w-sm text-lg sm:w-auto"
              >
                {phase === 'creating' ? 'Making your link…' : 'Create your link'}
              </Button>
              <p className="max-w-sm text-xs text-ink-3">
                No sign-up. By creating a link you agree to the{' '}
                <a href="/terms" className="underline underline-offset-2 hover:text-ink" onClick={(e) => { e.preventDefault(); navigate('/terms') }}>Terms</a>
                {' '}and{' '}
                <a href="/privacy" className="underline underline-offset-2 hover:text-ink" onClick={(e) => { e.preventDefault(); navigate('/privacy') }}>Privacy Policy</a>.
              </p>
            </div>
          ) : (
            <div className="animate-rise flex max-w-lg flex-col gap-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-free">
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-free text-white">✓</span>
                Your link is ready. Send it to your players.
              </div>
              <ShareLinkCard url={shareUrl(emptyGroup.token)} />
              <div className="flex items-center gap-3">
                <Button variant="secondary" size="lg" onClick={() => navigate('/g/fresh')}>
                  Open your group →
                </Button>
                <p className="text-xs text-ink-3">You can name it and save it to an account there.</p>
              </div>
            </div>
          )}

          <ol className="mt-2 flex flex-col gap-2 text-sm text-ink-2 sm:flex-row sm:gap-6">
            {['Create your link', 'Send it to the group', 'Pick the best night'].map((step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span className="inline-flex size-6 items-center justify-center rounded-full bg-surface-2 font-mono text-[11px] font-semibold text-ink">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </section>

        <aside className="w-full max-w-md self-center lg:ml-auto">
          <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-base font-bold">Thursday Crew</span>
              <span className="rounded-full bg-free-soft px-2 py-0.5 text-xs font-semibold text-free">Thu is perfect</span>
            </div>
            <DemoStrip />
            <p className="mt-3 text-xs text-ink-3">Five players, one week. Each bar is a player's answer.</p>
          </div>
        </aside>
      </main>

      <LegalFooter className="mx-auto w-full max-w-5xl px-5 pb-6" />
    </div>
  )
}
