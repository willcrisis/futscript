import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

// Opening a club's page is an App-level concern; screens reach it through context
// instead of prop-drilling onShowClub down every branch. Off-context (e.g. the
// full-screen match replay, rendered before the provider) ClubLink degrades to plain text.
const ClubNavContext = createContext<((teamId: number) => void) | undefined>(undefined)

export const ClubNavProvider = ClubNavContext.Provider
export const useClubNav = () => useContext(ClubNavContext)

const LINK =
  'rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

export default function ClubLink({ teamId, children, className = '' }: { teamId: number; children: ReactNode; className?: string }) {
  const open = useClubNav()
  if (!open) return <>{children}</>
  return (
    <button type="button" onClick={() => open(teamId)} className={`${LINK} ${className}`.trim()}>
      {children}
    </button>
  )
}
