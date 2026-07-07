import { useState } from 'react'
import { standings } from '../engine/standings'
import type { GameState } from '../engine/types'
import DataTable from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import ScreenHeader from '../ui/ScreenHeader'

interface Row {
  pos: number
  teamId: number
  name: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
}

export default function TableScreen({ state }: { state: GameState }) {
  const userDivision = state.teams.find(t => t.id === state.userTeamId)!.division
  const [division, setDivision] = useState(userDivision)
  const divisions = [...new Set(state.teams.map(t => t.division))].sort()
  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  const rows: Row[] = standings(state, division).map((r, i) => ({ pos: i + 1, ...r, name: name(r.teamId) }))

  const columns: Column<Row>[] = [
    { key: 'pos', label: '#', mono: true, render: r => r.pos },
    { key: 'team', label: 'Team', render: r => r.name },
    { key: 'p', label: 'P', align: 'right', mono: true, hideOnMobile: true, render: r => r.played },
    { key: 'w', label: 'W', align: 'right', mono: true, hideOnMobile: true, render: r => r.won },
    { key: 'd', label: 'D', align: 'right', mono: true, hideOnMobile: true, render: r => r.drawn },
    { key: 'l', label: 'L', align: 'right', mono: true, hideOnMobile: true, render: r => r.lost },
    { key: 'gf', label: 'GF', align: 'right', mono: true, hideOnMobile: true, render: r => r.goalsFor },
    { key: 'ga', label: 'GA', align: 'right', mono: true, hideOnMobile: true, render: r => r.goalsAgainst },
    {
      key: 'gd',
      label: 'GD',
      align: 'right',
      mono: true,
      render: r => {
        const gd = r.goalsFor - r.goalsAgainst
        return gd > 0 ? `+${gd}` : gd
      },
    },
    { key: 'pts', label: 'Pts', align: 'right', mono: true, render: r => <strong>{r.points}</strong> },
  ]

  // promotion spine for top 3 in divisions 2-3; relegation spine for bottom 3 in divisions 1-2; user wins any overlap
  const rowAccent = (r: Row): 'user' | 'up' | 'down' | null => {
    if (r.teamId === state.userTeamId) return 'user'
    if (division !== 1 && r.pos <= 3) return 'up'
    if (division !== 3 && r.pos > rows.length - 3) return 'down'
    return null
  }

  return (
    <div>
      <ScreenHeader
        label={`DIVISION ${division}`}
        title="League Table"
        actions={
          divisions.length > 1 && (
            <select
              value={division}
              onChange={e => setDivision(Number(e.target.value))}
              className="rounded-md border border-rule bg-surface-raised px-2 py-1.5 text-sm"
              aria-label="Division"
            >
              {divisions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )
        }
      />
      <DataTable columns={columns} rows={rows} rowKey={r => r.teamId} rowAccent={rowAccent} />
    </div>
  )
}
