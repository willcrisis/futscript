import { useSyncExternalStore } from 'react'

// Module-level store: the html.dark class is the single source of truth, so
// every mounted instance (sidebar + more-sheet) reads the same snapshot and
// stays in sync via a shared MutationObserver instead of local state.
const listeners = new Set<() => void>()
let observer: MutationObserver | null = null

function subscribe(onChange: () => void) {
  if (!observer) {
    observer = new MutationObserver(() => listeners.forEach(l => l()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  }
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains('dark')
}

export default function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, getSnapshot)

  const toggle = () => {
    const next = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('futscript-theme', next ? 'dark' : 'light')
  }

  return (
    <button
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={toggle}
      className="rounded-md p-2 text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      {dark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
    </button>
  )
}
