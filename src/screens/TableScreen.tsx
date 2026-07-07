import { useState } from 'react'
import { standings } from '../engine/standings'
import type { GameState } from '../engine/types'
import { t, useLang } from '../i18n'
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
  useLang()
  const userDivision = state.teams.find(t => t.id === state.userTeamId)!.division
  const [division, setDivision] = useState(userDivision)
  const divisions = [...new Set(state.teams.map(t => t.division))].sort()
  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  const rows: Row[] = standings(state, division).map((r, i) => ({ pos: i + 1, ...r, name: name(r.teamId) }))

  const columns: Column<Row>[] = [
    { key: 'pos', label: t('common.pos'), mono: true, render: r => r.pos },
    { key: 'team', label: t('common.team'), render: r => r.name },
    { key: 'p', label: t('table.played'), align: 'right', mono: true, hideOnMobile: true, render: r => r.played },
    { key: 'w', label: t('table.won'), align: 'right', mono: true, hideOnMobile: true, render: r => r.won },
    { key: 'd', label: t('table.drawn'), align: 'right', mono: true, hideOnMobile: true, render: r => r.drawn },
    { key: 'l', label: t('table.lost'), align: 'right', mono: true, hideOnMobile: true, render: r => r.lost },
    { key: 'gf', label: t('table.goalsFor'), align: 'right', mono: true, hideOnMobile: true, render: r => r.goalsFor },
    { key: 'ga', label: t('table.goalsAgainst'), align: 'right', mono: true, hideOnMobile: true, render: r => r.goalsAgainst },
    {
      key: 'gd',
      label: t('common.gd'),
      align: 'right',
      mono: true,
      render: r => {
        const gd = r.goalsFor - r.goalsAgainst
        return gd > 0 ? `+${gd}` : gd
      },
    },
    { key: 'pts', label: t('common.pts'), align: 'right', mono: true, render: r => <strong>{r.points}</strong> },
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
        label={t('table.header', { division })}
        title={t('table.title')}
        actions={
          divisions.length > 1 && (
            <select
              value={division}
              onChange={e => setDivision(Number(e.target.value))}
              className="rounded-md border border-rule bg-surface-raised px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              aria-label={t('common.division')}
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
