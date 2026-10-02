export type Availability = 'yes' | 'maybe' | 'no'

export interface Player {
  id: string
  name: string
}

export interface Session {
  id: string
  dateISO: string
}

export interface Group {
  id: string
  name: string
  token: string
  players: Player[]
  sessions: Session[]
  availability: Record<string, Record<string, Availability>>
}

export const TODAY = '2026-10-02'
export const ORIGIN = 'next-session.link'

const names = ['Ana', 'Ben', 'Chiara', 'Dev', 'Eli', 'Fatima', 'Gus', 'Hana', 'Ivo', 'Jules', 'Kai', 'Lena']

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967295
}

function monthDays(monthISO: string) {
  const [y, m] = monthISO.split('-').map(Number)
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: count }, (_, i) => `${monthISO}-${String(i + 1).padStart(2, '0')}`)
}

function generateAvailability(players: Player[], months: string[], seed: string) {
  const out: Record<string, Record<string, Availability>> = {}
  for (const p of players) {
    out[p.id] = {}
    for (const month of months) {
      for (const d of monthDays(month)) {
        const r = hash(seed + p.id + d)
        const weekday = new Date(d).getUTCDay()
        const gameNight = weekday === 4 || weekday === 5 || weekday === 6
        const boost = gameNight ? 0.28 : 0
        const firstPlayerStillFilling = p.id.endsWith('-p0') && d >= '2026-10-18'
        if (firstPlayerStillFilling) continue
        if (r < 0.1) continue
        if (r < 0.58 + boost) out[p.id][d] = 'yes'
        else if (r < 0.74 + boost) out[p.id][d] = 'maybe'
        else out[p.id][d] = 'no'
      }
    }
  }
  return out
}

function makeGroup(id: string, name: string, token: string, playerCount: number, sessions: Session[]): Group {
  const players = names.slice(0, playerCount).map((n, i) => ({ id: `${id}-p${i}`, name: n }))
  return {
    id,
    name,
    token,
    players,
    sessions,
    availability: generateAvailability(players, ['2026-09', '2026-10', '2026-11', '2026-12'], id),
  }
}

export const groups: Group[] = [
  makeGroup('thu', 'Thursday Crew', 'k3Qx9Lm2', 5, [
    { id: 's1', dateISO: '2026-10-16' },
    { id: 's2', dateISO: '2026-09-18' },
    { id: 's3', dateISO: '2026-09-04' },
  ]),
  makeGroup('curse', 'Curse of Strahd', 'Zp81vRq_', 4, [{ id: 's4', dateISO: '2026-10-24' }]),
  makeGroup('board', 'Board game night', 'Hs7wN2aT', 7, []),
]

export const manyPlayersGroup = makeGroup('big', 'West Marches', 'Q9aLm3Zx', 12, [
  { id: 's5', dateISO: '2026-10-10' },
])

export const emptyGroup: Group = {
  id: 'fresh',
  name: 'My group',
  token: 'Nf4kB2xQ',
  players: [],
  sessions: [],
  availability: {},
}

export function shareUrl(token: string) {
  return `https://${ORIGIN}/s/${token}`
}

export const legal = {
  terms: {
    title: 'Terms of Use',
    updated: '2026-10-02',
    sections: [
      ['What Next Session is', 'Next Session lets a game master share one link so players can mark the days they can play. It is free to use.'],
      ['Your group and your link', 'Anyone with your share link can see the roster names and mark availability for any of them. Keep the link inside your group. You can rotate it any time.'],
      ['Groups without an account', 'A group created without an account is deleted after 30 days without activity. Save it to an account to keep it.'],
      ['Acceptable use', 'Do not use Next Session to harass people, to scrape data, or to run automated traffic against it.'],
      ['Liability', 'Next Session is provided as is. We do our best to keep it running but make no promises.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    updated: '2026-10-02',
    sections: [
      ['What we store', 'Group names, player names as typed by the GM or the player, per-day availability, scheduled dates, and for signed-in GMs the email address of the sign-in provider.'],
      ['Cookies', 'One strictly necessary cookie remembers which roster name you picked on a share link. Signed-in GMs get a session cookie. There are no analytics or tracking cookies.'],
      ['Where it runs', 'Data is stored on Convex and the site is served from Cloudflare. Both act as processors.'],
      ['Your rights', 'Ask the controller to export or delete your data at any time.'],
    ],
  },
  imprint: {
    title: 'Imprint',
    updated: '2026-10-02',
    sections: [
      ['Controller', 'Michael Reichenbach. Address and contact details to be provided by the controller.'],
      ['Contact', 'hello@next-session.link'],
    ],
  },
} as const

export type LegalKey = keyof typeof legal
