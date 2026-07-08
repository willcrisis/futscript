import type { ReactNode } from 'react'

function Icon({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden
    >
      {children}
    </svg>
  )
}

export const HomeIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></Icon>
)
export const SquadIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21 20c0-2.8-1.9-5.1-4.5-5.8" /></Icon>
)
export const TableIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M4 6h16M4 12h16M4 18h10" /></Icon>
)
export const FixturesIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4m8-4v4M4 11h16" /></Icon>
)
export const CupIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4M12 13v4m-3 4h6m-3-4v4" /></Icon>
)
export const StatsIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M5 20V12m7 8V6m7 14v-5" /></Icon>
)
export const TransfersIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M4 8h13m0 0-3-3m3 3-3 3M20 16H7m0 0 3-3m-3 3 3 3" /></Icon>
)
export const FinanceIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M3 11h18" /><circle cx="12" cy="15" r="1.5" /></Icon>
)
export const HistoryIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" /><path d="M9 8h6M9 12h6" /></Icon>
)
export const SavesIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M5 4h11l3 3v13H5V4Z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></Icon>
)
export const MoreIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Icon>
)
export const PlayIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M8 5v14l11-7L8 5Z" /></Icon>
)
export const TagIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M3 12V4h8l10 10-8 8L3 12Z" /><circle cx="8" cy="9" r="1.2" /></Icon>
)
export const ExitIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M9 4H5v16h4M14 8l4 4-4 4M18 12H9" /></Icon>
)
export const RenewIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M20 6v5h-5M4 18v-5h5" /><path d="M19.5 11a8 8 0 0 0-14-4M4.5 13a8 8 0 0 0 14 4" /></Icon>
)
// ponytail: literal football-card colors — a card reads yellow/red in any theme, not a token.
export const YellowCardIcon = ({ className }: { className?: string }) => (
  <svg width="11" height="15" viewBox="0 0 11 15" className={className} aria-hidden>
    <rect x="0.5" y="0.5" width="10" height="14" rx="1.5" fill="#eab308" />
  </svg>
)
export const PlusIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M12 5v14M5 12h14" /></Icon>
)
export const MinusIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M5 12h14" /></Icon>
)
// slashed tag = cancel listing
export const DelistIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M9 5H6a2 2 0 0 0-2 2v3l7 7 3-3" /><circle cx="8" cy="9" r="1" /><path d="M4 4l16 16" />
  </Icon>
)
