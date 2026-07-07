# Futscript Phase 6 — Quality of Life Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** English/Portuguese translations, five persisted match speeds, icon actions on the Squad screen, a finance screen that leads with a plain weekly summary, a New-career reset, and a random Division 3 starting club.

**Architecture:** A hand-rolled typed i18n module (`src/i18n/`) with a module-level language store (`useLang` via `useSyncExternalStore`, persisted at `futscript-lang`); UI strings move to `t('key')` screen by screen with `en` as the type-source dictionary and `pt` compile-checked against it. Engine-written ledger labels stay canonical English **in the data** and are translated at display time by a pattern table (`src/i18n/ledger.ts`) — zero engine changes, zero save migration, and the same table doubles as the category map for the simplified finance summary. The only engine touch in the whole phase is one line in `newGame` (random Division 3 club) plus its test fallout, enumerated below.

**Tech Stack:** Existing React 19 + TS strict + Vite + Vitest + Tailwind v4 kit. No new dependencies.

## Prerequisite

The `ui-redesign` branch merged (all screens on the Quiet Heritage kit). This plan edits kit-based screens; do not start it on a pre-redesign tree.

## Global Constraints

- `src/engine/` untouched EXCEPT Task 7's `newGame` user-club selection (one line + comment). No save-schema change (`futscript-lang` and `futscript-speed` are separate localStorage keys, like `futscript-theme`).
- Suite must stay green after every task (`npm test`; count grows with the new i18n tests). Typecheck `npx tsc -b --force`; `npm run build` clean.
- Player names, club names, and competition data are NEVER translated — they are data. Only UI chrome translates.
- Every user-visible UI string goes through `t()` by the end of Task 3 — grep-verifiable: screens/`src/ui` contain no hardcoded English sentence literals (single words used as data, class names, and aria patterns built from keys are fine).
- `pt` must satisfy `Record<TranslationKey, string>` — a missing key is a compile error, not a runtime fallback.
- Match speed presets: exactly `500 / 400 / 300 / 150 / 50` ms per match minute, labeled Slow / Medium / Fast / Super fast / Ultra fast (translated), default **Fast (300)**, persisted at `futscript-speed`.
- Semantic tokens only; kit components for all new UI; focus-visible + aria-label rules from the redesign hold.
- Icons: inline stroke SVGs in `src/ui/icons.tsx` following the existing 16×16/1.8-stroke style.

## File Structure

- `src/i18n/index.ts` — store (`getLang`, `setLang`, `useLang`), `t(key, params?)`, browser-default resolution
- `src/i18n/en.ts` — source dictionary (`as const`; exports `TranslationKey`)
- `src/i18n/pt.ts` — `Record<TranslationKey, string>`
- `src/i18n/ledger.ts` — ledger-label pattern table: translate + categorize engine labels
- `src/i18n/i18n.test.ts`, `src/i18n/ledger.test.ts` — pure-function tests (fit the `src/**/*.test.ts` vitest include)
- `src/ui/icons.tsx` — + `PlayIcon`, `TagIcon`, `ExitIcon`, `RenewIcon`
- `src/screens/*`, `src/ui/*` — string extraction; Squad actions; Finance summary; Saves settings panel + New career
- `src/engine/newGame.ts` — random Division 3 club (Task 7 only)

---

### Task 1: i18n core — store, dictionaries, language setting

**Files:**
- Create: `src/i18n/index.ts`, `src/i18n/en.ts`, `src/i18n/pt.ts`, `src/i18n/i18n.test.ts`
- Modify: `src/screens/SavesScreen.tsx` (Settings panel with the language select), `src/ui/Shell.tsx` (nav labels via `t`)

**Interfaces:**
- Produces:
  - `en.ts`: `export const en = { ... } as const` and `export type TranslationKey = keyof typeof en`
  - `pt.ts`: `export const pt: Record<TranslationKey, string>`
  - `index.ts`: `export type Lang = 'en' | 'pt'`; `getLang(): Lang`; `setLang(l: Lang): void` (persists + notifies); `useLang(): Lang` (React hook, `useSyncExternalStore`); `t(key: TranslationKey, params?: Record<string, string | number>): string` with `{name}`-style interpolation
  - Components that render translated text call `useLang()` once (subscribes them to changes) and then `t(...)` freely

- [ ] **Step 1: Write the failing tests**

`src/i18n/i18n.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { en } from './en'
import { pt } from './pt'
import { t, setLang, getLang } from './index'

describe('dictionaries', () => {
  it('pt covers every en key with a non-empty string', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(pt[key], `pt missing ${key}`).toBeTruthy()
    }
  })
})

describe('t', () => {
  it('resolves keys in the active language and interpolates params', () => {
    setLang('en')
    expect(t('nav.home')).toBe('Home')
    setLang('pt')
    expect(t('nav.home')).toBe('Início')
    expect(getLang()).toBe('pt')
    setLang('en')
  })

  it('interpolates {param} placeholders', () => {
    setLang('en')
    expect(t('common.weeksShort', { n: 3 })).toBe('3w')
  })
})
```

(Storage note: the store must default safely when `localStorage` is unavailable — guard with `typeof localStorage === 'undefined'` so vitest's node environment works without a stub.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/i18n/i18n.test.ts`
Expected: FAIL — modules don't exist

- [ ] **Step 3: Implement the module**

`src/i18n/en.ts` starts with the keys this task itself consumes (grow it in Tasks 2–3; keep keys grouped by screen with `screen.` prefixes):

```ts
export const en = {
  'nav.home': 'Home',
  'nav.squad': 'Squad',
  'nav.table': 'Table',
  'nav.fixtures': 'Fixtures',
  'nav.cup': 'Cup',
  'nav.stats': 'Stats',
  'nav.transfers': 'Transfers',
  'nav.finance': 'Finance',
  'nav.history': 'History',
  'nav.saves': 'Saves',
  'nav.more': 'More',
  'nav.moreSections': 'More sections',
  'nav.needsAttention': 'needs attention',
  'shell.advanceWeek': 'Advance Week',
  'shell.newSeason': 'New Season',
  'shell.theme': 'Theme',
  'shell.seasonWeek': 'S{season} W{week}',
  'common.weeksShort': '{n}w',
  'saves.settings': 'Settings',
  'saves.language': 'Language',
  'saves.languageEnglish': 'English',
  'saves.languagePortuguese': 'Português',
} as const

export type TranslationKey = keyof typeof en
```

`src/i18n/pt.ts`:

```ts
import type { TranslationKey } from './en'

export const pt: Record<TranslationKey, string> = {
  'nav.home': 'Início',
  'nav.squad': 'Elenco',
  'nav.table': 'Tabela',
  'nav.fixtures': 'Jogos',
  'nav.cup': 'Copa',
  'nav.stats': 'Estatísticas',
  'nav.transfers': 'Transferências',
  'nav.finance': 'Finanças',
  'nav.history': 'História',
  'nav.saves': 'Jogos salvos',
  'nav.more': 'Mais',
  'nav.moreSections': 'Mais seções',
  'nav.needsAttention': 'requer atenção',
  'shell.advanceWeek': 'Avançar semana',
  'shell.newSeason': 'Nova temporada',
  'shell.theme': 'Tema',
  'shell.seasonWeek': 'T{season} S{week}',
  'common.weeksShort': '{n}sem',
  'saves.settings': 'Configurações',
  'saves.language': 'Idioma',
  'saves.languageEnglish': 'English',
  'saves.languagePortuguese': 'Português',
}
```

`src/i18n/index.ts`:

```ts
import { useSyncExternalStore } from 'react'
import { en } from './en'
import type { TranslationKey } from './en'
import { pt } from './pt'

export type Lang = 'en' | 'pt'
export type { TranslationKey }

const KEY = 'futscript-lang'
const DICTS: Record<Lang, Record<TranslationKey, string>> = { en, pt }

function storedLang(): Lang | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(KEY)
  return raw === 'en' || raw === 'pt' ? raw : null
}

function browserLang(): Lang {
  if (typeof navigator === 'undefined') return 'en'
  return navigator.language?.toLowerCase().startsWith('pt') ? 'pt' : 'en'
}

let current: Lang = storedLang() ?? browserLang()
const listeners = new Set<() => void>()

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang): void {
  current = lang
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, lang)
  for (const fn of listeners) fn()
}

export function useLang(): Lang {
  return useSyncExternalStore(
    fn => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    getLang,
    getLang,
  )
}

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  let out: string = DICTS[current][key]
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      out = out.replaceAll(`{${name}}`, String(value))
    }
  }
  return out
}
```

- [ ] **Step 4: Wire the first consumers**

`src/ui/Shell.tsx`: the `NAV` array's `label` values become key lookups — change `NAV` entries to carry `labelKey: TranslationKey` (`'nav.home'` …) and render `t(item.labelKey)`; the component calls `useLang()` once at the top. Advance button label: `Shell` already receives `advanceLabel` from App — App passes `t('shell.advanceWeek')` / `t('shell.newSeason')` and the `Game` component calls `useLang()` (so the whole tree re-renders on language change — acceptable at this app's size; note it in a comment). "More", the sheet's aria-label, the attention-dot aria-label, and the vitals `S{n} W{n}` line move to keys (`shell.seasonWeek` with params).

`src/screens/SavesScreen.tsx`: add a `Panel label={t('saves.settings')}` at the bottom with a labeled language `<select>` (recipe styling + `aria-label={t('saves.language')}`) whose value is `useLang()` and `onChange` calls `setLang(...)`; options use the two language keys (each language named in itself, so the select is readable whatever is active).

- [ ] **Step 5: Verify**

`npm test` (149 + 3 new), `npx tsc -b --force`, `npm run build`; dev check: switching language in Saves re-renders the nav instantly and persists across reload; browser set to pt-BR with no stored value defaults to Portuguese.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(i18n): typed dictionary core, language setting, shell strings"
```

---

### Task 2: String extraction — screens batch

**Files:**
- Modify: `src/i18n/en.ts`, `src/i18n/pt.ts`, `src/screens/HomeScreen.tsx`, `src/screens/TableScreen.tsx`, `src/screens/StatsScreen.tsx`, `src/screens/FixturesScreen.tsx`, `src/screens/CupScreen.tsx`, `src/screens/SquadScreen.tsx`, `src/screens/TransfersScreen.tsx`, `src/screens/HistoryScreen.tsx`, `src/screens/SavesScreen.tsx`

**Interfaces:**
- Consumes: `t`, `useLang` from `../i18n`
- Produces: every user-visible literal in the nine listed screens goes through `t()`; dictionaries grow accordingly (grouped keys: `home.*`, `table.*`, `stats.*`, `fixtures.*`, `cup.*`, `squad.*`, `transfers.*`, `history.*`, `saves.*`, shared `common.*`)

**Extraction rules (binding):**
- Every screen calls `useLang()` once at the top (subscription), then uses `t(...)` in JSX.
- Column `label`s in DataTable defs, ScreenHeader `label`/`title`, Panel labels, Button texts, Badge texts, EmptyState texts, aria-labels, `(p)`-style markers' accessible text, option labels — all keys.
- Interpolations use params: e.g. `t('transfers.expiresIn', { n: o.roundsLeft })` with en `'expires in {n} round(s)'` / pt `'expira em {n} rodada(s)'`; `t('cup.roundWeek', { round: ..., week: ... })`.
- Data stays data: names, money (already locale-formatted by `MoneyText`), computed numbers.
- Cup round display names (`Round 1`, `Quarter-finals`, …) are UI constants → keys `cup.round1`…`cup.roundFinal`.
- Portuguese copy: use natural pt-BR football vocabulary (Elenco, Tabela, Rodada, Contrato, Escalação, "Vender", "Dispensar", "Renovar", "Titular"); do not machine-transliterate.
- Do NOT extract: the ledger labels rendered from `state.finances` (Task 3 handles those via the pattern table) and `eventText` in EventFeed (also Task 3).

- [ ] **Step 1: Extract screen by screen** (one commit at the end; verify `npx tsc -b --force` after each screen — a typo'd key is a compile error, which is the point)

- [ ] **Step 2: Sweep check**

`grep -rn "label=\"[A-Z]" src/screens src/ui` and a read-through of each screen: no remaining hardcoded UI sentences (ledger/eventText exempt until Task 3).

- [ ] **Step 3: Verify**

`npm test`, `npx tsc -b --force`, `npm run build`; dev: click through all screens in pt — everything reads Portuguese except names, money, ledger rows, and match events.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(i18n): translate all screens"
```

---

### Task 3: Ledger + events translation (pattern table) and toast keys

**Files:**
- Create: `src/i18n/ledger.ts`, `src/i18n/ledger.test.ts`
- Modify: `src/i18n/en.ts`, `src/i18n/pt.ts`, `src/ui/EventFeed.tsx`, `src/ui/toastEvents.ts`, `src/screens/FinanceScreen.tsx`, `src/screens/HomeScreen.tsx` (if it renders ledger labels)

**Interfaces:**
- Produces:
  - `ledger.ts`: `export type LedgerCategory = 'gate' | 'sponsors' | 'prize' | 'wages' | 'maintenance' | 'interest' | 'loan' | 'transfers' | 'stadium' | 'other'`; `export function describeLedger(label: string): { text: string; category: LedgerCategory }` — translates a canonical engine label via the active language and pattern params; unknown labels pass through verbatim as `'other'`
  - `EventFeed`'s `eventText` renders via keys (goal/chance/cards/injury lines translated; player/team names interpolated)
  - `toastEvents.detectToasts` returns translated texts by building them through `t`/`describeLedger` at detection time

**The pattern table is the single source of truth for engine labels.** Engine emits (verified against `src/engine/`): `Wages`, `Stadium maintenance`, `Sponsors`, `Gate receipts ({n} fans)`, `Friendly gate receipts`, `Deposit interest`, `Overdraft charge`, `Loan interest`, `Loan drawn`, `Loan repayment`, `Sold {name}`, `Signed {name}`, `Released {name} (severance)`, `Prize money (finished {p} in Division {d})`, `Cup winners prize`, `Cup runners-up prize`, `Stadium expansion (+{n} seats)`, `Stadium expansion complete (+{n} seats)`. Implement `describeLedger` as an ordered array of `{ re: RegExp, key: TranslationKey, category, params: (m) => ... }` tried in order, with the passthrough fallback.

- [ ] **Step 1: Write the failing tests**

`src/i18n/ledger.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { setLang } from './index'
import { describeLedger } from './ledger'

describe('describeLedger', () => {
  it('translates every engine label shape', () => {
    setLang('pt')
    expect(describeLedger('Wages')).toEqual({ text: 'Salários', category: 'wages' })
    expect(describeLedger('Gate receipts (12345 fans)').text).toContain('12345')
    expect(describeLedger('Sold João Silva').text).toContain('João Silva')
    expect(describeLedger('Prize money (finished 3 in Division 2)').text).toMatch(/3/)
    expect(describeLedger('Stadium expansion complete (+2000 seats)').category).toBe('stadium')
    setLang('en')
    expect(describeLedger('Wages')).toEqual({ text: 'Wages', category: 'wages' })
  })

  it('passes unknown labels through as other', () => {
    expect(describeLedger('Mystery payment')).toEqual({ text: 'Mystery payment', category: 'other' })
  })

  it('categorizes for the finance summary', () => {
    expect(describeLedger('Sponsors').category).toBe('sponsors')
    expect(describeLedger('Deposit interest').category).toBe('interest')
    expect(describeLedger('Loan drawn').category).toBe('loan')
    expect(describeLedger('Signed Pelé').category).toBe('transfers')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run src/i18n/ledger.test.ts`

- [ ] **Step 3: Implement** the table (keys like `ledger.wages`, `ledger.gate`, `ledger.sold`… in both dictionaries), swap FinanceScreen's ledger Item cell and toastEvents' texts to `describeLedger`/`t`, and move `eventText` content to keys (`event.goal`: en `'GOAL! {player}'` / pt `'GOL! {player}'`, etc. — keep the icons as they are).

- [ ] **Step 4: Verify** — `npm test`, `npx tsc -b --force`, `npm run build`; dev in pt: ledger rows, toasts, and the match feed read Portuguese; an old save's ledger renders translated (labels are matched at display time — no migration).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(i18n): ledger pattern table, event feed, toast translation"
```

---

### Task 4: Five match speeds

**Files:**
- Modify: `src/screens/MatchScreen.tsx`, `src/i18n/en.ts`, `src/i18n/pt.ts`

**Interfaces:**
- Produces: `const SPEEDS = [{ key: 'speed.slow', ms: 500 }, { key: 'speed.medium', ms: 400 }, { key: 'speed.fast', ms: 300 }, { key: 'speed.superFast', ms: 150 }, { key: 'speed.ultraFast', ms: 50 }] as const` in MatchScreen; selected index persisted at `futscript-speed` (default index 2 = Fast); the interval effect keys on `[speedIndex, done]`; Skip and reduced-motion behavior unchanged

- [ ] **Step 1: Implement**

Replace the `speed: 1 | 2` state with `speedIndex` initialized from localStorage (`const stored = Number(localStorage.getItem('futscript-speed')); useState(Number.isInteger(stored) && stored >= 0 && stored <= 4 ? stored : 2)`); clicking a speed sets state AND persists. Controls: five compact ghost `sm` Buttons labeled `t(SPEEDS[i].key)` with `aria-pressed`, active one keeps the `border-accent! text-accent-strong!` treatment. Interval: `setInterval(..., SPEEDS[speedIndex].ms)`, effect deps `[speedIndex, done]`.

Labels: en Slow / Medium / Fast / Super fast / Ultra fast; pt Lento / Médio / Rápido / Muito rápido / Ultrarrápido. On narrow screens the five labels wrap — acceptable; keep them text (not icons) for clarity.

- [ ] **Step 2: Verify** — suite/tsc/build; dev: pick Ultra fast (match finishes ≈4.5s), reload, next match still Ultra fast; reduced-motion still renders complete instantly.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ui): five persisted match speeds"
```

---

### Task 5: Squad icon actions

**Files:**
- Modify: `src/ui/icons.tsx`, `src/screens/SquadScreen.tsx`

**Interfaces:**
- Produces: `PlayIcon`, `TagIcon`, `ExitIcon`, `RenewIcon` in icons.tsx (16×16 stroke style, `({ className? })`); Squad's action buttons become icon buttons with `title={t(...)}` + `aria-label={t(...)}`

- [ ] **Step 1: Add the icons**

```tsx
export const PlayIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M8 5v14l11-7L8 5Z" /></Icon>
)
export const TagIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M3 12V4h8l10 10-8 8L3 12Z" /><circle cx="8" cy="9" r="1.2" /></Icon>
)
export const ExitIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M9 4H5v16h4M14 8l4 4-4 4M18 12H9" /></Icon>
)
export const RenewIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M20 6v5h-5M4 18v-5h5" /><path d="M19.5 11a8 8 0 0 0-14-4M4.5 13a8 8 0 0 0 14 4" /></Icon>
)
```

- [ ] **Step 2: Swap the Squad actions row**

Default mode renders icon Buttons (`size="sm"`, ghost): Start → `PlayIcon` (disabled rule unchanged), Sell → `TagIcon` (opens the existing inline price flow — the List/Cancel confirm inside that flow keeps text labels), Renew (when eligible) → `RenewIcon` with the salary in the `title` (e.g. `title={t('squad.renewFor', { salary: formatMoney(renewalSalary(p)) })}`); Release stays a `ConfirmButton` but its idle label becomes the `ExitIcon` (ConfirmButton's `label` prop is `ReactNode` — pass the icon; the ARMED state keeps the explicit text `Confirm −$X`, money must stay visible before an irreversible spend). Every icon button: `aria-label` + `title` from keys (`squad.start`, `squad.sell`, `squad.release`, `squad.renew`).

- [ ] **Step 3: Verify** — suite/tsc/build; dev at 390px: the icon row fits on one line in the mobile card's full-width action row; tooltips show on hover; screen-reader labels present (inspect the a11y tree).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ui): icon actions on the squad screen"
```

---

### Task 6: Simplified finance screen

**Files:**
- Modify: `src/screens/FinanceScreen.tsx`, `src/i18n/en.ts`, `src/i18n/pt.ts`

**Interfaces:**
- Consumes: `describeLedger` (Task 3) for categories
- Produces: FinanceScreen leads with a "This week" summary Panel; the raw ledger collapses behind a toggle

- [ ] **Step 1: Implement**

Above the existing StatChip row, add `Panel label={t('finance.thisWeek')}`:
- Compute from `state.finances` entries of the **last played week** (`round === state.round - 1` in the current season, matching HomeScreen's `weekDelta`; when week 1, show the empty state `t('finance.noWeekYet')`).
- Three StatChips inside: Income (sum of positive amounts), Expenses (sum of negatives, shown as `MoneyText` of the negative total), Net (`MoneyText signed`).
- Below them, a category breakdown list: group the week's entries by `describeLedger(label).category`, one row per non-empty category — translated category name (`category.gate`, `category.wages`, …) left, summed `MoneyText signed` right, ordered income-first by absolute size.

The full ledger DataTable moves inside a `Panel label={t('finance.ledger')}` whose header `action` is a ghost `sm` Button toggling visibility (`t('finance.showDetails')` / `t('finance.hideDetails')`, `aria-expanded`); collapsed by default.

- [ ] **Step 2: Verify** — suite/tsc/build; dev: after advancing a week, the summary matches the ledger arithmetic (spot-check one week by expanding details); categories read correctly in both languages.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ui): weekly finance summary with category breakdown"
```

---

### Task 7: New-career reset + random starting club

**Files:**
- Modify: `src/screens/SavesScreen.tsx`, `src/engine/newGame.ts`, `src/engine/newGame.test.ts`, plus the test call sites enumerated below
- Test: `src/engine/newGame.test.ts`

**Interfaces:**
- Produces:
  - `newGame(seed)` assigns `userTeamId` to a **random Division 3 club** — drawn with the world's own `rand` AFTER world generation completes (one extra `randInt` at the end; world contents for a given seed are unchanged, only the manager's assignment and the subsequent rngState differ)
  - SavesScreen gains a New career `ConfirmButton` in the Settings panel: `label={t('saves.newCareer')}`, `confirmLabel={t('saves.newCareerConfirm')}`, onConfirm `setState(newGame(Date.now() % 2147483647))` (autosave writes it to the active slot)

- [ ] **Step 1: Write the failing test**

In `src/engine/newGame.test.ts`, replace the `userTeamId` assertion in "builds a three-division world with the user at the bottom":

```ts
    const userTeam = state.teams.find(t => t.id === state.userTeamId)!
    expect(userTeam.division).toBe(3)
```

and add:

```ts
  it('assigns different starting clubs across seeds (random Division 3 draw)', () => {
    const clubs = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(seed => newGame(seed).userTeamId))
    expect(clubs.size).toBeGreaterThan(1) // 8 seeds landing on one club: (1/16)^7 — a broken draw, not luck
    for (const seed of [1, 2]) {
      const s = newGame(seed)
      expect(s.teams.find(t => t.id === s.userTeamId)!.division).toBe(3)
    }
  })
```

- [ ] **Step 2: Run to verify the new test fails** (today every seed gives `teams[0]`)

- [ ] **Step 3: Implement**

In `src/engine/newGame.ts`, the returned state's `userTeamId` changes from `teams[0].id` to a draw placed AFTER fixtures/cup generation so the world itself is seed-stable:

```ts
  const divisionThree = teams.filter(t => t.division === 3)
  const userTeamId = divisionThree[randInt(rand, 0, divisionThree.length - 1)].id
```

(with the returned object using `userTeamId` and the old ponytail comment about the team picker updated to note the random draw). Keep the draw as the LAST rand consumption before `rngState` is taken — order matters for determinism; add a comment saying so.

- [ ] **Step 4: Fix the enumerated user-is-teams[0] assumptions in tests**

These are the known call sites that assume the user is `teams[0]` (verify by grep `teams\[0\]` across `src/engine/*.test.ts` and `src/ui/*.test.ts` — fix any others the grep finds the same way):
- `src/engine/season.test.ts` — the force-renew test builds the user squad from `s0.teams[0]`: switch to `const user = s0.teams.find(t => t.id === s0.userTeamId)!` and craft against that team's id.
- `src/engine/transfers.test.ts` — tests using `s0.teams[0]` as the user's club ("will not let the user bid on their own listing", MIN_SQUAD listing test, releasePlayer tests, offer tests' `withOffer` helper): same substitution; tests using teams[1..7] as AI clubs must instead pick a team where `t.id !== s.userTeamId` (e.g. `const ai = s0.teams.find(t => t.id !== s0.userTeamId && t.division === 3)!`).
- `src/engine/save.test.ts` — the composed migration test already re-points `userTeamId` explicitly; confirm it still passes (it constructs its own payload, so it should).
- `src/ui/toastEvents.test.ts` — uses `state.userTeamId` lookups already; confirm by grep.

Statistical tests note: the extra rand draw shifts every downstream simulation for a given seed. If a seed-pinned statistical test trips (goal-density band, "AI clubs eventually bid" loop, discipline floor), adjust ONLY the seed or the loop count — never the direction or the band width — and list every such change in the report.

- [ ] **Step 5: Add the New-career button** to SavesScreen's Settings panel (ConfirmButton, keys `saves.newCareer` / `saves.newCareerConfirm` — en 'New career' / 'Confirm — replaces the active slot'; pt 'Nova carreira' / 'Confirmar — substitui o jogo salvo ativo').

- [ ] **Step 6: Verify** — `npm test` (all green incl. the adjusted files), `npx tsc -b --force`, `npm run build`; dev: New career lands you at a random Division 3 club (repeat twice to see different clubs); the confirm arms and disarms correctly.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: random division 3 starting club and new-career reset"
```

---

### Task 8: UX pack — cup divisions, outbid badge, table search/focus, H/A clarity, welcome screen

**Files:**
- Modify: `src/screens/CupScreen.tsx`, `src/screens/TransfersScreen.tsx`, `src/engine/transfers.ts`, `src/engine/transfers.test.ts`, `src/screens/TableScreen.tsx`, `src/screens/HomeScreen.tsx`, `src/screens/FixturesScreen.tsx`, `src/screens/FinanceScreen.tsx`, `src/ui/toastEvents.ts`, `src/App.tsx`
- Create: `src/screens/WelcomeScreen.tsx`

**Interfaces:**
- Produces:
  - `TransferListing` gains `userBid?: number` (optional — NO save-version bump; absent in old saves is fine). `placeBid` sets it alongside `currentBid`. This is the phase's second and last engine touch (two lines + type field).
  - `TableScreen({ state, focusTeamId? })` — optional prop: when set, the screen initializes to that club's division and highlights the row (a `ring-1 ring-accent` treatment on top of any spine, cleared on user interaction).
  - App-level nav focus: `Game` keeps `const [tableFocus, setTableFocus] = useState<number | null>(null)`; a `goToTeam(teamId)` helper sets it and navigates to `'table'`; TableScreen receives `focusTeamId={tableFocus ?? undefined}` and App clears it via an `onFocusConsumed` callback — simpler alternative allowed: pass `key={tableFocus}` and let the prop drive initial state only; pick one and note it in the report.
  - `WelcomeScreen({ onDismiss })` — full-bleed takeover; App shows it when the session created a brand-new career (a `useState` flag set where `newGame` is called — on first-load-with-no-save AND on New-career reset; never on loading an existing save). Not persisted in `GameState`.

**Item specs (all strings via `t()` with en+pt entries):**

1. **Cup divisions** (`CupScreen`): each tie row renders the club's division after the name — `Sereno FC <span className="text-ink-faint">· D2</span>` — via a `divisionOf(teamId)` lookup. Both sides, both the list rows and the expanded report heading.
2. **Outbid badge** (`transfers.ts` + `TransfersScreen` + `toastEvents.ts`):
   - `placeBid` also writes `userBid: amount` on the listing (keep everything else byte-identical). Add a test in `transfers.test.ts`: after `placeBid`, the listing carries `userBid`; after an AI covers it (craft `currentBidderId` change via `runTransfers` or direct state), `userBid` persists while `currentBidderId` differs.
   - UI: in the listings action column, when `l.userBid !== undefined && l.currentBidderId !== state.userTeamId && l.currentBidderId !== null` render `Badge tone="warn"` with `t('transfers.outbid', { amount })` ("Outbid — you bid {amount}") above the bid input (which stays usable to re-bid).
   - Toast: `detectToasts` gains a rule — for listings present in both states where prev had `currentBidderId === user` and next doesn't (and the listing still exists), push a warn toast `t('toast.outbid', { player })`. Max-3 cap unchanged.
3. **Table search + focus** (`TableScreen`): a search `<input>` in the header actions (recipe styling, `aria-label`, placeholder `t('table.searchPlaceholder')`). Typing ≥2 chars matches club names across ALL divisions (case/diacritic-insensitive — normalize with `.normalize('NFD').replace(/\p{Diacritic}/gu, '')`); on match, switch the division select to the club's division and apply the highlight ring to its row; empty state under the input when nothing matches. The `focusTeamId` prop reuses exactly this highlight path.
4. **Next Match link** (`HomeScreen`): the opponent name in the Next Match card becomes a button (`hover:underline`, focus ring) calling `goToTeam(opponentId)` — plumbed via a new optional `onShowTeam?: (teamId: number) => void` prop from App.
5. **H/A clarity** (`FixturesScreen` + `FinanceScreen`): on the user's fixture rows, append a mono marker `H`/`A` (`text-ink-faint`, `title={t('fixtures.homeMatch')/t('fixtures.awayMatch')}`) after the score cell. In the Finance weekly summary (Task 6's panel), the gate category row gains a faint hint suffix `t('finance.gateHint')` ("earned at home matches") — only when the gate category is present or the week had no home match (then show `t('finance.awayWeek')` "away week — no gate receipts" as the gate row).
6. **Welcome screen** (`WelcomeScreen.tsx` + App): full-bleed, Quiet Heritage voice — `FUT_` wordmark, `t('welcome.title')` ("Welcome to the dugout"), a short feature list (manage the squad, trade in the market, balance the books, climb three divisions, win the cup — 5 lines, each icon + sentence, all keys), your assigned club named (`t('welcome.yourClub', { club, division })`), and a primary Button `t('welcome.start')`. Shown once per new career (session flag as specified above); Escape also dismisses.

- [ ] **Step 1: Engine bit first (TDD)** — the `userBid` field + test, run focused test, then the rest of the items screen by screen
- [ ] **Step 2: Verify** — `npm test`, `npx tsc -b --force`, `npm run build`; dev pass over all six items in both languages at both widths
- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ui): ux pack — cup divisions, outbid badge, table search, welcome"
```

---

### Task 9: Phase 6 acceptance

**Files:** none new.

- [ ] **Step 1: Full checks** — `npm test`, `npx tsc -b --force`, `npm run build`.
- [ ] **Step 2: Play** — in Portuguese end-to-end: fresh career (random club + welcome screen), a match at each speed extreme (Slow ≈45s, Ultra ≈4.5s, persisted), squad icon actions with tooltips at 390px, finance summary vs expanded ledger arithmetic (incl. the away-week gate hint), toasts and match feed in pt, bid on a listing and get outbid (badge + toast), search the table for a Division 1 club, click the Next Match opponent, switch back to English mid-session (everything flips live), New career reset (welcome shows again).
- [ ] **Step 3: Tag**

```bash
git add -A
git commit -m "chore: phase 6 complete" --allow-empty
git tag phase-6
```
