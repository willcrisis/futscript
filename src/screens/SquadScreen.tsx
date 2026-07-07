import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { formatMoney, marketValue, severanceFor } from '../engine/finance'
import { autoPick, isAvailable, swapIn, updateTeam } from '../engine/lineup'
import { listPlayer, releasePlayer, renewalSalary, renewContract } from '../engine/transfers'
import {
  FORMATIONS,
  type FormationName,
  type GameState,
  type Player,
  type Position,
  type Tactic,
  type TrainingStyle,
} from '../engine/types'

const ORDER: Position[] = ['GK', 'DF', 'MF', 'FW']
const TACTICS: Tactic[] = ['defensive', 'normal', 'attacking']
const TRAINING_STYLES: TrainingStyle[] = ['light', 'normal', 'intensive', 'youth']

function status(p: Player): string {
  if (p.injuredForRounds > 0) return `🚑 ${p.injuredForRounds}`
  if (p.suspendedForRounds > 0) return `⛔ ${p.suspendedForRounds}`
  if (p.yellowCards > 0) return '🟨'.repeat(p.yellowCards)
  return ''
}

function formArrow(form: number): string {
  if (form > 0) return `▲${form}`
  if (form < 0) return `▼${-form}`
  return '–'
}

interface Props {
  state: GameState
  setState: Dispatch<SetStateAction<GameState>>
}

export default function SquadScreen({ state, setState }: Props) {
  const [selling, setSelling] = useState<number | null>(null)
  const [askingPrice, setAskingPrice] = useState(0)
  const [confirmRelease, setConfirmRelease] = useState<number | null>(null)
  const team = state.teams.find(t => t.id === state.userTeamId)!
  const squad = team.playerIds
    .map(id => state.players[id])
    .sort((a, b) => ORDER.indexOf(a.position) - ORDER.indexOf(b.position) || b.level - a.level)

  const withUserTeam = (fn: (s: GameState, t: typeof team) => GameState) =>
    setState(s => fn(s, s.teams.find(t => t.id === s.userTeamId)!))

  return (
    <div>
      <div className="controls">
        <label>
          Formation:{' '}
          <select
            value={team.formation}
            onChange={e => {
              const formation = e.target.value as FormationName
              withUserTeam((s, t) => {
                const next = { ...t, formation }
                return updateTeam(s, t.id, { formation, lineup: autoPick(next, s.players) })
              })
            }}
          >
            {Object.keys(FORMATIONS).map(f => <option key={f}>{f}</option>)}
          </select>
        </label>{' '}
        <label>
          Tactic:{' '}
          <select
            value={team.tactic}
            onChange={e => {
              const tactic = e.target.value as Tactic
              withUserTeam((s, t) => updateTeam(s, t.id, { tactic }))
            }}
          >
            {TACTICS.map(t => <option key={t}>{t}</option>)}
          </select>
        </label>{' '}
        <label>
          Training:{' '}
          <select
            value={team.trainingStyle}
            onChange={e => {
              const trainingStyle = e.target.value as TrainingStyle
              withUserTeam((s, t) => updateTeam(s, t.id, { trainingStyle }))
            }}
          >
            {TRAINING_STYLES.map(t => <option key={t}>{t}</option>)}
          </select>
        </label>{' '}
        <button onClick={() => withUserTeam((s, t) => updateTeam(s, t.id, { lineup: autoPick(t, s.players) }))}>
          Auto-pick
        </button>{' '}
        <label>
          <input
            type="checkbox"
            checked={state.playFriendlies}
            onChange={e => {
              const playFriendlies = e.target.checked
              setState(s => ({ ...s, playFriendlies }))
            }}
          />{' '}
          Friendlies on free weeks
        </label>
      </div>
      <table>
        <thead>
          <tr>
            <th>Pos</th><th>Name</th><th>Age</th><th>Level</th><th>Form</th><th>Fit</th>
            <th>Status</th><th>Salary</th><th>Contract</th><th>Value</th><th></th>
          </tr>
        </thead>
        <tbody>
          {squad.map(p => {
            const starting = team.lineup.includes(p.id)
            return (
              <tr key={p.id} className={starting ? 'starting' : ''}>
                <td>{p.position}</td>
                <td>{p.name}</td>
                <td>{p.age}</td>
                <td>{p.level}</td>
                <td>{formArrow(p.form)}</td>
                <td>{p.fitness}%</td>
                <td>{status(p)}</td>
                <td>{formatMoney(p.salary)}/wk</td>
                <td>{p.contractSeasons}y</td>
                <td>{formatMoney(marketValue(p))}</td>
                <td className="actions">
                  {selling === p.id ? (
                    <>
                      <input
                        type="number"
                        value={askingPrice}
                        onChange={e => setAskingPrice(Number(e.target.value))}
                        style={{ width: '7rem' }}
                      />
                      <button onClick={() => { setState(s => listPlayer(s, p.id, askingPrice)); setSelling(null) }}>List</button>
                      <button onClick={() => setSelling(null)}>✕</button>
                    </>
                  ) : confirmRelease === p.id ? (
                    <>
                      <button onClick={() => { setState(s => releasePlayer(s, p.id)); setConfirmRelease(null) }}>
                        Confirm release ({formatMoney(-severanceFor(p))})
                      </button>
                      <button onClick={() => setConfirmRelease(null)}>✕</button>
                    </>
                  ) : (
                    <>
                      {starting
                        ? 'Starting'
                        : <button
                            disabled={!isAvailable(p)}
                            onClick={() => withUserTeam((s, t) => updateTeam(s, t.id, { lineup: swapIn(t, s.players, p.id) }))}
                          >
                            Start
                          </button>}
                      {state.transferList.some(l => l.playerId === p.id)
                        ? ' · listed'
                        : <button onClick={() => { setSelling(p.id); setAskingPrice(marketValue(p)) }}>Sell</button>}
                      <button onClick={() => setConfirmRelease(p.id)}>Release</button>
                      {p.contractSeasons <= 1 && (
                        <button onClick={() => setState(s => renewContract(s, p.id))}>
                          Renew ({formatMoney(renewalSalary(p))}/wk)
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
