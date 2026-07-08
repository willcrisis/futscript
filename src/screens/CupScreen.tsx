import { useState } from 'react'
import { CUP_WEEKS } from '../engine/fixtures'
import type { CupFixture, GameState } from '../engine/types'
import { t, useLang } from '../i18n'
import type { TranslationKey } from '../i18n'
import Badge from '../ui/Badge'
import EmptyState from '../ui/EmptyState'
import EventFeed from '../ui/EventFeed'
import Panel from '../ui/Panel'
import ScreenHeader from '../ui/ScreenHeader'
import SectionLabel from '../ui/SectionLabel'

const ROUND_NAME_KEYS: TranslationKey[] = [
  'cup.round1', 'cup.round2', 'cup.roundOf16', 'cup.quarterFinals', 'cup.semiFinals', 'cup.roundFinal',
]

const ROW = 'grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border border-rule bg-surface-raised px-3 py-2'
const SPINE = 'shadow-[inset_3px_0_0_0_var(--accent)]'

function ClubName({ name, division, onClick }: { name: string; division: number; onClick?: () => void }) {
  const content = (
    <span>
      {name} <span className="text-ink-faint">· D{division}</span>
    </span>
  )
  if (!onClick) return content
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {content}
    </button>
  )
}

function TieRow({
  f, name, divisionOf, isUser, onToggle, onShowClub,
}: {
  f: CupFixture
  name: (id: number) => string
  divisionOf: (id: number) => number
  isUser: boolean
  onToggle: () => void
  onShowClub?: (teamId: number) => void
}) {
  const played = f.homeGoals !== null
  const penalties = f.winnerId !== null && f.homeGoals === f.awayGoals
  const loser = (id: number) => f.winnerId !== null && f.winnerId !== id
  const rowClass = `${ROW} ${isUser ? SPINE : ''}`
  return (
    <div className={rowClass}>
      <div className={`flex items-center justify-end gap-2 text-right ${loser(f.homeId) ? 'text-ink-faint' : ''}`}>
        {f.winnerId === f.homeId && <Badge tone="accent">{t('cup.through')}</Badge>}
        <ClubName name={name(f.homeId)} division={divisionOf(f.homeId)} onClick={onShowClub ? () => onShowClub(f.homeId) : undefined} />
      </div>
      <div className="text-center font-mono text-sm tabular-nums">
        {played ? (
          <button
            type="button"
            className="rounded-sm transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            onClick={onToggle}
          >
            {`${f.homeGoals} – ${f.awayGoals}`}
          </button>
        ) : (
          <span className="text-ink-muted">{t('common.vs')}</span>
        )}
        {penalties && <span className="text-ink-faint"> {t('cup.penalties')}</span>}
      </div>
      <div className={`flex items-center gap-2 text-left ${loser(f.awayId) ? 'text-ink-faint' : ''}`}>
        <ClubName name={name(f.awayId)} division={divisionOf(f.awayId)} onClick={onShowClub ? () => onShowClub(f.awayId) : undefined} />
        {f.winnerId === f.awayId && <Badge tone="accent">{t('cup.through')}</Badge>}
      </div>
    </div>
  )
}

export default function CupScreen({ state, onShowClub }: { state: GameState; onShowClub?: (teamId: number) => void }) {
  useLang()
  const [selected, setSelected] = useState<CupFixture | null>(null)
  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  const divisionOf = (id: number) => state.teams.find(t => t.id === id)!.division
  if (state.cupFixtures.length === 0) {
    return (
      <div>
        <ScreenHeader label={t('cup.header')} title={t('cup.title')} />
        <EmptyState>{t('cup.noCupThisSeason')}</EmptyState>
      </div>
    )
  }
  const rounds = [...new Set(state.cupFixtures.map(f => f.cupRound))].sort((a, b) => a - b)
  const final = state.cupFixtures.reduce((a, b) => (b.cupRound > a.cupRound ? b : a))
  const champion =
    final.cupRound === CUP_WEEKS.length && final.winnerId !== null ? name(final.winnerId) : null
  return (
    <div>
      <ScreenHeader label={t('cup.header')} title={t('cup.title')} />
      {champion && (
        <Panel className="mb-4">
          <p className="text-lg font-semibold">{t('cup.championMessage', { name: champion })}</p>
        </Panel>
      )}
      <div className="flex flex-col gap-6">
        {rounds.map(r => (
          <div key={r}>
            <SectionLabel>
              {t('cup.roundWeek', { round: t(ROUND_NAME_KEYS[r - 1]), week: CUP_WEEKS[r - 1] })}
            </SectionLabel>
            <div className="mt-2 flex flex-col gap-2">
              {state.cupFixtures.filter(f => f.cupRound === r).map((f, i) => (
                <TieRow
                  key={i}
                  f={f}
                  name={name}
                  divisionOf={divisionOf}
                  isUser={[f.homeId, f.awayId].includes(state.userTeamId)}
                  onToggle={() => { if (f.homeGoals === null) return; setSelected(f !== selected ? f : null) }}
                  onShowClub={onShowClub}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {selected && (
        <Panel className="mt-4">
          <h3 className="mb-2 flex flex-wrap items-baseline gap-1.5 font-semibold">
            <ClubName name={name(selected.homeId)} division={divisionOf(selected.homeId)} onClick={onShowClub ? () => onShowClub(selected.homeId) : undefined} />
            <span>{selected.homeGoals} – {selected.awayGoals}</span>
            <ClubName name={name(selected.awayId)} division={divisionOf(selected.awayId)} onClick={onShowClub ? () => onShowClub(selected.awayId) : undefined} />
          </h3>
          <EventFeed events={selected.events ?? []} state={state} />
        </Panel>
      )}
    </div>
  )
}
