import type { Dispatch, SetStateAction } from 'react'
import { acceptJob, declineOffer, positionOf, restructuredLoan } from '../engine/career'
import { formatMoney, wageBill } from '../engine/finance'
import type { GameState } from '../engine/types'
import { t, useLang } from '../i18n'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import Panel from '../ui/Panel'
import ScreenHeader from '../ui/ScreenHeader'

interface Props {
  state: GameState
  setState: Dispatch<SetStateAction<GameState>>
  onAdvance: () => void
}

export default function UnemployedScreen({ state, setState, onAdvance }: Props) {
  useLang()
  return (
    <div>
      <ScreenHeader label={t('unemployed.header')} title={state.manager.name} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel label={t('unemployed.reputation')}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-rule">
                <div className="h-full bg-accent" style={{ width: `${state.manager.reputation}%` }} />
              </div>
              <span className="font-mono text-xs tabular-nums">{state.manager.reputation}</span>
            </div>
            <Button variant="primary" onClick={onAdvance}>{t('shell.advanceWeek')}</Button>
          </div>
          <p className="mt-3 text-sm text-ink-muted">{t('unemployed.message')}</p>
        </Panel>

        <Panel label={t('unemployed.offersPanel')}>
          {state.manager.jobOffers.length === 0 ? (
            <EmptyState>{t('unemployed.noOffers')}</EmptyState>
          ) : (
            <ul className="flex flex-col gap-3">
              {state.manager.jobOffers.map(o => {
                const club = state.teams.find(tm => tm.id === o.teamId)!
                return (
                  <li key={o.teamId} className="flex flex-col gap-1.5 border-b border-rule/60 pb-3 text-sm last:border-b-0 last:pb-0">
                    <div className="font-medium">
                      {t('unemployed.offerRow', {
                        club: club.name, division: club.division,
                        position: positionOf(state, club.id), squad: club.playerIds.length,
                      })}
                    </div>
                    <div className="text-xs text-ink-muted">
                      {t('unemployed.offerFinances', {
                        cash: formatMoney(club.cash),
                        wages: formatMoney(wageBill(club.id, state)),
                        loan: formatMoney(restructuredLoan(club)),
                      })}
                    </div>
                    <div className="flex gap-1.5">
                      <Button variant="primary" size="sm" onClick={() => setState(s => acceptJob(s, o.teamId))}>
                        {t('unemployed.accept')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setState(s => declineOffer(s, o.teamId))}>
                        {t('unemployed.decline')}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
