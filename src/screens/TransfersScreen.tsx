import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { formatMoney } from '../engine/finance'
import { acceptOffer, counterOffer, placeBid, rejectOffer, requiredBid } from '../engine/transfers'
import type { GameState, TransferListing } from '../engine/types'
import { t, useLang } from '../i18n'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import DataTable from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import EmptyState from '../ui/EmptyState'
import MoneyText from '../ui/MoneyText'
import Panel from '../ui/Panel'
import ScreenHeader from '../ui/ScreenHeader'

interface Props {
  state: GameState
  setState: Dispatch<SetStateAction<GameState>>
}

export default function TransfersScreen({ state, setState }: Props) {
  useLang()
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  const user = state.teams.find(t => t.id === state.userTeamId)!

  const columns: Column<TransferListing>[] = [
    { key: 'player', label: t('common.player'), render: l => state.players[l.playerId].name },
    { key: 'pos', label: t('transfers.posColumn'), hideOnMobile: true, render: l => state.players[l.playerId].position },
    { key: 'lvl', label: t('common.level'), mono: true, render: l => state.players[l.playerId].level },
    { key: 'age', label: t('common.age'), mono: true, hideOnMobile: true, render: l => state.players[l.playerId].age },
    { key: 'seller', label: t('transfers.sellerColumn'), hideOnMobile: true, render: l => name(l.sellerTeamId) },
    {
      key: 'min',
      label: t('transfers.minColumn'),
      mono: true,
      hideOnMobile: true,
      render: l => <MoneyText amount={l.minPrice} size="sm" />,
    },
    {
      key: 'bid',
      label: t('transfers.topBidColumn'),
      mono: true,
      render: l =>
        l.currentBid === null ? (
          <span className="text-ink-faint">—</span>
        ) : (
          <span className="inline-flex flex-wrap items-baseline gap-1">
            <MoneyText amount={l.currentBid} size="sm" />
            <span className="text-ink-faint">{name(l.currentBidderId!)}</span>
          </span>
        ),
    },
    { key: 'ends', label: t('transfers.endsColumn'), mono: true, render: l => t('common.weeksShort', { n: l.roundsLeft }) },
    {
      key: 'action',
      label: '',
      fullWidthOnMobile: true,
      render: l => {
        const mine = l.sellerTeamId === state.userTeamId
        const leading = l.currentBidderId === state.userTeamId
        if (mine) return <Badge tone="muted">{t('transfers.yourListing')}</Badge>
        if (leading) return <Badge tone="accent">{t('transfers.youLead')}</Badge>
        const floor = requiredBid(l)
        const outbid = l.userBid !== undefined && l.currentBidderId !== state.userTeamId && l.currentBidderId !== null
        return (
          <div className="flex flex-col gap-1">
            {outbid && <Badge tone="warn">{t('transfers.outbid', { amount: formatMoney(l.userBid!) })}</Badge>}
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={drafts[l.playerId] ?? floor}
                onChange={e => setDrafts({ ...drafts, [l.playerId]: e.target.value })}
                className="w-24 rounded-md border border-rule bg-surface px-2 py-1 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              />
              <Button
                variant="primary"
                size="sm"
                disabled={floor > user.cash}
                onClick={() => setState(s => placeBid(s, l.playerId, Number(drafts[l.playerId] ?? floor)))}
              >
                {t('transfers.bidButton')}
              </Button>
            </div>
          </div>
        )
      },
    },
  ]

  return (
    <div>
      <ScreenHeader
        label={t('transfers.header')}
        title={t('transfers.title')}
        actions={
          <span className="inline-flex items-baseline gap-1.5 text-xs text-ink-faint">
            {t('transfers.yourCash')} <MoneyText amount={user.cash} />
          </span>
        }
      />

      <div className="flex flex-col gap-4">
        <Panel label={t('transfers.offersPanel')}>
          {state.incomingOffers.length === 0 ? (
            <EmptyState>{t('transfers.noOffers')}</EmptyState>
          ) : (
            <div className="flex flex-col gap-2">
              {state.incomingOffers.map(o => {
                const p = state.players[o.playerId]
                return (
                  <div
                    key={`${o.playerId}-${o.bidderTeamId}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rule bg-surface px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="accent">{t('transfers.offerBadge')}</Badge>
                      <span>
                        {name(o.bidderTeamId)} {t('transfers.offerVerb')} <MoneyText amount={o.amount} size="sm" /> {t('transfers.forWord')} {p.name} (
                        {p.position} {p.level})
                      </span>
                      <span className="text-xs text-ink-faint">{t('transfers.expiresIn', { n: o.roundsLeft })}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setState(s => acceptOffer(s, o.playerId, o.bidderTeamId))}
                      >
                        {t('transfers.acceptButton')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setState(s => counterOffer(s, o.playerId, o.bidderTeamId))}
                      >
                        {t('transfers.counterButton', { amount: formatMoney(Math.round(o.amount * 1.2)) })}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger!"
                        onClick={() => setState(s => rejectOffer(s, o.playerId, o.bidderTeamId))}
                      >
                        {t('transfers.rejectButton')}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        <Panel label={t('transfers.transferListPanel')}>
          <DataTable
            columns={columns}
            rows={state.transferList}
            rowKey={l => l.playerId}
            rowClass={l => (l.sellerTeamId === state.userTeamId ? 'bg-accent/10 font-semibold' : undefined)}
            empty={<EmptyState>{t('transfers.noListings')}</EmptyState>}
          />
        </Panel>
      </div>
    </div>
  )
}
