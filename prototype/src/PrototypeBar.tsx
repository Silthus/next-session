import { navigate, useLocation } from './router'

const screens: Array<[string, string]> = [
  ['Landing', '/'],
  ['Link created', '/?state=created'],
  ['GM group', '/g/thu'],
  ['GM · day selected', '/g/thu?day=2026-10-16'],
  ['GM · empty group', '/g/fresh'],
  ['GM · many players', '/g/big'],
  ['GM · loading', '/g/thu?state=loading'],
  ['GM · error', '/g/thu?state=error'],
  ['GM · past month', '/g/thu?month=2026-09'],
  ['Save group', '/g/thu?save=1'],
  ['Player · join', '/s/k3Qx9Lm2'],
  ['Player · calendar', '/s/k3Qx9Lm2?as=thu-p0'],
  ['Player · done', '/s/k3Qx9Lm2?as=thu-p0&state=done'],
  ['Player · past month', '/s/k3Qx9Lm2?as=thu-p0&month=2026-09'],
  ['Not found', '/s/nope'],
  ['Terms', '/terms'],
]

export function PrototypeBar({ dark, onToggleDark }: { dark: boolean; onToggleDark: () => void }) {
  const { href } = useLocation()
  if (new URLSearchParams(location.search).get('bar') === '0') return null
  return (
    <div className="fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-yellow-500/40 bg-yellow-300 px-2 py-1.5 text-xs font-semibold text-yellow-950 shadow-lg">
      <span className="px-1">PROTOTYPE</span>
      <select
        aria-label="Screen"
        value={screens.find(([, p]) => p === href)?.[1] ?? ''}
        onChange={(e) => navigate(e.target.value)}
        className="max-w-48 rounded-full bg-yellow-100 px-2 py-1 text-xs"
      >
        <option value="" disabled>
          Jump to screen
        </option>
        {screens.map(([label, path]) => (
          <option key={path} value={path}>
            {label}
          </option>
        ))}
      </select>
      <button type="button" onClick={onToggleDark} className="rounded-full bg-yellow-100 px-2 py-1">
        {dark ? 'Light' : 'Dark'}
      </button>
    </div>
  )
}
