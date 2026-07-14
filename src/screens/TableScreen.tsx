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

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

interface Props {
  state: GameState
  onShowClub?: (teamId: number) => void
}

export default function TableScreen({ state, onShowClub }: Props) {
  useLang()
  const userDivision = state.teams.find(t => t.id === state.userTeamId)!.division
  const [division, setDivision] = useState(userDivision)
  const [highlightId, setHighlightId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const divisions = [...new Set(state.teams.map(t => t.division))].sort()
  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  const rows: Row[] = standings(state, division).map((r, i) => ({ pos: i + 1, ...r, name: name(r.teamId) }))
  const lowestDivision = Math.max(...state.teams.map(t => t.division))

  const onSearch = (raw: string) => {
    setQuery(raw)
    const q = raw.trim()
    if (q.length < 2) {
      setHighlightId(null)
      return
    }
    const needle = fold(q)
    const match = state.teams.find(t => fold(t.name).includes(needle))
    if (match) {
      setDivision(match.division)
      setHighlightId(match.id)
    } else {
      setHighlightId(null)
    }
  }

  const noMatch = query.trim().length >= 2 && highlightId === null

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

  // promotion spine for top 3 in non-top divisions; relegation spine for bottom 3 in non-bottom divisions
  const rowAccent = (r: Row): 'up' | 'down' | null => {
    if (division !== 1 && r.pos <= 3) return 'up'
    if (division !== lowestDivision && r.pos > rows.length - 3) return 'down'
    return null
  }

  return (
    <div>
      <ScreenHeader
        label={t('table.header', { division })}
        title={t('table.title')}
        actions={
          <>
            <input
              type="search"
              value={query}
              onChange={e => onSearch(e.target.value)}
              placeholder={t('table.searchPlaceholder')}
              aria-label={t('table.searchLabel')}
              className="w-40 rounded-md border border-rule bg-surface-raised px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            />
            {divisions.length > 1 && (
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{t('common.division')}</span>
                <select
                  value={division}
                  onChange={e => { setDivision(Number(e.target.value)); setHighlightId(null); setQuery('') }}
                  className="rounded-md border border-rule bg-surface-raised px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  {divisions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
            )}
          </>
        }
      />
      {noMatch && (
        <p className="mb-3 text-sm text-ink-faint">{t('table.searchNoMatch', { query: query.trim() })}</p>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={r => r.teamId}
        rowAccent={rowAccent}
        rowClass={r => {
          const classes = []
          if (r.teamId === state.userTeamId) classes.push('bg-accent/10 font-semibold')
          if (r.teamId === highlightId) classes.push('ring-1 ring-accent')
          return classes.length ? classes.join(' ') : undefined
        }}
        onRowClick={onShowClub ? r => onShowClub(r.teamId) : undefined}
      />
    </div>
  )
}
