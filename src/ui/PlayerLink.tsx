import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

// Opening a player's popup is an App-level concern; screens reach it through context
// instead of prop-drilling. Off-context (e.g. the match replay, rendered before the
// provider) PlayerLink degrades to plain text.
const PlayerNavContext = createContext<((playerId: number) => void) | undefined>(undefined)

export const PlayerNavProvider = PlayerNavContext.Provider
export const usePlayerNav = () => useContext(PlayerNavContext)

const LINK =
  'rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

export default function PlayerLink({ playerId, children, className = '' }: { playerId: number; children: ReactNode; className?: string }) {
  const open = usePlayerNav()
  if (!open) return <>{children}</>
  return (
    <button type="button" onClick={() => open(playerId)} className={`${LINK} ${className}`.trim()}>
      {children}
    </button>
  )
}
