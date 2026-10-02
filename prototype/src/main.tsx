import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { useLocation } from './router'
import { PrototypeBar } from './PrototypeBar'
import { Landing } from './screens/Landing'
import { GroupScreen } from './screens/Group'
import { PlayerScreen } from './screens/Player'
import { LegalScreen } from './screens/Legal'
import { NotFoundScreen } from './screens/NotFound'

function useTheme() {
  const initial = new URLSearchParams(location.search).get('theme')
  const [dark, setDark] = useState(initial ? initial === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])
  return { dark, toggle: () => setDark((d) => !d) }
}

function App() {
  const { path } = useLocation()
  const { dark, toggle } = useTheme()

  let screen
  if (path === '/') screen = <Landing />
  else if (path.startsWith('/g/')) screen = <GroupScreen groupId={path.slice(3)} />
  else if (path.startsWith('/s/')) screen = <PlayerScreen token={path.slice(3)} />
  else if (path === '/terms' || path === '/privacy' || path === '/imprint') screen = <LegalScreen page={path.slice(1) as 'terms' | 'privacy' | 'imprint'} />
  else screen = <NotFoundScreen kind="page" />

  return (
    <>
      {screen}
      <PrototypeBar dark={dark} onToggleDark={toggle} />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
