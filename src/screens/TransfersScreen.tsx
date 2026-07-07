import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { formatMoney } from '../engine/finance'
import { acceptOffer, counterOffer, placeBid, rejectOffer, requiredBid } from '../engine/transfers'
import type { GameState, TransferListing } from '../engine/types'
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
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  const user = state.teams.find(t => t.id === state.userTeamId)!

  const columns: Column<TransferListing>[] = [
    { key: 'player', label: 'Player', render: l => state.players[l.playerId].name },
    { key: 'pos', label: 'Pos', hideOnMobile: true, render: l => state.players[l.playerId].position },
    { key: 'lvl', label: 'Lvl', mono: true, render: l => state.players[l.playerId].level },
    { key: 'age', label: 'Age', mono: true, hideOnMobile: true, render: l => state.players[l.playerId].age },
    { key: 'seller', label: 'Seller', hideOnMobile: true, render: l => name(l.sellerTeamId) },
    {
      key: 'min',
      label: 'Min',
      mono: true,
      hideOnMobile: true,
      render: l => <MoneyText amount={l.minPrice} size="sm" />,
    },
    {
      key: 'bid',
      label: 'Top bid',
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
    { key: 'ends', label: 'Ends', mono: true, render: l => `${l.roundsLeft}w` },
    {
      key: 'action',
      label: '',
      render: l => {
        const mine = l.sellerTeamId === state.userTeamId
        const leading = l.currentBidderId === state.userTeamId
        if (mine) return <Badge tone="muted">your listing</Badge>
        if (leading) return <Badge tone="accent">you lead</Badge>
        const floor = requiredBid(l)
        return (
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={drafts[l.playerId] ?? floor}
              onChange={e => setDrafts({ ...drafts, [l.playerId]: e.target.value })}
              className="w-24 rounded-md border border-rule bg-surface px-2 py-1 text-xs font-mono"
            />
            <Button
              variant="primary"
              size="sm"
              disabled={floor > user.cash}
              onClick={() => setState(s => placeBid(s, l.playerId, Number(drafts[l.playerId] ?? floor)))}
            >
              Bid
            </Button>
          </div>
        )
      },
    },
  ]

  return (
    <div>
      <ScreenHeader
        label="MARKET"
        title="Transfers"
        actions={
          <span className="inline-flex items-baseline gap-1.5 text-xs text-ink-faint">
            Your cash <MoneyText amount={user.cash} />
          </span>
        }
      />

      <div className="flex flex-col gap-4">
        <Panel label="Offers for your players">
          {state.incomingOffers.length === 0 ? (
            <EmptyState>No offers on the table.</EmptyState>
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
                      <Badge tone="accent">Offer</Badge>
                      <span>
                        {name(o.bidderTeamId)} offer <MoneyText amount={o.amount} size="sm" /> for {p.name} (
                        {p.position} {p.level})
                      </span>
                      <span className="text-xs text-ink-faint">expires in {o.roundsLeft}w</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setState(s => acceptOffer(s, o.playerId, o.bidderTeamId))}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setState(s => counterOffer(s, o.playerId, o.bidderTeamId))}
                      >
                        Counter (list at {formatMoney(Math.round(o.amount * 1.2))})
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger!"
                        onClick={() => setState(s => rejectOffer(s, o.playerId, o.bidderTeamId))}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        <Panel label="Transfer list">
          <DataTable
            columns={columns}
            rows={state.transferList}
            rowKey={l => l.playerId}
            rowAccent={l => (l.sellerTeamId === state.userTeamId ? 'user' : null)}
            empty={<EmptyState>Nobody is for sale this week.</EmptyState>}
          />
        </Panel>
      </div>
    </div>
  )
}
