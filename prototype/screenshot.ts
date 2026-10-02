import { chromium } from 'playwright-core'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.BASE_URL ?? 'http://localhost:5190'
const OUT = join(import.meta.dirname, 'screenshots')

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const cache = join(process.env.HOME ?? '', '.cache/ms-playwright')
  const dir = readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().at(-1)
  if (!dir) throw new Error('No Playwright chromium found; set CHROMIUM_PATH')
  const inner = readdirSync(join(cache, dir)).find((d) => d.startsWith('chrome-headless-shell-'))
  return join(cache, dir, inner!, 'chrome-headless-shell')
}

const screens: Array<{ name: string; path: string; full?: boolean }> = [
  { name: 'landing', path: '/' },
  { name: 'link-created', path: '/?state=created' },
  { name: 'gm-group', path: '/g/thu' },
  { name: 'gm-day-selected', path: '/g/thu?day=2026-10-16' },
  { name: 'gm-empty', path: '/g/fresh' },
  { name: 'gm-many-players', path: '/g/big' },
  { name: 'gm-loading', path: '/g/thu?state=loading' },
  { name: 'gm-error', path: '/g/thu?state=error' },
  { name: 'gm-past-month', path: '/g/thu?month=2026-09' },
  { name: 'save-group', path: '/g/thu?save=1' },
  { name: 'player-join', path: '/s/k3Qx9Lm2' },
  { name: 'player-calendar', path: '/s/k3Qx9Lm2?as=thu-p0' },
  { name: 'player-done', path: '/s/k3Qx9Lm2?as=thu-p0&state=done' },
  { name: 'player-past-month', path: '/s/k3Qx9Lm2?as=thu-p0&month=2026-09' },
  { name: 'not-found', path: '/s/nope' },
  { name: 'legal-terms', path: '/terms' },
]

const viewports = [
  { tag: 'mobile', width: 390, height: 844 },
  { tag: 'desktop', width: 1440, height: 900 },
]

const themes = ['light', 'dark'] as const

const only = process.argv.slice(2)

const browser = await chromium.launch({ executablePath: findChromium() })
for (const vp of viewports) {
  for (const theme of themes) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, colorScheme: theme })
    const page = await context.newPage()
    for (const s of screens) {
      if (only.length && !only.includes(s.name)) continue
      const url = `${BASE}${s.path}${s.path.includes('?') ? '&' : '?'}bar=0&theme=${theme}`
      await page.goto(url, { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(150)
      const file = join(OUT, `${s.name}--${vp.tag}--${theme}.png`)
      await page.screenshot({ path: file, fullPage: vp.tag === 'mobile' && s.name !== 'save-group' })
      console.log(file)
    }
    await context.close()
  }
}
await browser.close()
