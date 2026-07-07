import { useEffect, useState } from 'react'

function currentlyDark(): boolean {
  return document.documentElement.classList.contains('dark')
}

export default function ThemeToggle() {
  const [dark, setDark] = useState(currentlyDark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('futscript-theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <button
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setDark(d => !d)}
      className="rounded-md p-2 text-ink-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
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
