# Player Info Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a player's name anywhere it appears as a discrete cell opens a popup with that player's info, stats (including career injury count), and context-appropriate actions.

**Architecture:** Mirror the shipped club-links mechanism. A `PlayerNavContext` provides `openPlayer(id)`; a `PlayerLink` primitive wraps each name cell (off-context → plain text); a single `PlayerModal` overlay renders at the App level. Action eligibility is a pure, unit-tested helper. No engine change, no save-version bump.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind v4. Reuse the `src/ui/` kit and existing `transfers.ts` transforms.

## Global Constraints

- Engine (`src/engine/**`) stays pure: no React/DOM/i18n imports. This feature touches **no** engine file — it only *calls* existing transforms (`listPlayer`, `delistPlayer`, `renewContract`, `renewalSalary`, `releasePlayer`, `makeOffer`, `marketValue`, `severanceFor`).
- Semantic design tokens only (`text-ink`, `bg-surface`, `border-rule`, `text-accent`, `text-danger`, `text-ink-muted`, `text-ink-faint`, …). No raw color scales. Light + dark + mobile-equal.
- i18n: every new `en.ts` key **must** be added to `pt.ts` (missing key = compile error). Reuse existing keys where the label already exists.
- No `GameState.version` bump.
- Money is integer dollars: `Math.round` at input boundaries (offer amount, asking price).
- Real typecheck is `npx tsc -b --force` (plain `tsc --noEmit` is a no-op here). Tests: `npm test`.

## File Structure

- `src/screens/playerActions.ts` (new) — pure helper deriving action eligibility from state. Testable without React.
- `src/screens/playerActions.test.ts` (new) — its unit tests.
- `src/ui/PlayerLink.tsx` (new) — `PlayerNavContext`, `PlayerNavProvider`, `usePlayerNav`, default `PlayerLink`. Twin of `src/ui/ClubLink.tsx`.
- `src/screens/PlayerModal.tsx` (new) — the popup overlay.
- `src/App.tsx` (modify) — `playerView` state, provider wrap, render `PlayerModal`.
- `src/i18n/en.ts`, `src/i18n/pt.ts` (modify) — new `player.*` keys.
- `src/screens/{SquadScreen,ScoutScreen,ClubScreen,StatsScreen,TransfersScreen}.tsx` (modify) — wrap name cells in `PlayerLink`.

---

### Task 1: `playerActions` pure helper

**Files:**
- Create: `src/screens/playerActions.ts`
- Test: `src/screens/playerActions.test.ts`

**Interfaces:**
- Produces: `playerActions(state: GameState, playerId: number): PlayerActionInfo` where
  `PlayerActionInfo = { owner: Team | undefined; isOwn: boolean; canOffer: boolean; offerPending: boolean; listed: boolean }`.
  - `owner` — team whose `playerIds` include `playerId` (or `undefined`).
  - `isOwn` — employed **and** owner is the user's team.
  - `canOffer` — employed **and** owner exists **and** is *not* the user's team.
  - `offerPending` — an outgoing offer already exists for this player.
  - `listed` — the player is on the user's transfer list.

- [ ] **Step 1: Write the failing test**

Create `src/screens/playerActions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { newGame } from '../engine/newGame'
import { playerActions } from './playerActions'

describe('playerActions', () => {
  it('flags the user’s own player, not offerable', () => {
    const s = newGame(1)
    const ownId = s.teams.find(t => t.id === s.userTeamId)!.playerIds[0]
    expect(playerActions(s, ownId)).toMatchObject({ isOwn: true, canOffer: false })
  })

  it('flags an AI-owned player as offerable', () => {
    const s = newGame(1)
    const aiId = s.teams.find(t => t.id !== s.userTeamId)!.playerIds[0]
    expect(playerActions(s, aiId)).toMatchObject({ isOwn: false, canOffer: true, offerPending: false })
  })

  it('reflects a pending outgoing offer', () => {
    const s = newGame(1)
    const aiId = s.teams.find(t => t.id !== s.userTeamId)!.playerIds[0]
    const s2 = { ...s, outgoingOffers: [{ playerId: aiId, bidderTeamId: s.userTeamId, amount: 1, roundsLeft: 3 }] }
    expect(playerActions(s2, aiId).offerPending).toBe(true)
  })

  it('reflects a listed own player', () => {
    const s = newGame(1)
    const ownId = s.teams.find(t => t.id === s.userTeamId)!.playerIds[0]
    const s2 = { ...s, transferList: [{ playerId: ownId, sellerTeamId: s.userTeamId, minPrice: 1, currentBid: null, currentBidderId: null, roundsLeft: 3 }] }
    expect(playerActions(s2, ownId).listed).toBe(true)
  })

  it('offers nothing when unemployed', () => {
    const s = newGame(1)
    const aiId = s.teams.find(t => t.id !== s.userTeamId)!.playerIds[0]
    const s2 = { ...s, manager: { ...s.manager, employed: false } }
    expect(playerActions(s2, aiId)).toMatchObject({ isOwn: false, canOffer: false })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- playerActions`
Expected: FAIL — `Cannot find module './playerActions'`.

- [ ] **Step 3: Write the implementation**

Create `src/screens/playerActions.ts`:

```ts
import type { GameState, Team } from '../engine/types'

export interface PlayerActionInfo {
  owner: Team | undefined
  isOwn: boolean
  canOffer: boolean
  offerPending: boolean
  listed: boolean
}

// Which actions the popup may offer for a player, from the user's vantage point.
export function playerActions(state: GameState, playerId: number): PlayerActionInfo {
  const owner = state.teams.find(t => t.playerIds.includes(playerId))
  const employed = state.manager.employed
  const isOwn = employed && owner != null && owner.id === state.userTeamId
  const canOffer = employed && owner != null && owner.id !== state.userTeamId
  const offerPending = state.outgoingOffers.some(o => o.playerId === playerId)
  const listed = state.transferList.some(l => l.playerId === playerId)
  return { owner, isOwn, canOffer, offerPending, listed }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- playerActions`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b --force`
Expected: `TypeScript compilation completed`, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/screens/playerActions.ts src/screens/playerActions.test.ts
git commit -m "feat: playerActions helper — derive popup action eligibility"
```

---

### Task 2: `PlayerLink`, `PlayerModal`, App wiring, i18n — end-to-end from the Squad screen

**Files:**
- Create: `src/ui/PlayerLink.tsx`, `src/screens/PlayerModal.tsx`
- Modify: `src/App.tsx`, `src/i18n/en.ts`, `src/i18n/pt.ts`, `src/screens/SquadScreen.tsx`

**Interfaces:**
- Consumes: `playerActions` (Task 1); `marketValue`, `severanceFor`, `formatMoney` from `../engine/finance`; `listPlayer`, `delistPlayer`, `renewContract`, `renewalSalary`, `releasePlayer`, `makeOffer` from `../engine/transfers`.
- Produces: `PlayerNavProvider`, `usePlayerNav`, default `PlayerLink({ playerId, children, className? })` from `../ui/PlayerLink`; default `PlayerModal({ state, setState, playerId, onClose })` from `../screens/PlayerModal`.

- [ ] **Step 1: Create `PlayerLink.tsx`**

Create `src/ui/PlayerLink.tsx` (structurally identical to `ClubLink.tsx`):

```tsx
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

// Opening a player's popup is an App-level concern; screens reach it through context
// instead of prop-drilling. Off-context (e.g. the match replay, rendered before the
// provider) PlayerLink degrades to plain text.
const PlayerNavContext = createContext<((playerId: number) => void) | undefined>(undefined)

export const PlayerNavProvider = PlayerNavContext.Provider
export const usePlayerNav = () => useContext(PlayerNavContext)

const LINK =
  'rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

export default function PlayerLink({ playerId, children, className = '' }: { playerId: number; children: ReactNode; className?: string }) {
  const open = usePlayerNav()
  if (!open) return <>{children}</>
  return (
    <button type="button" onClick={() => open(playerId)} className={`${LINK} ${className}`.trim()}>
      {children}
    </button>
  )
}
```

- [ ] **Step 2: Add i18n keys — `en.ts`**

In `src/i18n/en.ts`, add these keys (place them together in a `player.*` block; the exact location is not load-bearing since `en` is an object literal):

```ts
  'player.form': 'Form',
  'player.fitness': 'Fitness',
  'player.value': 'Value',
  'player.salary': 'Salary',
  'player.perWeek': '{money}/wk',
  'player.contract': 'Contract',
  'player.contractSeasons': '{n} seasons',
  'player.seasonGoals': 'Season goals',
  'player.injuries': 'Injuries',
  'player.yellows': 'Yellow cards',
  'player.status': 'Status',
  'player.statusFit': 'Fit',
  'player.statusInjured': 'Injured — {n}w',
  'player.statusSuspended': 'Suspended — {n}w',
  'player.close': 'Close',
```

- [ ] **Step 3: Add the matching keys — `pt.ts`**

In `src/i18n/pt.ts`, add the same keys (Portuguese). Missing any of these is a **compile error**:

```ts
  'player.form': 'Forma',
  'player.fitness': 'Preparo',
  'player.value': 'Valor',
  'player.salary': 'Salário',
  'player.perWeek': '{money}/sem',
  'player.contract': 'Contrato',
  'player.contractSeasons': '{n} temporadas',
  'player.seasonGoals': 'Gols na temporada',
  'player.injuries': 'Lesões',
  'player.yellows': 'Cartões amarelos',
  'player.status': 'Situação',
  'player.statusFit': 'Apto',
  'player.statusInjured': 'Lesionado — {n}sem',
  'player.statusSuspended': 'Suspenso — {n}sem',
  'player.close': 'Fechar',
```

- [ ] **Step 4: Create `PlayerModal.tsx`**

Create `src/screens/PlayerModal.tsx`:

```tsx
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
```

- [ ] **Step 5: Wire the provider + modal into `App.tsx`**

In `src/App.tsx`:

Add imports (next to the existing `import { ClubNavProvider } from './ui/ClubLink'`):

```ts
import { PlayerNavProvider } from './ui/PlayerLink'
import PlayerModal from './screens/PlayerModal'
```

Add state next to `clubView` (after line `const [clubView, setClubView] = useState<{ teamId: number; from: ScreenId } | null>(null)`):

```ts
  const [playerView, setPlayerView] = useState<number | null>(null)
```

Wrap the render. The current return opens with:

```tsx
  return (
    <ClubNavProvider value={openClub}>
    <Shell
```

Change it to nest the player provider:

```tsx
  return (
    <ClubNavProvider value={openClub}>
    <PlayerNavProvider value={setPlayerView}>
    <Shell
```

The current return closes with:

```tsx
    </Shell>
    </ClubNavProvider>
  )
}
```

Change it to render the modal and close the new provider:

```tsx
    </Shell>
    {playerView != null && (
      <PlayerModal state={state} setState={setState} playerId={playerView} onClose={() => setPlayerView(null)} />
    )}
    </PlayerNavProvider>
    </ClubNavProvider>
  )
}
```

- [ ] **Step 6: Wire the Squad name cell to `PlayerLink`**

In `src/screens/SquadScreen.tsx`, add the import (with the other `../ui/` imports):

```ts
import PlayerLink from '../ui/PlayerLink'
```

In the `name` column render (currently `{p.name}` inside the inline-flex span), wrap just the name — leave the green starting-XI dot and the ⚠ marker as plain siblings:

```tsx
      render: p => (
        <span className="inline-flex items-center gap-2">
          <PlayerLink playerId={p.id}>{p.name}</PlayerLink>
          {team.lineup.includes(p.id) && (
            <span className="size-2 shrink-0 rounded-full bg-accent" aria-label={t('squad.startingXi')} title={t('squad.startingXi')} />
          )}
          {p.injuryCount >= PRONE_THRESHOLD && (
            <span className="text-danger" title={t('squad.injuryProne')} aria-label={t('squad.injuryProne')}>⚠</span>
          )}
        </span>
      ),
```

- [ ] **Step 7: Typecheck and test**

Run: `npx tsc -b --force`
Expected: `TypeScript compilation completed`, no errors (proves all new i18n keys exist in both dictionaries and the modal/props typecheck).

Run: `npm test`
Expected: all tests pass (no behavior change to existing suites; Task 1 tests still green).

- [ ] **Step 8: Manual smoke check (dev server)**

Run: `npm run dev`, open the Squad screen, click a player name. Expect the popup: header (name · pos · age · club·D), the three stat blocks including **Injuries**, and own-player actions (Sell/List, Renew when contract ≤ 1 season, Release-with-confirm). Esc, the ✕, and a backdrop click all close it. Then stop the dev server.

- [ ] **Step 9: Commit**

```bash
git add src/ui/PlayerLink.tsx src/screens/PlayerModal.tsx src/App.tsx src/i18n/en.ts src/i18n/pt.ts src/screens/SquadScreen.tsx
git commit -m "feat(ui): player info popup + PlayerNav context, wired from Squad"
```

---

### Task 3: Wire the remaining name cells

**Files:**
- Modify: `src/screens/ScoutScreen.tsx`, `src/screens/ClubScreen.tsx`, `src/screens/StatsScreen.tsx`, `src/screens/TransfersScreen.tsx`

**Interfaces:**
- Consumes: default `PlayerLink` from `../ui/PlayerLink` (Task 2).

- [ ] **Step 1: Scout screen**

In `src/screens/ScoutScreen.tsx`, add `import PlayerLink from '../ui/PlayerLink'` (with the other `../ui/` imports). In the `name` column render, wrap the player name:

```tsx
      render: r => (
        <span className="inline-flex items-center gap-2">
          <PlayerLink playerId={r.player.id}>{r.player.name}</PlayerLink>
          {r.player.injuryCount >= PRONE_THRESHOLD && (
            <span className="text-danger" title={t('squad.injuryProne')} aria-label={t('squad.injuryProne')}>⚠</span>
          )}
        </span>
      ),
```

- [ ] **Step 2: Club screen**

In `src/screens/ClubScreen.tsx`, add `import PlayerLink from '../ui/PlayerLink'` (with the other `../ui/` imports). In the `name` column render, wrap the name:

```tsx
      render: p => (
        <span className="inline-flex items-center gap-2">
          <PlayerLink playerId={p.id}>{p.name}</PlayerLink>
          {p.injuryCount >= PRONE_THRESHOLD && (
            <span className="text-danger" title={t('squad.injuryProne')} aria-label={t('squad.injuryProne')}>⚠</span>
          )}
        </span>
      ),
```

- [ ] **Step 3: Stats screen**

In `src/screens/StatsScreen.tsx`:

Add `import PlayerLink from '../ui/PlayerLink'` (with the other `../ui/` imports).

Add a `playerId` field to `ScorerRow`:

```ts
interface ScorerRow {
  key: number
  rank: number
  player: string
  playerId: number
  club: string
  teamId?: number // present for live players (this-season); all-time rows carry only a name string
  goals: number
}
```

`columnsFor` needs the players map so it can link only players that still exist (an all-time scorer may have retired). Change its signature and the `player` column render:

```ts
function columnsFor(lastClub: boolean, players: GameState['players']): Column<ScorerRow>[] {
  return [
    { key: 'rank', label: t('common.pos'), mono: true, render: r => r.rank },
    { key: 'player', label: t('common.player'), render: r => players[r.playerId] ? <PlayerLink playerId={r.playerId}>{r.player}</PlayerLink> : r.player },
    { key: 'club', label: lastClub ? t('stats.lastClub') : t('common.club'), render: r => r.teamId != null ? <ClubLink teamId={r.teamId}>{r.club}</ClubLink> : r.club },
    { key: 'goals', label: t('stats.goals'), align: 'right', mono: true, render: r => <strong>{r.goals}</strong> },
  ]
}
```

Update the two call sites and the two row builders. The `columns`/`allTimeColumns` lines become:

```ts
  const columns = columnsFor(false, state.players)
  const allTimeColumns = columnsFor(true, state.players)
```

In the `thisSeason` builder, add `playerId: p.id`:

```ts
    .map((p, i) => {
      const team = teamOf(p.id)
      return { key: p.id, rank: i + 1, player: p.name, playerId: p.id, club: team?.name ?? '—', teamId: team?.id, goals: p.seasonGoals }
    })
```

In the `allTime` builder, add `playerId: e.playerId`:

```ts
  const allTime: ScorerRow[] = state.allTimeScorers.slice(0, 20).map((e, i) => ({
    key: e.playerId, rank: i + 1, player: e.player, playerId: e.playerId, club: e.team, goals: e.goals,
  }))
```

- [ ] **Step 4: Transfers listings**

In `src/screens/TransfersScreen.tsx`, add `import PlayerLink from '../ui/PlayerLink'` (with the other `../ui/` imports). In the listings `player` column, wrap the name:

```tsx
    { key: 'player', label: t('common.player'), render: l => <PlayerLink playerId={l.playerId}>{state.players[l.playerId].name}</PlayerLink> },
```

- [ ] **Step 5: Typecheck and test**

Run: `npx tsc -b --force`
Expected: `TypeScript compilation completed`, no errors.

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Manual smoke check**

Run: `npm run dev`. From **Scout** click a name → popup shows **Make Offer** (or "Offer pending"). From **Stats** (this-season) and **Transfers** listings, names open the popup. Confirm an all-time scorer whose player has retired renders as plain text (no dead link). Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/screens/ScoutScreen.tsx src/screens/ClubScreen.tsx src/screens/StatsScreen.tsx src/screens/TransfersScreen.tsx
git commit -m "feat(ui): make player names clickable on Scout, Club, Stats, Transfers"
```

---

## Self-Review Notes (for the implementer)

- **Hooks-before-return:** in `PlayerModal`, all `useState`/`useEffect` calls precede the `if (!p) return null` guard — do not reorder.
- **Money boundaries:** `Math.round` is applied at the `listPlayer`/`makeOffer` call sites in the modal; the engine also rounds, so this is belt-and-suspenders and intended.
- **All-time scorers:** the `players[r.playerId] ? … : plain` guard in Stats is deliberate — retired players have no `state.players` entry and must not become dead links.
- **No engine edits:** if any task tempts you to modify `src/engine/**`, stop — the design forbids it. Everything is reads plus existing transforms.
- **i18n parity:** after editing `en.ts`, the build fails until `pt.ts` has every new key. `npx tsc -b --force` is the gate.
