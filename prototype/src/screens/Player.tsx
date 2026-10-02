import { useState } from 'react'
import { CURRENT_MONTH, MAX_MONTH, WEEKDAYS, addMonths, daysOf, isPast, isToday, leadingBlanks, monthLabel } from '../dates'
import { groups, type Availability, type Group, type Player } from '../mock'
import { navigate, setParam, useLocation } from '../router'
import { Avatar, Button, IconChevron, LegalFooter, Logo, Skeleton, Wordmark, cn } from '../ui'
import { NotFoundScreen } from './NotFound'

function cycle(s: Availability | null): Availability | null {
  if (s === null) return 'yes'
  if (s === 'yes') return 'maybe'
  if (s === 'maybe') return 'no'
  return null
}

const fill: Record<string, string> = {
  yes: 'bg-free text-white border-free',
  maybe: 'bg-maybe text-white border-maybe',
  no: 'bg-busy text-white border-busy',
  none: 'bg-surface text-ink border-line hover:border-line-strong',
}

const glyph: Record<string, string> = { yes: '✓', maybe: '?', no: '✕' }

function Join({ group, token }: { group: Group; token: string }) {
  const [name, setName] = useState('')
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-md items-center px-5 py-5">
        <Wordmark size="sm" />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-5 pb-16">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">You're invited to</p>
          <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight">{group.name}</h1>
          <p className="mt-2 text-ink-2">Tap the nights you can play. No account, takes a minute.</p>
        </div>
        <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
          <h2 className="font-display text-lg font-bold">Who are you?</h2>
          {group.players.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {[...group.players].sort((a, b) => a.name.localeCompare(b.name)).map((p: Player) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setParam('as', p.id, false)} className="flex items-center gap-2 rounded-full border border-line bg-paper py-1.5 pl-1.5 pr-3.5 text-sm font-semibold transition-colors hover:border-accent hover:bg-accent-soft active:scale-95">
                    <Avatar name={p.name} size="sm" /> {p.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim()) setParam('as', group.players[0]?.id ?? 'new', false)
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={group.players.length > 0 ? 'Not listed? Type your name' : 'Your name'}
              className="h-12 min-w-0 flex-1 rounded-md border border-line bg-paper px-3.5 text-base outline-none focus:border-accent"
            />
            <Button size="lg" type="submit" disabled={!name.trim()}>
              Join
            </Button>
          </form>
        </section>
        <p className="text-center text-xs text-ink-3">
          Planning your own game?{' '}
          <a href="/" onClick={(e) => { e.preventDefault(); navigate('/') }} className="font-semibold text-accent hover:underline">Create your link</a>
        </p>
      </main>
      <LegalFooter className="mx-auto w-full max-w-md justify-center px-5 pb-6" />
      <span hidden>{token}</span>
    </div>
  )
}

function Progress({ answered, total }: { answered: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((answered / total) * 100)
  const done = total > 0 && answered === total
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="font-mono uppercase tracking-[0.14em] text-ink-3">{done ? 'All nights set' : `${answered} of ${total} nights set`}</span>
        <span className={cn('font-mono tabular-nums', done ? 'font-semibold text-free' : 'text-ink-2')}>{done ? '✓ done' : `${pct}%`}</span>
      </div>
      <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={cn('h-full rounded-full transition-[width] duration-300 ease-out', done ? 'bg-free' : 'bg-accent')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function PlayerCalendar({ group, player }: { group: Group; player: Player }) {
  const { params } = useLocation()
  const month = params.get('month') ?? CURRENT_MONTH
  const forceDone = params.get('state') === 'done'
  const readOnly = month < CURRENT_MONTH
  const [answers, setAnswers] = useState<Record<string, Availability | null>>(() => {
    const seed = { ...(group.availability[player.id] ?? {}) } as Record<string, Availability | null>
    if (forceDone) for (const d of daysOf(month)) seed[d] = seed[d] ?? 'no'
    return seed
  })
  const [popping, setPopping] = useState<string | null>(null)
  const [taps, setTaps] = useState(0)

  const days = daysOf(month)
  const fillable = days.filter((d) => !isPast(d))
  const answered = fillable.filter((d) => answers[d]).length
  const remaining = fillable.length - answered
  const done = fillable.length > 0 && remaining === 0
  const scheduled = new Set(group.sessions.map((s) => s.dateISO))

  function tap(d: string) {
    if (readOnly || isPast(d)) return
    setAnswers((a) => ({ ...a, [d]: cycle(a[d] ?? null) }))
    setPopping(d)
    setTaps((t) => t + 1)
    setTimeout(() => setPopping(null), 200)
  }

  function fillRest() {
    setAnswers((a) => {
      const next = { ...a }
      for (const d of fillable) if (!next[d]) next[d] = 'no'
      return next
    })
  }

  const tips = ['Tap again to cycle: free, maybe, busy.', 'Past nights lock. Future months unlock two ahead.']

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-xl items-center justify-between px-4 py-4 sm:px-5">
        <div className="flex items-center gap-3">
          <Logo className="size-8" />
          <div className="leading-tight">
            <h1 className="font-display text-lg font-bold">{group.name}</h1>
            <p className="text-xs text-ink-3">
              Answering as <span className="font-semibold text-ink">{player.name}</span> ·{' '}
              <button type="button" onClick={() => setParam('as', null, false)} className="underline underline-offset-2 hover:text-ink">Not you?</button>
            </p>
          </div>
        </div>
        <button type="button" aria-label="How it works" className="inline-flex size-9 items-center justify-center rounded-full border border-line text-sm font-bold text-ink-2 hover:bg-surface-2">?</button>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-10 sm:px-5">
        {!readOnly && (
          <div className="rounded-lg border border-line bg-surface p-3.5 shadow-card">
            <Progress answered={answered} total={fillable.length} />
          </div>
        )}

        <section className="rounded-xl border border-line bg-surface p-3 shadow-card sm:p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-2xl font-bold">{monthLabel(month)}</h2>
              {readOnly && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-3">Past · read only</span>}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" aria-label="Previous month" onClick={() => setParam('month', addMonths(month, -1))}><IconChevron dir="left" /></Button>
              <Button variant="ghost" size="sm" aria-label="Next month" disabled={month >= MAX_MONTH} onClick={() => setParam('month', addMonths(month, 1))}><IconChevron dir="right" /></Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {WEEKDAYS.map((w) => (
              <span key={w} className="pb-1 text-center font-mono text-[10px] font-medium uppercase tracking-wider text-ink-3">{w}</span>
            ))}
            {Array.from({ length: leadingBlanks(month) }).map((_, i) => <span key={`b${i}`} />)}
            {days.map((d) => {
              const s = answers[d] ?? null
              const past = isPast(d)
              const locked = readOnly || past
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => tap(d)}
                  disabled={locked}
                  aria-label={`${d}: ${s ?? 'not set'}`}
                  className={cn(
                    'relative flex aspect-square flex-col items-start justify-between rounded-md border p-1.5 text-left transition-[background-color,border-color,transform] duration-150 ease-[var(--ease-snap)] sm:p-2',
                    fill[s ?? 'none'],
                    popping === d && 'animate-pop',
                    locked && 'cursor-default opacity-45 saturate-50',
                    !locked && 'active:scale-95',
                    scheduled.has(d) && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
                  )}
                >
                  <span className={cn('text-sm font-semibold leading-none sm:text-base', isToday(d) && !s && 'text-accent')}>{Number(d.slice(8))}</span>
                  {s && <span className="self-end text-xs font-bold leading-none opacity-90 sm:text-sm">{glyph[s]}</span>}
                  {scheduled.has(d) && <span className="absolute -right-1 -top-1 rounded-full bg-accent px-1 text-[9px] font-bold text-accent-ink">★</span>}
                </button>
              )
            })}
          </div>
        </section>

        {!readOnly && (
          done ? (
            <div className="animate-rise flex flex-col gap-2 rounded-lg border border-free bg-free-soft p-4 text-center">
              <p className="font-display text-lg font-bold text-free">All set for {monthLabel(month).split(' ')[0]} ✓</p>
              <p className="text-sm text-ink-2">Your GM sees it already.</p>
              {month < MAX_MONTH && (
                <Button variant="free" size="lg" className="mt-1" onClick={() => setParam('month', addMonths(month, 1))}>
                  Fill {monthLabel(addMonths(month, 1)).split(' ')[0]} →
                </Button>
              )}
            </div>
          ) : (
            <Button variant={answered > 0 ? 'secondary' : 'ghost'} size="lg" className={cn('w-full', answered > 0 && 'border-busy/40 text-busy')} onClick={fillRest}>
              <span className="size-3 rounded-sm bg-busy" aria-hidden="true" /> Mark the other {remaining} night{remaining === 1 ? '' : 's'} busy
            </Button>
          )
        )}

        <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm text-ink-2">
          {([['yes', 'Free'], ['maybe', 'Maybe'], ['no', 'Busy']] as const).map(([s, label]) => (
            <li key={s} className="flex items-center gap-1.5">
              <span className={cn('inline-flex size-5 items-center justify-center rounded-sm text-[10px] font-bold text-white', s === 'yes' && 'bg-free', s === 'maybe' && 'bg-maybe', s === 'no' && 'bg-busy')}>{glyph[s]}</span>
              {label}
            </li>
          ))}
          <li className="flex items-center gap-1.5"><span className="inline-block size-5 rounded-sm border border-line bg-surface" /> Not set</li>
        </ul>
        <p className="text-center text-xs text-ink-3">{tips[Math.floor(taps / 3) % tips.length]}</p>
      </main>

      <footer className="mx-auto flex w-full max-w-xl flex-col items-center gap-2 px-4 pb-6 sm:px-5">
        <a href="/" onClick={(e) => { e.preventDefault(); navigate('/') }} className="text-xs font-semibold text-accent hover:underline">Plan your own game →</a>
        <LegalFooter className="justify-center" />
      </footer>
    </div>
  )
}

export function PlayerScreen({ token }: { token: string }) {
  const { params } = useLocation()
  const group = groups.find((g) => g.token === token) ?? null
  if (params.get('state') === 'loading') {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-5 py-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-16" />
        <Skeleton className="aspect-square" />
      </div>
    )
  }
  if (!group) return <NotFoundScreen kind="link" />
  const as = params.get('as')
  const player = group.players.find((p) => p.id === as) ?? (as === 'new' ? { id: 'new', name: 'You' } : null)
  if (!player) return <Join group={group} token={token} />
  return <PlayerCalendar key={`${player.id}-${params.get('month') ?? ''}`} group={group} player={player} />
}
