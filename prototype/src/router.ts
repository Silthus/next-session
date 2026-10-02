import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

window.addEventListener('popstate', emit)

export function navigate(to: string, replace = false) {
  if (replace) history.replaceState(null, '', to)
  else history.pushState(null, '', to)
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function snapshot() {
  return location.pathname + location.search
}

export function useLocation() {
  const href = useSyncExternalStore(subscribe, snapshot)
  const url = new URL(href, location.origin)
  return { path: url.pathname, params: url.searchParams, href }
}

export function setParam(key: string, value: string | null, replace = true) {
  const url = new URL(location.href)
  if (value === null) url.searchParams.delete(key)
  else url.searchParams.set(key, value)
  navigate(url.pathname + url.search, replace)
}
