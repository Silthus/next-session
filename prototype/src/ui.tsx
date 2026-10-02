import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useState } from 'react'
import { navigate } from './router'

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function Logo({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="9" className="fill-accent" />
      <rect x="2" y="2" width="28" height="7" rx="4" className="fill-accent-strong" style={{ clipPath: 'inset(0 0 0 0 round 9px 9px 0 0)' }} />
      <circle cx="16" cy="19" r="5" className="fill-accent-ink" />
    </svg>
  )
}

export function Wordmark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const text = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-lg'
  const logo = size === 'lg' ? 'size-9' : size === 'sm' ? 'size-6' : 'size-7'
  return (
    <a href="/" onClick={(e) => { e.preventDefault(); navigate('/') }} className="inline-flex items-center gap-2.5 text-ink">
      <Logo className={logo} />
      <span className={cn('font-display font-bold tracking-tight', text)}>Next Session</span>
    </a>
  )
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'free' | 'soft'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-strong shadow-card',
  secondary: 'bg-surface text-ink border border-line hover:border-line-strong',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-busy-soft text-busy hover:brightness-95',
  free: 'bg-free text-white hover:brightness-105',
  soft: 'bg-accent-soft text-accent hover:brightness-95 dark:hover:brightness-110',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-sm',
  md: 'h-10 px-4 text-sm gap-2 rounded-md',
  lg: 'h-14 px-6 text-base gap-2.5 rounded-lg',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-semibold transition-[background-color,color,transform,border-color,filter] duration-150 ease-[var(--ease-snap)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-lg border border-line bg-surface p-4 shadow-card', className)}>{children}</section>
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ink-3', className)}>{children}</h2>
}

export function initials(name: string) {
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

const avatarHues = ['bg-accent-soft text-accent', 'bg-free-soft text-free', 'bg-maybe-soft text-maybe', 'bg-busy-soft text-busy']

export function Avatar({ name, size = 'md', className }: { name: string; size?: 'xs' | 'sm' | 'md'; className?: string }) {
  const hue = avatarHues[(name.charCodeAt(0) + name.length) % avatarHues.length]
  const dims = size === 'xs' ? 'size-5 text-[9px]' : size === 'sm' ? 'size-7 text-[11px]' : 'size-9 text-xs'
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-bold', hue, dims, className)} aria-hidden="true">
      {initials(name)}
    </span>
  )
}

export function Dot({ state }: { state: 'yes' | 'maybe' | 'no' | null }) {
  return (
    <span
      className={cn(
        'inline-block size-2 rounded-full',
        state === 'yes' && 'bg-free',
        state === 'maybe' && 'bg-maybe',
        state === 'no' && 'bg-busy',
        state === null && 'bg-line-strong',
      )}
    />
  )
}

export function IconCopy() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    </svg>
  )
}

export function IconCheck({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  )
}

export function IconStar({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path d="M10 1.8l2.5 5.3 5.8.7-4.3 4 1.1 5.8L10 14.8l-5.1 2.8 1.1-5.8-4.3-4 5.8-.7z" />
    </svg>
  )
}

export function IconChevron({ dir = 'down', className = 'size-4' }: { dir?: 'down' | 'left' | 'right' | 'up'; className?: string }) {
  const rotate = { down: 'rotate-0', left: 'rotate-90', right: '-rotate-90', up: 'rotate-180' }[dir]
  return (
    <svg viewBox="0 0 20 20" className={cn(className, rotate)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 7.5l5 5 5-5" />
    </svg>
  )
}

export function IconMore() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden="true">
      <circle cx="4" cy="10" r="1.6" />
      <circle cx="10" cy="10" r="1.6" />
      <circle cx="16" cy="10" r="1.6" />
    </svg>
  )
}

export function ShareIcons() {
  const items = [
    { label: 'WhatsApp', glyph: 'W', tone: 'bg-[#25D366] text-white' },
    { label: 'Telegram', glyph: 'T', tone: 'bg-[#2AABEE] text-white' },
    { label: 'Mail', glyph: '@', tone: 'bg-surface-2 text-ink' },
    { label: 'Share', glyph: '↗', tone: 'bg-surface-2 text-ink' },
  ]
  return (
    <div className="flex items-center gap-2">
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          aria-label={`Share via ${it.label}`}
          className={cn('inline-flex size-10 items-center justify-center rounded-full text-sm font-bold transition-transform hover:scale-105 active:scale-95', it.tone)}
        >
          {it.glyph}
        </button>
      ))}
    </div>
  )
}

export function ShareLinkCard({ url, compact = false, onRotate }: { url: string; compact?: boolean; onRotate?: () => void }) {
  const [copied, setCopied] = useState(false)
  const display = url.replace(/^https?:\/\//, '')
  function copy() {
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }
  return (
    <div className={cn('rounded-lg border border-accent/30 bg-accent-soft/60 dark:bg-accent-soft/40', compact ? 'p-3' : 'p-4')}>
      <div className="flex items-center justify-between gap-3">
        <Eyebrow className="text-accent">Player link</Eyebrow>
        {onRotate && (
          <button type="button" onClick={onRotate} className="text-xs font-medium text-ink-3 hover:text-ink">
            Rotate
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-surface px-3 py-2.5 font-mono text-sm text-ink">{display}</code>
        <Button variant={copied ? 'free' : 'primary'} onClick={copy} className="min-w-24">
          {copied ? <IconCheck /> : <IconCopy />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      {!compact && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <ShareIcons />
          <p className="hidden text-xs text-ink-3 sm:block">Anyone with the link can answer. Keep it in the group.</p>
        </div>
      )}
    </div>
  )
}

export function LegalFooter({ className }: { className?: string }) {
  const link = 'hover:text-ink transition-colors'
  return (
    <footer className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3', className)}>
      <a href="/terms" className={link} onClick={(e) => { e.preventDefault(); navigate('/terms') }}>Terms</a>
      <a href="/privacy" className={link} onClick={(e) => { e.preventDefault(); navigate('/privacy') }}>Privacy</a>
      <a href="/imprint" className={link} onClick={(e) => { e.preventDefault(); navigate('/imprint') }}>Imprint</a>
    </footer>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-2', className)} aria-hidden="true" />
}

export function Toast({ children, action, onAction }: { children: ReactNode; action?: string; onAction?: () => void }) {
  return (
    <div role="status" className="animate-rise fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-paper shadow-card">
      {children}
      {action && (
        <button type="button" onClick={onAction} className="font-semibold text-accent-strong underline-offset-2 hover:underline dark:text-accent">
          {action}
        </button>
      )}
    </div>
  )
}
