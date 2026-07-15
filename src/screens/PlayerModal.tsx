import { useEffect, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { formatMoney, marketValue, severanceFor } from '../engine/finance'
import { delistPlayer, listPlayer, makeOffer, releasePlayer, renewalSalary, renewContract } from '../engine/transfers'
import type { GameState } from '../engine/types'
import { t, useLang } from '../i18n'
import Button from '../ui/Button'
import ConfirmButton from '../ui/ConfirmButton'
import MoneyText from '../ui/MoneyText'
import { playerActions } from './playerActions'

const INPUT =
  'w-24 rounded-md border border-rule bg-surface px-2 py-1 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  )
}

interface Props {
  state: GameState
  setState: Dispatch<SetStateAction<GameState>>
  playerId: number
  onClose: () => void
}

export default function PlayerModal({ state, setState, playerId, onClose }: Props) {
  useLang()
  const p = state.players[playerId]
  const [askingPrice, setAskingPrice] = useState(() => (p ? marketValue(p) : 0))
  const [bid, setBid] = useState(() => (p ? marketValue(p) : 0))
  const [listing, setListing] = useState(false)
  const [offering, setOffering] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!p) return null // player left the world (sold/released) — nothing to show

  const { owner, isOwn, canOffer, offerPending, listed } = playerActions(state, playerId)
  const userCash = state.teams.find(tm => tm.id === state.userTeamId)?.cash ?? 0
  const statusText =
    p.injuredForRounds > 0 ? t('player.statusInjured', { n: p.injuredForRounds })
    : p.suspendedForRounds > 0 ? t('player.statusSuspended', { n: p.suspendedForRounds })
    : t('player.statusFit')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-rule bg-surface p-5 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{p.name}</h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              {p.position} · {p.age}
              {owner && <> · {owner.name} · D{owner.division}</>}
            </p>
          </div>
          <Button variant="ghost" size="sm" aria-label={t('player.close')} onClick={onClose}>✕</Button>
        </div>

        <div className="flex flex-col gap-2 border-t border-rule pt-3">
          <Row label={t('common.level')}>
            <span className="inline-flex items-baseline gap-1">
              <strong>{p.level}</strong>
              {p.level < p.peakLevel && (
                <span className="text-[10px] text-ink-faint" title={t('squad.recoveringTo', { n: p.peakLevel })}>↑{p.peakLevel}</span>
              )}
            </span>
          </Row>
          <Row label={t('player.form')}>{p.form > 0 ? `+${p.form}` : p.form}</Row>
          <Row label={t('player.fitness')}>{p.fitness}%</Row>
        </div>

        <div className="mt-3 flex flex-col gap-2 border-t border-rule pt-3">
          <Row label={t('player.value')}><MoneyText amount={marketValue(p)} size="sm" /></Row>
          <Row label={t('player.salary')}>{t('player.perWeek', { money: formatMoney(p.salary) })}</Row>
          <Row label={t('player.contract')}>{t('player.contractSeasons', { n: p.contractSeasons })}</Row>
        </div>

        <div className="mt-3 flex flex-col gap-2 border-t border-rule pt-3">
          <Row label={t('player.seasonGoals')}>{p.seasonGoals}</Row>
          <Row label={t('player.injuries')}>{p.injuryCount}</Row>
          <Row label={t('player.yellows')}>{p.yellowCards}</Row>
          <Row label={t('player.status')}>{statusText}</Row>
        </div>

        {(isOwn || canOffer) && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-rule pt-4">
            {isOwn && (
              <>
                {listed ? (
                  <Button variant="ghost" size="sm" onClick={() => setState(s => delistPlayer(s, p.id))}>
                    {t('squad.delist')}
                  </Button>
                ) : listing ? (
                  <div className="flex items-center gap-1.5">
                    <input type="number" value={askingPrice} onChange={e => setAskingPrice(Number(e.target.value))} className={INPUT} />
                    <Button variant="primary" size="sm" disabled={askingPrice <= 0}
                      onClick={() => { setState(s => listPlayer(s, p.id, Math.round(askingPrice))); setListing(false) }}>
                      {t('squad.listButton')}
                    </Button>
                    <Button variant="ghost" size="sm" aria-label={t('common.cancel')} onClick={() => setListing(false)}>✕</Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => { setListing(true); setAskingPrice(marketValue(p)) }}>
                    {t('squad.sell')}
                  </Button>
                )}
                {p.contractSeasons <= 1 && (
                  <Button variant="ghost" size="sm" title={t('squad.renewFor', { salary: formatMoney(renewalSalary(p)) })}
                    onClick={() => setState(s => renewContract(s, p.id))}>
                    {t('squad.renew')}
                  </Button>
                )}
                <ConfirmButton
                  label={t('squad.release')}
                  confirmLabel={t('squad.confirmRelease', { amount: formatMoney(-severanceFor(p)) })}
                  onConfirm={() => { setState(s => releasePlayer(s, p.id)); onClose() }}
                  size="sm"
                />
              </>
            )}
            {canOffer && (
              offerPending ? (
                <span className="text-xs text-ink-faint">{t('club.offerPending')}</span>
              ) : offering ? (
                <div className="flex items-center gap-1.5">
                  <input type="number" value={bid} onChange={e => setBid(Number(e.target.value))} className={INPUT} />
                  <Button variant="primary" size="sm" disabled={bid <= 0 || bid > userCash}
                    onClick={() => { setState(s => makeOffer(s, p.id, Math.round(bid))); setOffering(false) }}>
                    {t('club.sendOffer')}
                  </Button>
                  <Button variant="ghost" size="sm" aria-label={t('common.cancel')} onClick={() => setOffering(false)}>✕</Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => { setOffering(true); setBid(marketValue(p)) }}>
                  {t('club.makeOffer')}
                </Button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}
