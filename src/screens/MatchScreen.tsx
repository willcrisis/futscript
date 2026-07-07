import { useEffect, useState } from 'react'
import type { GameState, MatchEvent } from '../engine/types'
import { t, useLang } from '../i18n'
import Button from '../ui/Button'
import EventFeed from '../ui/EventFeed'

export { eventText } from '../ui/EventFeed'

export interface MatchLike {
  homeId: number
  awayId: number
  homeGoals: number | null
  awayGoals: number | null
  winnerId?: number | null
  events?: MatchEvent[]
}

interface Props {
  fixture: MatchLike
  state: GameState
  onClose: () => void
}

const SPEEDS = [
  { key: 'speed.slow', ms: 500 },
  { key: 'speed.medium', ms: 400 },
  { key: 'speed.fast', ms: 300 },
  { key: 'speed.superFast', ms: 150 },
  { key: 'speed.ultraFast', ms: 50 },
] as const

function initialMinute(): number {
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 90 : 0
}

function initialSpeedIndex(): number {
  if (typeof localStorage === 'undefined') return 2
  const stored = Number(localStorage.getItem('futscript-speed'))
  return Number.isInteger(stored) && stored >= 0 && stored <= 4 ? stored : 2
}

export default function MatchScreen({ fixture, state, onClose }: Props) {
  useLang()
  const [minute, setMinute] = useState(initialMinute)
  const [speedIndex, setSpeedIndex] = useState(initialSpeedIndex)
  const done = minute >= 90

  useEffect(() => {
    if (done) return
    const id = setInterval(() => setMinute(m => (m >= 90 ? m : m + 1)), SPEEDS[speedIndex].ms)
    return () => clearInterval(id)
  }, [speedIndex, done])

  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  const visibleEvents = (fixture.events ?? []).filter(e => e.minute <= minute)
  const derivedHome = visibleEvents.filter(e => e.type === 'goal' && e.teamId === fixture.homeId).length
  const derivedAway = visibleEvents.filter(e => e.type === 'goal' && e.teamId === fixture.awayId).length
  const homeGoals = done ? fixture.homeGoals ?? derivedHome : derivedHome
  const awayGoals = done ? fixture.awayGoals ?? derivedAway : derivedAway
  const userInvolved = fixture.homeId === state.userTeamId || fixture.awayId === state.userTeamId

  return (
    <div className="flex min-h-dvh flex-col items-center px-4 pt-2">
      <div className="h-0.5 w-full max-w-lg overflow-hidden rounded-full bg-rule">
        <div className="h-full bg-accent transition-[width]" style={{ width: `${(minute / 90) * 100}%` }} />
      </div>
      <div className="mt-8 flex w-full max-w-lg items-center justify-between gap-4">
        <div className="flex-1 text-right font-medium">{name(fixture.homeId)}</div>
        <div className="shrink-0 font-mono text-4xl font-bold tabular-nums">
          {homeGoals} – {awayGoals}
        </div>
        <div className="flex-1 font-medium">{name(fixture.awayId)}</div>
      </div>
      <div className="mt-1 font-mono text-sm tabular-nums text-ink-muted">{Math.min(minute, 90)}'</div>
      {done && fixture.winnerId != null && homeGoals === awayGoals && (
        <div className="mt-1 text-sm text-ink-muted">
          {t('match.penaltyWin', { name: name(fixture.winnerId) })}
        </div>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {!done ? (
          <>
            {SPEEDS.map((speed, idx) => (
              <Button
                key={idx}
                variant="ghost"
                size="sm"
                aria-pressed={speedIndex === idx}
                className={speedIndex === idx ? 'border-accent! text-accent-strong!' : ''}
                onClick={() => {
                  setSpeedIndex(idx)
                  localStorage.setItem('futscript-speed', String(idx))
                }}
              >
                {t(speed.key)}
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setMinute(90)}>{t('match.skip')}</Button>
          </>
        ) : (
          <Button variant="primary" size="sm" onClick={onClose}>{t('match.continueButton')}</Button>
        )}
      </div>
      <div className="mt-6 w-full max-w-lg flex-1 overflow-y-auto">
        <EventFeed
          events={visibleEvents.slice().reverse()}
          state={state}
          emphasisTeamId={userInvolved ? state.userTeamId : undefined}
          emptyText={t('match.inProgress')}
        />
      </div>
    </div>
  )
}
