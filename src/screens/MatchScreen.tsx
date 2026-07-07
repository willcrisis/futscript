import { useEffect, useState } from 'react'
import type { GameState, MatchEvent } from '../engine/types'
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

function initialMinute(): number {
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 90 : 0
}

export default function MatchScreen({ fixture, state, onClose }: Props) {
  const [minute, setMinute] = useState(initialMinute)
  const [speed, setSpeed] = useState<1 | 2>(1)
  const done = minute >= 90

  useEffect(() => {
    if (done) return
    const id = setInterval(() => setMinute(m => (m >= 90 ? m : m + 1)), speed === 2 ? 32 : 65)
    return () => clearInterval(id)
  }, [speed])

  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  const visibleEvents = (fixture.events ?? []).filter(e => e.minute <= minute)
  const homeGoals = visibleEvents.filter(e => e.type === 'goal' && e.teamId === fixture.homeId).length
  const awayGoals = visibleEvents.filter(e => e.type === 'goal' && e.teamId === fixture.awayId).length
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
          ({name(fixture.winnerId)} win on penalties)
        </div>
      )}
      <div className="mt-6 flex items-center gap-2">
        {!done ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={speed === 1}
              className={speed === 1 ? 'border-accent text-accent-strong' : ''}
              onClick={() => setSpeed(1)}
            >
              1×
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={speed === 2}
              className={speed === 2 ? 'border-accent text-accent-strong' : ''}
              onClick={() => setSpeed(2)}
            >
              2×
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMinute(90)}>Skip</Button>
          </>
        ) : (
          <Button variant="primary" size="sm" onClick={onClose}>Continue</Button>
        )}
      </div>
      <div className="mt-6 w-full max-w-lg flex-1 overflow-y-auto">
        <EventFeed
          events={visibleEvents.slice().reverse()}
          state={state}
          emphasisTeamId={userInvolved ? state.userTeamId : undefined}
        />
      </div>
    </div>
  )
}
