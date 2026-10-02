import { useState, type ReactNode } from 'react'
import { CURRENT_MONTH, MAX_MONTH, WEEKDAYS, addMonths, dayLabel, daysOf, isPast, isToday, leadingBlanks, monthLabel, relativeDays } from '../dates'
import { emptyGroup, groups, manyPlayersGroup, shareUrl, type Availability, type Group } from '../mock'
import { navigate, setParam, useLocation } from '../router'
import { Avatar, Button, Card, Dot, Eyebrow, IconCheck, IconChevron, IconMore, IconStar, LegalFooter, Logo, ShareLinkCard, Skeleton, Toast, cn } from '../ui'

function findGroup(id: string): Group | null {
  if (id === 'fresh') return emptyGroup
  if (id === 'big') return manyPlayersGroup
  return groups.find((g) => g.id === id) ?? null
}

interface DayCounts {
  yes: number
  maybe: number
  no: number
  answered: number
}

function countsFor(group: Group, dateISO: string): DayCounts {
  const c = { yes: 0, maybe: 0, no: 0, answered: 0 }
  for (const p of group.players) {
    const s = group.availability[p.id]?.[dateISO]
    if (!s) continue
    c[s]++
    c.answered++
  }
  return c
}

function score(c: DayCounts) {
  return c.yes - 2 * c.no + 0.5 * c.maybe
}

function bestDays(group: Group, month: string) {
  return daysOf(month)
    .filter((d) => !isPast(d))
    .map((d) => ({ dateISO: d, counts: countsFor(group, d) }))
    .filter((x) => score(x.counts) > 0 && x.counts.no === 0)
    .sort((a, b) => score(b.counts) - score(a.counts) || a.dateISO.localeCompare(b.dateISO))
    .slice(0, 3)
}

function MiniBars({ group, dateISO }: { group: Group; dateISO: string }) {
  const tone: Record<Availability, string> = { yes: 'bg-free', maybe: 'bg-maybe', no: 'bg-busy' }
  return (
    <div className="flex flex-wrap gap-[2px]" aria-hidden="true">
      {group.players.map((p) => {
        const s = group.availability[p.id]?.[dateISO]
        return <span key={p.id} className={cn('h-2.5 w-1 rounded-full sm:h-3 sm:w-[5px]', s ? tone[s] : 'bg-line-strong/60')} />
      })}
    </div>
  )
}

function DayCell({
  group,
  dateISO,
  selected,
  scheduled,
  onSelect,
}: {
  group: Group
  dateISO: string
  selected: boolean
  scheduled: boolean
  onSelect: () => void
}) {
  const c = countsFor(group, dateISO)
  const total = group.players.length
  const past = isPast(dateISO)
  const perfect = total > 0 && c.yes === total
  const ratio = total === 0 ? 0 : c.yes / total
  const tintPct = Math.round(ratio * 55)
  const dense = total > 8
  const style = !scheduled && !perfect && tintPct > 0 && c.no === 0 ? { background: `color-mix(in oklab, var(--free) ${tintPct}%, var(--surface))` } : undefined

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={past}
      aria-label={`${dayLabel(dateISO)}: ${c.yes} free, ${c.maybe} maybe, ${c.no} busy`}
      aria-pressed={selected}
      style={style}
      className={cn(
        'relative flex aspect-square flex-col justify-between overflow-hidden rounded-md border p-1.5 text-left transition-[transform,box-shadow,background-color] duration-150 ease-[var(--ease-snap)] sm:p-2',
        'border-line bg-surface hover:border-line-strong',
        perfect && !scheduled && 'border-free bg-free text-white',
        scheduled && 'border-accent bg-accent-soft ring-2 ring-accent ring-inset',
        selected && 'z-10 ring-2 ring-ink ring-offset-2 ring-offset-paper',
        past && 'cursor-default opacity-40',
        !past && 'active:scale-[0.97]',
      )}
    >
      <span className={cn('flex items-center gap-1 text-[12px] font-semibold leading-none sm:text-sm', isToday(dateISO) && 'text-accent', perfect && !scheduled && 'text-white')}>
        {Number(dateISO.slice(8))}
        {isToday(dateISO) && <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />}
      </span>
      {scheduled ? (
        <IconStar className="absolute right-1.5 top-1.5 size-3.5 text-accent sm:size-4" />
      ) : null}
      {total > 0 &&
        (dense ? (
          <span className={cn('font-mono text-[10px] leading-none sm:text-[11px]', perfect ? 'text-white' : 'text-ink-2')}>
            {c.yes}/{total}
            {c.no > 0 && <span className="ml-1 text-busy">✕{c.no}</span>}
          </span>
        ) : (
          <MiniBars group={group} dateISO={dateISO} />
        ))}
    </button>
  )
}

function Calendar({ group, month, selected, onSelect }: { group: Group; month: string; selected: string | null; onSelect: (d: string | null) => void }) {
  const scheduledSet = new Set(group.sessions.map((s) => s.dateISO))
  const pastMonth = month < CURRENT_MONTH
  return (
    <Card className="p-3 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl font-bold sm:text-2xl">{monthLabel(month)}</h2>
          {pastMonth && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-3">Past month</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" aria-label="Previous month" onClick={() => setParam('month', addMonths(month, -1))}>
            <IconChevron dir="left" />
          </Button>
          <Button variant="ghost" size="sm" aria-label="Next month" disabled={month >= MAX_MONTH} onClick={() => setParam('month', addMonths(month, 1))}>
            <IconChevron dir="right" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {WEEKDAYS.map((w) => (
          <span key={w} className="pb-1 text-center font-mono text-[10px] font-medium uppercase tracking-wider text-ink-3">
            {w}
          </span>
        ))}
        {Array.from({ length: leadingBlanks(month) }).map((_, i) => (
          <span key={`b${i}`} />
        ))}
        {daysOf(month).map((d) => (
          <DayCell key={d} group={group} dateISO={d} selected={selected === d} scheduled={scheduledSet.has(d)} onSelect={() => onSelect(selected === d ? null : d)} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-free" /> everyone free</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm border border-line" style={{ background: 'color-mix(in oklab, var(--free) 30%, var(--surface))' }} /> some free</span>
        <span className="flex items-center gap-1.5"><IconStar className="size-3 text-accent" /> session</span>
        {group.players.length > 8 ? (
          <span className="flex items-center gap-1.5"><span className="font-mono">7/12 <span className="text-busy">✕2</span></span> free of all · busy</span>
        ) : (
          <span className="flex items-center gap-1.5"><span className="flex gap-[2px]"><span className="h-3 w-1 rounded-full bg-free" /><span className="h-3 w-1 rounded-full bg-maybe" /><span className="h-3 w-1 rounded-full bg-busy" /></span> one bar per player</span>
        )}
      </div>
    </Card>
  )
}

function DayPanel({ group, dateISO, onBack, onSchedule, scheduled }: { group: Group; dateISO: string; onBack: () => void; onSchedule: () => void; scheduled: boolean }) {
  const order: Record<string, number> = { yes: 0, maybe: 1, no: 2 }
  const rows = group.players
    .map((p) => ({ p, s: (group.availability[p.id]?.[dateISO] ?? null) as Availability | null }))
    .sort((a, b) => (a.s ? order[a.s] : 3) - (b.s ? order[b.s] : 3))
  const label: Record<string, string> = { yes: 'Free', maybe: 'Maybe', no: 'Busy' }
  const c = countsFor(group, dateISO)
  return (
    <Card className="animate-rise border-accent/40">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs font-medium text-ink-3 hover:text-ink">
          <IconChevron dir="left" className="size-3.5" /> Overview
        </button>
        <span className="text-xs text-ink-3">{relativeDays(dateISO)}</span>
      </div>
      <h3 className="mt-2 font-display text-2xl font-bold">{dayLabel(dateISO, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
      <p className="mt-0.5 text-sm text-ink-2">
        <span className="font-semibold text-free">{c.yes} free</span> · {c.maybe} maybe · {c.no} busy · {group.players.length - c.answered} silent
      </p>
      <ul className="mt-4 flex flex-col gap-2">
        {rows.map(({ p, s }) => (
          <li key={p.id} className="flex items-center gap-2.5">
            <Avatar name={p.name} size="sm" />
            <span className={cn('flex-1 text-sm font-medium', !s && 'text-ink-3')}>{p.name}</span>
            <span className={cn('flex items-center gap-1.5 text-xs font-semibold', s === 'yes' && 'text-free', s === 'maybe' && 'text-maybe', s === 'no' && 'text-busy', !s && 'text-ink-3')}>
              <Dot state={s} /> {s ? label[s] : 'No answer'}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-5">
        {scheduled ? (
          <Button variant="secondary" className="w-full" onClick={onSchedule}>
            Unschedule this session
          </Button>
        ) : (
          <Button className="w-full" size="lg" onClick={onSchedule} disabled={isPast(dateISO)}>
            <IconStar /> Schedule session
          </Button>
        )}
      </div>
    </Card>
  )
}

function BestDays({ group, month, onPick }: { group: Group; month: string; onPick: (d: string) => void }) {
  const best = bestDays(group, month)
  const total = group.players.length
  return (
    <Card>
      <Eyebrow>Best nights</Eyebrow>
      {total === 0 ? (
        <p className="mt-2 text-sm text-ink-3">Once players answer, the best nights show up here.</p>
      ) : best.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">No night works for everyone yet. Nudge the quiet ones.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-1.5">
          {best.map(({ dateISO, counts }, i) => (
            <li key={dateISO}>
              <button type="button" onClick={() => onPick(dateISO)} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-2">
                <span className={cn('inline-flex size-7 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold', i === 0 ? 'bg-free text-white' : 'bg-surface-2 text-ink-2')}>{i + 1}</span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold">{dayLabel(dateISO, { weekday: 'long', day: 'numeric', month: 'short' })}</span>
                  <span className="block text-xs text-ink-3">
                    {counts.yes === total ? 'Everyone is free' : `${counts.yes} of ${total} free${counts.maybe ? `, ${counts.maybe} maybe` : ''}`}
                  </span>
                </span>
                <span className="flex -space-x-1">
                  {group.players.filter((p) => group.availability[p.id]?.[dateISO] === 'yes').slice(0, 4).map((p) => (
                    <Avatar key={p.id} name={p.name} size="sm" className="ring-2 ring-surface" />
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

function Players({ group, month }: { group: Group; month: string }) {
  const [adding, setAdding] = useState(group.players.length === 0)
  const fillable = daysOf(month).filter((d) => !isPast(d)).length
  return (
    <Card>
      <div className="flex items-center justify-between">
        <Eyebrow>Players · {group.players.length}</Eyebrow>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="text-xs font-semibold text-accent hover:underline">
            + Add
          </button>
        )}
      </div>
      {group.players.length === 0 && (
        <p className="mt-2 text-sm text-ink-3">Players add themselves when they open your link. You can also add names now.</p>
      )}
      <ul className="mt-3 flex flex-col gap-1">
        {group.players.map((p) => {
          const answered = daysOf(month).filter((d) => !isPast(d) && group.availability[p.id]?.[d]).length
          const done = answered === fillable
          return (
            <li key={p.id} className="group flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-surface-2">
              <Avatar name={p.name} size="sm" />
              <span className="flex-1 truncate text-sm font-medium">{p.name}</span>
              <span className={cn('font-mono text-[11px] tabular-nums', done ? 'text-free' : answered === 0 ? 'text-ink-3' : 'text-ink-2')}>
                {done ? <IconCheck className="size-3.5" /> : `${answered}/${fillable}`}
              </span>
              <button type="button" aria-label={`More for ${p.name}`} className="rounded-sm p-1 text-ink-3 opacity-0 transition-opacity hover:text-ink group-hover:opacity-100 focus:opacity-100">
                <IconMore />
              </button>
            </li>
          )
        })}
      </ul>
      {adding && (
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); setAdding(false) }}>
          <input autoFocus placeholder="Player name" className="h-9 min-w-0 flex-1 rounded-sm border border-line bg-paper px-3 text-sm outline-none focus:border-accent" />
          <Button size="sm" variant="secondary" type="submit">Add</Button>
        </form>
      )}
    </Card>
  )
}

function Sessions({ group, onPick }: { group: Group; onPick: (d: string) => void }) {
  const upcoming = group.sessions.filter((s) => !isPast(s.dateISO)).sort((a, b) => a.dateISO.localeCompare(b.dateISO))
  const history = group.sessions.filter((s) => isPast(s.dateISO)).sort((a, b) => b.dateISO.localeCompare(a.dateISO))
  const [showHistory, setShowHistory] = useState(false)
  return (
    <Card>
      <Eyebrow>Sessions</Eyebrow>
      {upcoming.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">Nothing scheduled. Pick a night from the calendar or the best nights.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {upcoming.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => onPick(s.dateISO)} className="flex w-full items-center gap-3 rounded-md border border-accent/40 bg-accent-soft/50 px-3 py-2.5 text-left hover:bg-accent-soft">
                <IconStar className="size-5 text-accent" />
                <span className="flex-1">
                  <span className="block text-sm font-semibold">{dayLabel(s.dateISO, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                  <span className="block text-xs text-ink-3">{relativeDays(s.dateISO)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {history.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowHistory((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-ink-3 hover:text-ink">
            <IconChevron dir={showHistory ? 'up' : 'down'} className="size-3.5" /> {history.length} played
          </button>
          {showHistory && (
            <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-2">
              {history.map((s) => (
                <li key={s.id} className="px-1">{dayLabel(s.dateISO, { weekday: 'short', day: 'numeric', month: 'long' })}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}

function GroupSwitcher({ group, open, onToggle }: { group: Group; open: boolean; onToggle: () => void }) {
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  if (renaming) {
    return (
      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); setRenaming(false) }}>
        <input autoFocus defaultValue={group.name} className="h-9 rounded-sm border border-accent bg-surface px-3 font-display text-lg font-bold outline-none" />
        <Button size="sm" type="submit">Save</Button>
        <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>Cancel</Button>
      </form>
    )
  }
  return (
    <div className="relative">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 max-w-[48vw] items-center gap-1.5 rounded-md px-2 py-1 font-display text-lg font-bold hover:bg-surface-2 sm:max-w-none sm:text-xl">
        <span className="truncate">{group.name}</span>
        <IconChevron className="size-4 shrink-0 text-ink-3" />
      </button>
      {open && (
        <div className="animate-rise absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-line bg-surface p-1.5 shadow-card">
          <Eyebrow className="px-2 pb-1 pt-1">Your groups</Eyebrow>
          {[...groups, manyPlayersGroup].map((g) => (
            <button key={g.id} type="button" onClick={() => navigate(`/g/${g.id}`)} className={cn('flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-surface-2', g.id === group.id && 'bg-surface-2 font-semibold')}>
              <span className="flex-1 truncate">{g.name}</span>
              <span className="font-mono text-[10px] text-ink-3">{g.players.length}</span>
            </button>
          ))}
          <button type="button" onClick={() => navigate('/g/fresh')} className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-semibold text-accent hover:bg-surface-2">
            + New group
          </button>
          <div className="my-1.5 border-t border-line" />
          <button type="button" onClick={() => { setRenaming(true); onToggle() }} className="flex w-full rounded-md px-2 py-2 text-left text-sm hover:bg-surface-2">Rename group</button>
          {confirmDelete ? (
            <div className="rounded-md bg-busy-soft p-2 text-xs text-busy">
              Deletes players and answers too.
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="danger" onClick={() => navigate('/g/curse')}>Delete {group.name}</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Keep</Button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="flex w-full rounded-md px-2 py-2 text-left text-sm text-busy hover:bg-busy-soft">Delete group</button>
          )}
        </div>
      )}
    </div>
  )
}

function SaveSheet({ group, onClose }: { group: Group; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div className="animate-rise w-full max-w-md rounded-t-xl border border-line bg-surface p-6 shadow-card sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <Logo className="size-10" />
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-sm p-1 text-ink-3 hover:text-ink">✕</button>
        </div>
        <h2 className="mt-4 font-display text-2xl font-extrabold tracking-tight">Keep {group.name}</h2>
        <p className="mt-1.5 text-sm text-ink-2">
          Sign in to open this group on any device. The player link stays exactly the same, your players notice nothing.
        </p>
        <div className="mt-5 flex flex-col gap-2.5">
          <Button size="lg" variant="secondary" className="w-full">
            <span className="font-bold text-[#4285F4]">G</span> Continue with Google
          </Button>
          <div className="flex items-center gap-3 text-xs text-ink-3"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
          <form className="flex gap-2" onSubmit={(e) => e.preventDefault()}>
            <input type="email" placeholder="you@example.com" className="h-12 min-w-0 flex-1 rounded-md border border-line bg-paper px-3 text-sm outline-none focus:border-accent" />
            <Button size="lg" type="submit">Send code</Button>
          </form>
        </div>
        <p className="mt-4 text-xs text-ink-3">Already have an account? Signing in merges this group into it. Nothing gets replaced.</p>
      </div>
    </div>
  )
}

function Nudge({ group, onSave }: { group: Group; onSave: () => void }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed || group.players.length === 0) return null
  const rest = group.players.length - 2
  const names = group.players.slice(0, 2).map((p) => p.name).join(rest > 0 ? ', ' : ' and ')
  return (
    <div className="animate-rise flex flex-col gap-3 rounded-lg border border-maybe/50 bg-maybe-soft/70 px-4 py-3 sm:flex-row sm:items-center">
      <p className="flex-1 text-sm text-ink">
        <span className="font-semibold">{names}{rest > 0 ? ` and ${rest} more` : ''} joined.</span> Save this group to keep it on every device. Unsaved groups vanish after 30 quiet days.
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave}>Save group</Button>
        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>Later</Button>
      </div>
    </div>
  )
}

function Shell({ group, switcherOpen, onToggleSwitcher, onSave, children }: { group: Group | null; switcherOpen: boolean; onToggleSwitcher: () => void; onSave: () => void; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <a href="/" onClick={(e) => { e.preventDefault(); navigate('/') }} aria-label="Next Session home"><Logo className="size-8" /></a>
          <span className="text-ink-3">/</span>
          {group ? <GroupSwitcher group={group} open={switcherOpen} onToggle={onToggleSwitcher} /> : <Skeleton className="h-7 w-40" />}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="soft" size="sm" onClick={onSave}>
              <span className="sm:hidden">Save</span>
              <span className="hidden sm:inline">Save your group</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">{children}</main>
      <LegalFooter className="mx-auto w-full max-w-6xl px-4 pb-6 sm:px-6" />
    </div>
  )
}

type Tab = 'best' | 'players' | 'sessions'

export function GroupScreen({ groupId }: { groupId: string }) {
  const { params } = useLocation()
  const group = findGroup(groupId)
  const state = params.get('state')
  const month = params.get('month') ?? CURRENT_MONTH
  const selected = params.get('day')
  const saving = params.get('save') === '1'
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('best')
  const [toast, setToast] = useState<string | null>(null)
  const [sessions, setSessions] = useState(group?.sessions ?? [])

  const openSave = () => setParam('save', '1')
  const closeSave = () => setParam('save', null)

  if (state === 'loading' || !group) {
    return (
      <Shell group={null} switcherOpen={false} onToggleSwitcher={() => {}} onSave={openSave}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Skeleton className="aspect-[7/6] w-full rounded-lg" />
          <div className="flex flex-col gap-4">
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-48 rounded-lg" />
          </div>
        </div>
      </Shell>
    )
  }

  if (state === 'error') {
    return (
      <Shell group={group} switcherOpen={false} onToggleSwitcher={() => {}} onSave={openSave}>
        <Card className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 text-center">
          <span className="text-3xl">⚠️</span>
          <h2 className="font-display text-xl font-bold">We lost the connection</h2>
          <p className="text-sm text-ink-2">Your answers are safe. Try again in a moment.</p>
          <Button onClick={() => setParam('state', null)}>Try again</Button>
        </Card>
      </Shell>
    )
  }

  const liveGroup: Group = { ...group, sessions }
  const scheduledSet = new Set(sessions.map((s) => s.dateISO))

  function toggleSession(dateISO: string) {
    if (scheduledSet.has(dateISO)) {
      setSessions((s) => s.filter((x) => x.dateISO !== dateISO))
      setToast(`Unscheduled ${dayLabel(dateISO)}`)
    } else {
      setSessions((s) => [...s, { id: `new-${dateISO}`, dateISO }])
      setToast(`Session on ${dayLabel(dateISO)}. Players see it on the link.`)
    }
    setTimeout(() => setToast(null), 2600)
  }

  const pick = (d: string) => setParam('day', d)

  const sidePanels = (
    <>
      <BestDays group={liveGroup} month={month} onPick={pick} />
      <Sessions group={liveGroup} onPick={pick} />
      <Players group={liveGroup} month={month} />
    </>
  )

  const mobilePanel = tab === 'best' ? <BestDays group={liveGroup} month={month} onPick={pick} /> : tab === 'players' ? <Players group={liveGroup} month={month} /> : <Sessions group={liveGroup} onPick={pick} />

  return (
    <Shell group={liveGroup} switcherOpen={switcherOpen} onToggleSwitcher={() => setSwitcherOpen((v) => !v)} onSave={openSave}>
      <Nudge group={liveGroup} onSave={openSave} />
      <div className="lg:hidden">
        <ShareLinkCard url={shareUrl(group.token)} compact />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-4">
          <Calendar group={liveGroup} month={month} selected={selected} onSelect={(d) => setParam('day', d)} />
        </div>
        <aside className="hidden flex-col gap-4 lg:flex">
          <ShareLinkCard url={shareUrl(group.token)} onRotate={() => { setToast('Link rotated. Old links stopped working.'); setTimeout(() => setToast(null), 2600) }} />
          {selected ? (
            <DayPanel group={liveGroup} dateISO={selected} scheduled={scheduledSet.has(selected)} onBack={() => setParam('day', null)} onSchedule={() => toggleSession(selected)} />
          ) : null}
          {sidePanels}
        </aside>
        <div className="flex flex-col gap-3 lg:hidden">
          <div role="tablist" className="grid grid-cols-3 rounded-md bg-surface-2 p-1">
            {([['best', 'Best nights'], ['players', 'Players'], ['sessions', 'Sessions']] as const).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)} className={cn('rounded-sm py-1.5 text-sm font-semibold transition-colors', tab === id ? 'bg-surface text-ink shadow-card' : 'text-ink-3')}>
                {label}
              </button>
            ))}
          </div>
          {mobilePanel}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
          <div className="mx-auto max-w-lg px-3 pb-3">
            <DayPanel group={liveGroup} dateISO={selected} scheduled={scheduledSet.has(selected)} onBack={() => setParam('day', null)} onSchedule={() => toggleSession(selected)} />
          </div>
        </div>
      )}

      {saving && <SaveSheet group={liveGroup} onClose={closeSave} />}
      {toast && <Toast>{toast}</Toast>}
    </Shell>
  )
}
