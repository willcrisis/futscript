import type { GameState, MatchEvent } from '../engine/types'
import { t, useLang } from '../i18n'

export function eventText(e: MatchEvent, state: GameState): string {
  const player = state.players[e.playerId]?.name ?? '?'
  const sub = e.playerInId != null ? state.players[e.playerInId]?.name : null
  switch (e.type) {
    case 'goal': return t('event.goal', { player })
    case 'chance': return t('event.chance', { player })
    case 'yellow': return t('event.yellow', { player })
    case 'red': return t('event.red', { player })
    case 'injury': return sub
      ? t('event.injurySub', { player, sub })
      : t('event.injuryNoSub', { player })
    case 'penalty': return e.scored
      ? t('event.penaltyScored', { player })
      : t('event.penaltyMissed', { player })
  }
}

function EventIcon({ event, emphasisTeamId }: { event: MatchEvent; emphasisTeamId?: number }) {
  switch (event.type) {
    case 'goal':
      return (
        <span
          aria-hidden
          className={`w-4 shrink-0 text-center ${event.teamId === emphasisTeamId ? 'text-accent' : 'text-ink'}`}
        >
          ●
        </span>
      )
    case 'chance':
      return <span aria-hidden className="w-4 shrink-0 text-center text-ink-faint">○</span>
    case 'yellow':
      return <span aria-hidden className="size-2 shrink-0 self-center bg-warn" />
    case 'red':
      return <span aria-hidden className="size-2 shrink-0 self-center bg-danger" />
    case 'injury':
      return <span aria-hidden className="w-4 shrink-0 text-center font-bold text-danger">+</span>
    case 'penalty':
      return event.scored
        ? <span aria-hidden className={`w-4 shrink-0 text-center ${event.teamId === emphasisTeamId ? 'text-accent' : 'text-ink'}`}>◉</span>
        : <span aria-hidden className="w-4 shrink-0 text-center text-ink-faint">✕</span>
  }
}

interface Props {
  events: MatchEvent[]
  state: GameState
  emphasisTeamId?: number
  emptyText?: string
}

export default function EventFeed({
  events, state, emphasisTeamId, emptyText = t('common.noMatchReport'),
}: Props) {
  useLang()
  const name = (id: number) => state.teams.find(t => t.id === id)!.name

  if (events.length === 0) {
    return <p className="py-1.5 text-sm text-ink-muted">{emptyText}</p>
  }

  return (
    <ol>
      {events.map((e, i) => {
        const muted = emphasisTeamId != null && e.teamId !== emphasisTeamId
        return (
          <li
            key={`${e.minute}-${i}`}
            className={`flex items-baseline gap-2 border-b border-rule/60 py-1.5 text-sm ${muted ? 'text-ink-muted' : ''}`}
          >
            <span className="w-8 shrink-0 font-mono text-ink-faint">{e.minute}'</span>
            <EventIcon event={e} emphasisTeamId={emphasisTeamId} />
            <span className="flex-1">{eventText(e, state)}</span>
            <span className="shrink-0 text-ink-faint">{name(e.teamId)}</span>
          </li>
        )
      })}
    </ol>
  )
}
