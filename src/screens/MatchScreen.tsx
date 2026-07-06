import { useEffect, useState } from 'react'
import type { Fixture, GameState, MatchEvent } from '../engine/types'

export function eventText(e: MatchEvent, state: GameState): string {
  const player = state.players[e.playerId]?.name ?? '?'
  const sub = e.playerInId != null ? state.players[e.playerInId]?.name : null
  switch (e.type) {
    case 'goal': return `⚽ GOAL! ${player}`
    case 'chance': return `Chance for ${player} — saved!`
    case 'yellow': return `🟨 ${player} is booked`
    case 'red': return `🟥 ${player} is sent off!`
    case 'injury': return sub
      ? `🚑 ${player} goes down injured — ${sub} comes on`
      : `🚑 ${player} goes down injured — no substitute left!`
  }
}

interface Props {
  fixture: Fixture
  state: GameState
  onClose: () => void
}

export default function MatchScreen({ fixture, state, onClose }: Props) {
  const [minute, setMinute] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setMinute(m => (m >= 90 ? m : m + 1)), 65)
    return () => clearInterval(id)
  }, [])

  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  const events = (fixture.events ?? []).filter(e => e.minute <= minute)
  const hg = events.filter(e => e.type === 'goal' && e.teamId === fixture.homeId).length
  const ag = events.filter(e => e.type === 'goal' && e.teamId === fixture.awayId).length

  return (
    <div className="app">
      <h2>
        {name(fixture.homeId)} {hg} – {ag} {name(fixture.awayId)}
      </h2>
      <p className="minute">{Math.min(minute, 90)}'</p>
      <ul className="ticker">
        {events.slice().reverse().map((e, i) => (
          <li key={`${e.minute}-${i}`}>
            <strong>{e.minute}'</strong> {eventText(e, state)}{' '}
            <em>({name(e.teamId)})</em>
          </li>
        ))}
      </ul>
      {minute < 90
        ? <button onClick={() => setMinute(90)}>Skip to result</button>
        : <button onClick={onClose}>Continue</button>}
    </div>
  )
}
