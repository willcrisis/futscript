# Direct Offers on Any Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the manager bid on any player at another club (not just transfer-listed ones), mirroring the incoming-offer flow — the selling AI club accepts or rejects on the next market tick.

**Architecture:** A new `outgoingOffers: Offer[]` on `GameState` (save version → 8) holds the user's standing bids. `makeOffer` appends one; each market tick `runTransfers` resolves them — accept (move the player to the user for the fee) when the bid clears the player's value and the club can spare him, otherwise reject — both surfaced as news/toast. ClubScreen gains a per-player "Make offer" action.

**Tech Stack:** TypeScript, React, Vitest.

## Global Constraints

- Engine stays pure; randomness threaded through `rand`. The offer resolution consumes **no** `rand`, so it never shifts the seeded stream.
- Save version bumps **7 → 8**; `migrateV7` adds `outgoingOffers: []`.
- New i18n keys → both `en.ts` and `pt.ts`. New `NewsType`s wire through `NEWS_KEYS`, `NewsRail` icons, and `toastEvents`.
- Acceptance thresholds are `ponytail:`-tagged constants.
- Typecheck `npx tsc -b --force`; tests `npm test`.

## File Structure

| File | Change |
|------|--------|
| `src/engine/types.ts` | `GameState.outgoingOffers`; `NewsType` +2; `version = 8` |
| `src/engine/save.ts` | `migrateV7`; chain to 8 |
| `src/engine/newGame.ts` | `outgoingOffers: []`, `version: 8` |
| `src/engine/transfers.ts` | `makeOffer` + resolution in `runTransfers` |
| `src/i18n/news.ts` | `NEWS_KEYS` +2 |
| `src/ui/NewsRail.tsx` | icon map +2 |
| `src/ui/toastEvents.ts` | `TOASTABLE` +2 |
| `src/i18n/en.ts`, `src/i18n/pt.ts` | `news.offerAccepted/Rejected` |
| `src/screens/ClubScreen.tsx` | Make-offer action |
| `src/App.tsx` | pass `setState` to ClubScreen |

---

### Task 1: State field + migration to version 8

**Files:**
- Modify: `src/engine/types.ts` (`GameState.outgoingOffers`, `version = 8`)
- Modify: `src/engine/save.ts` (`migrateV7`, chain)
- Modify: `src/engine/newGame.ts` (`outgoingOffers: []`, `version: 8`)
- Test: `src/engine/save.test.ts`

**Interfaces:**
- Produces: `GameState.outgoingOffers: Offer[]`; a v7 save migrates by gaining `outgoingOffers: []`.

- [ ] **Step 1: Write the failing test**

Append to `src/engine/save.test.ts` (imports `migrateToCurrent`, `newGame`):
```ts
describe('v7 → v8 migration', () => {
  it('adds outgoingOffers to a version-7 save', () => {
    const v7 = { ...newGame(1), version: 7 } as any
    delete v7.outgoingOffers
    const migrated = migrateToCurrent(v7)
    expect(migrated).not.toBeNull()
    expect(migrated!.version).toBe(8)
    expect(migrated!.outgoingOffers).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/save.test.ts`
Expected: FAIL — current version is 7; `migrateToCurrent` returns null for anything not equal to 7, and there is no `outgoingOffers`.

- [ ] **Step 3: Implement**

In `src/engine/types.ts`: add to `GameState` (after `incomingOffers: Offer[]`):
```ts
  outgoingOffers: Offer[]
```
Change `version: 7` to `version: 8` in the `GameState` literal-type/const if one exists (the field is `version: number`; the value lives in `newGame`/migrations). Extend `NewsType` (Task handled here so the union is complete for later tasks):
```ts
export type NewsType =
  | 'userSigned' | 'userSold' | 'userRenewed' | 'userOutbid' | 'offerReceived'
  | 'offerAccepted' | 'offerRejected'
  | 'starterInjured' | 'boardWarning' | 'constructionDone'
  | 'rivalTransfer' | 'heavyWin' | 'cupRun'
  | 'champions' | 'cupWinner' | 'promoted' | 'relegated'
  | 'managerSacked' | 'managerHired' | 'userSacked' | 'userHired' | 'jobOffer'
```

In `src/engine/save.ts`, add the migration and extend the chain. After the existing `migrateV6`:
```ts
function migrateV7(s: any): any {
  return { ...s, version: 8, outgoingOffers: s.outgoingOffers ?? [] }
}
```
Update `migrateToCurrent`'s chain:
```ts
    if (state?.version === 6) state = migrateV6(state)
    if (state?.version === 7) state = migrateV7(state)
    if (state?.version !== 8) return null
```

In `src/engine/newGame.ts`, add `outgoingOffers: []` to the returned state and change `version: 7` to `version: 8`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/engine/save.test.ts`
Expected: PASS. Then `npm test` — a `tsc` error would flag any code constructing a `GameState` without `outgoingOffers`; fix each (there should only be `newGame`).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc -b --force`
Expected: no errors.
```bash
git add src/engine/types.ts src/engine/save.ts src/engine/newGame.ts src/engine/save.test.ts
git commit -m "feat(engine): outgoingOffers state + v8 migration"
```

---

### Task 2: `makeOffer` + market resolution

**Files:**
- Modify: `src/engine/transfers.ts`
- Modify: `src/i18n/news.ts`, `src/ui/NewsRail.tsx`, `src/ui/toastEvents.ts`
- Modify: `src/i18n/en.ts`, `src/i18n/pt.ts`
- Test: `src/engine/transfers.test.ts`

**Interfaces:**
- Consumes: `Offer`, `OFFER_ROUNDS`, `MIN_SQUAD`, `marketValue`, `transferPlayer`, `pushNews`, `outgoingOffers` (Task 1).
- Produces:
  - `makeOffer(state, playerId, amount): GameState` — appends one outgoing offer for an AI-owned player the user can afford; rejects duplicates and own-club targets.
  - `runTransfers` resolves outgoing offers each tick: accept (transfer to the user + `offerAccepted` news) or reject (`offerRejected` news); the list is cleared each tick.

- [ ] **Step 1: Write the failing test**

Append to `src/engine/transfers.test.ts`:
```ts
describe('direct offers', () => {
  it('makeOffer records a bid on an AI player the user can afford', () => {
    const s0 = newGame(1)
    const target = s0.teams.find(t => t.id !== s0.userTeamId)!.playerIds[0]
    const s = makeOffer(s0, target, 300_000)
    expect(s.outgoingOffers).toHaveLength(1)
    expect(s.outgoingOffers[0]).toMatchObject({ playerId: target, bidderTeamId: s0.userTeamId, amount: 300_000 })
  })

  it('a generous offer is accepted next tick and the player joins the user', () => {
    let s = newGame(1)
    const seller = s.teams.find(t => t.id !== s.userTeamId && t.playerIds.length > 14)!
    const target = [...seller.playerIds].sort((a, b) => s.players[a].level - s.players[b].level)[0] // weakest, spareable
    s = makeOffer(s, target, marketValue(s.players[target]) * 3) // way over value
    s = runTransfers(s, mulberry32(4))
    const user = s.teams.find(t => t.id === s.userTeamId)!
    expect(user.playerIds).toContain(target)
    expect(s.outgoingOffers).toHaveLength(0)
    expect(s.news.some(n => n.type === 'offerAccepted')).toBe(true)
  })

  it('a lowball offer is rejected', () => {
    let s = newGame(1)
    const seller = s.teams.find(t => t.id !== s.userTeamId)!
    const target = seller.playerIds[0]
    s = makeOffer(s, target, 1) // token bid
    s = runTransfers(s, mulberry32(4))
    expect(s.teams.find(t => t.id === seller.id)!.playerIds).toContain(target)
    expect(s.news.some(n => n.type === 'offerRejected')).toBe(true)
  })
})
```
(Add `makeOffer`, `marketValue`, `mulberry32` to imports as needed.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/transfers.test.ts`
Expected: FAIL — `makeOffer` not exported.

- [ ] **Step 3: Implement `makeOffer`**

In `src/engine/transfers.ts`, add:
```ts
export function makeOffer(state: GameState, playerId: number, amount: number): GameState {
  if (!state.manager.employed) return state
  const owner = state.teams.find(t => t.playerIds.includes(playerId))
  const user = state.teams.find(t => t.id === state.userTeamId)!
  if (!owner || owner.id === state.userTeamId) return state // only AI-owned players
  if (amount <= 0 || amount > user.cash) return state
  if (state.outgoingOffers.some(o => o.playerId === playerId)) return state // one bid at a time
  return {
    ...state,
    outgoingOffers: [...state.outgoingOffers, { playerId, bidderTeamId: state.userTeamId, amount, roundsLeft: OFFER_ROUNDS }],
  }
}
```

- [ ] **Step 4: Resolve offers in `runTransfers`**

In `runTransfers`, after the "offers age out" block near the top (and before AI listing), add resolution. It consumes no `rand`:
```ts
  // the user's outgoing offers: each selling club accepts or rejects this tick
  const outgoing = s.outgoingOffers
  s = { ...s, outgoingOffers: [] }
  for (const offer of outgoing) {
    const seller = s.teams.find(t => t.playerIds.includes(offer.playerId))
    if (!seller || seller.id === s.userTeamId) continue // player already moved/gone
    const user = s.teams.find(t => t.id === s.userTeamId)!
    const player = s.players[offer.playerId]
    const value = marketValue(player)
    const keyMult = player.level >= 60 ? 1.4 : 1.1 // ponytail: key players cost a premium
    const accept =
      seller.playerIds.length > MIN_SQUAD &&
      offer.amount >= Math.round(value * keyMult) &&
      offer.amount <= user.cash
    if (accept) {
      s = transferPlayer(s, offer.playerId, s.userTeamId, offer.amount)
      s = pushNews(s, 'offerAccepted', { club: seller.name, player: player.name, amount: offer.amount })
    } else {
      s = pushNews(s, 'offerRejected', { club: seller.name, player: player.name })
    }
  }
```
(Confirm `transferPlayer(state, playerId, toTeamId, fee)` moves the player to `toTeamId` and the fee from buyer to seller — it is the same function AI sales use, symmetric in buyer/seller.)

- [ ] **Step 5: Wire the two news types**

`src/i18n/news.ts` — add to `NEWS_KEYS`:
```ts
  offerAccepted: 'news.offerAccepted',
  offerRejected: 'news.offerRejected',
```
`src/ui/NewsRail.tsx` — add to the `ICONS` map (reuse `TransfersIcon`):
```ts
  offerAccepted: TransfersIcon, offerRejected: TransfersIcon,
```
`src/ui/toastEvents.ts` — add to `TOASTABLE`:
```ts
  offerAccepted: 'accent',
  offerRejected: 'warn',
```
`src/i18n/en.ts`:
```ts
  'news.offerAccepted': '{club} accepts your offer for {player} ({amount})',
  'news.offerRejected': '{club} rejects your offer for {player}',
```
`src/i18n/pt.ts`:
```ts
  'news.offerAccepted': '{club} aceita sua proposta por {player} ({amount})',
  'news.offerRejected': '{club} recusa sua proposta por {player}',
```
(`newsText` already money-formats the `amount` param, so `offerAccepted` renders `$…` automatically.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/engine/transfers.test.ts`
Expected: PASS. Then `npm test`; `npx tsc -b --force` (the `NEWS_KEYS`/`ICONS` maps are `Record<NewsType, …>` — a missing entry is a compile error, so this proves both new types are wired).

- [ ] **Step 7: Commit**
```bash
git add src/engine/transfers.ts src/i18n/news.ts src/ui/NewsRail.tsx src/ui/toastEvents.ts src/i18n/en.ts src/i18n/pt.ts src/engine/transfers.test.ts
git commit -m "feat(engine): direct offers on any player, resolved by the selling club"
```

---

### Task 3: ClubScreen "Make offer" action

**Files:**
- Modify: `src/screens/ClubScreen.tsx`
- Modify: `src/App.tsx` (pass `setState`)
- Modify: `src/i18n/en.ts`, `src/i18n/pt.ts`

**Interfaces:**
- Consumes: `makeOffer` (Task 2).

- [ ] **Step 1: Pass `setState` to ClubScreen**

In `src/App.tsx`, the ClubScreen render (currently `<ClubScreen state={state} teamId={clubView.teamId} onBack={...} />`) gains `setState`:
```tsx
      {screen === 'club' && clubView && (
        <ClubScreen state={state} setState={setState} teamId={clubView.teamId} onBack={() => setScreen(clubView.from)} />
      )}
```

- [ ] **Step 2: Add the offer action**

In `src/screens/ClubScreen.tsx`:

Extend `Props` and imports:
```ts
import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { makeOffer } from '../engine/transfers'
import { marketValue } from '../engine/finance'
// …existing imports…

interface Props {
  state: GameState
  setState: Dispatch<SetStateAction<GameState>>
  teamId: number
  onBack: () => void
}
```
Inside the component, guard the action to other clubs while employed, and add an inline offer flow like SquadScreen's sell input:
```tsx
  const canOffer = state.manager.employed && teamId !== state.userTeamId
  const [offering, setOffering] = useState<number | null>(null)
  const [bid, setBid] = useState(0)
  const pending = (id: number) => state.outgoingOffers.some(o => o.playerId === id)
```
Add an actions column to the squad table when `canOffer`:
```tsx
  const offerColumn: Column<Player> = {
    key: 'offer', label: '', render: p => {
      if (pending(p.id)) return <span className="text-xs text-ink-faint">{t('club.offerPending')}</span>
      if (offering === p.id) return (
        <div className="flex items-center gap-1.5">
          <input
            type="number" value={bid} onChange={e => setBid(Number(e.target.value))}
            className="w-24 rounded-md border border-rule bg-surface px-2 py-1 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          />
          <Button variant="primary" size="sm" onClick={() => { setState(s => makeOffer(s, p.id, bid)); setOffering(null) }}>
            {t('club.sendOffer')}
          </Button>
          <Button variant="ghost" size="sm" aria-label={t('common.cancel')} onClick={() => setOffering(null)}>✕</Button>
        </div>
      )
      return (
        <Button variant="ghost" size="sm" onClick={() => { setOffering(p.id); setBid(marketValue(p)) }}>
          {t('club.makeOffer')}
        </Button>
      )
    },
  }
  const squadColumns = canOffer ? [...columns, offerColumn] : columns
```
Use `squadColumns` in the squad `DataTable`. (`Column`, `Button` are already imported.)

- [ ] **Step 3: i18n keys**

`src/i18n/en.ts`:
```ts
  'club.makeOffer': 'Make offer',
  'club.sendOffer': 'Send',
  'club.offerPending': 'Offer pending',
```
`src/i18n/pt.ts`:
```ts
  'club.makeOffer': 'Fazer proposta',
  'club.sendOffer': 'Enviar',
  'club.offerPending': 'Proposta enviada',
```
(Reuse `common.cancel` if it exists; add it to both dictionaries if not.)

- [ ] **Step 4: Typecheck + manual check**

Run: `npx tsc -b --force`
Expected: no errors.
Manual (`npm run dev`): open another club (from the table/news), each player shows **Make offer**; sending a strong bid gets an accept next week with the player joining you; a weak bid gets a rejection — both appear in the news rail/toasts.

- [ ] **Step 5: Commit**
```bash
git add src/screens/ClubScreen.tsx src/App.tsx src/i18n/en.ts src/i18n/pt.ts
git commit -m "feat(ui): make offers on any club's players from ClubScreen"
```

---

## Final verification

- [ ] `npm test` — all green.
- [ ] `npx tsc -b --force` — no errors.
- [ ] Manual: make a generous and a lowball offer; confirm accept-with-transfer and reject, each surfaced as news + toast, and that a loaded v7 save migrates cleanly (gains `outgoingOffers`).
