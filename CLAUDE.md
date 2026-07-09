# futscript

A local-only browser football (soccer) management game — inspired by Elifoot 98 and Hattrick.
**No API, no backend, no database.** Everything runs in the browser; the only persistence is
`localStorage`. React 19 + TypeScript + Vite + Tailwind v4.

---

## Commands

```bash
npm run dev      # Vite dev server at http://localhost:5173
npm test         # vitest run (the full suite; ~24 test files live beside their source)
npm run build    # tsc -b && vite build
npm run lint     # oxlint
```

**Typecheck gotcha:** `tsc --noEmit` is a **no-op** in this repo (it prints nothing and always
"passes"). To actually typecheck, run:

```bash
npx tsc -b --force
```

Always use `tsc -b --force` when you need a real type check.

---

## Architecture

The game is a **pure functional engine over a single serializable state object**.

```
src/
  engine/    Pure TypeScript game logic. NO React, NO DOM, NO i18n. The rules of the game.
  i18n/      Translations (en/pt) + display-time formatting. The engine never sees a string.
  ui/        Reusable design-system kit (Panel, Button, DataTable, Shell, ...).
  screens/   Top-level screens that compose ui/ + engine/ (HomeScreen, FinanceScreen, ...).
```

`GameState` (defined in `src/engine/types.ts`) is the entire game — teams, players, fixtures,
finances, news, career history, RNG state. It is a plain, JSON-serializable object. Every engine
function is a **pure transform**: `(state: GameState, ...args) => GameState`. It returns a new
state; it never mutates in place, never reaches for globals, never does I/O.

This is the design's load-bearing constraint. It gives us: deterministic replays, trivial saves
(just `JSON.stringify`), and testability without mocks. Do not break it.

---

## The hard rules (do not violate these)

1. **The engine is pure.** `src/engine/**` must not import React, touch the DOM, read
   `localStorage`, or import from `i18n/`. **One sanctioned exception:** `save.ts` takes a
   `storage: Storage = localStorage` default parameter (so it's still testable by injecting a
   fake). That's the only place the engine knows storage exists.

2. **No `Math.random()` and no `Date.now()` anywhere in the engine.** Randomness is a seeded
   `mulberry32` PRNG (`src/engine/rng.ts`), and the seed state (`rngState`) is threaded through
   `GameState`. Every random draw advances and returns new state. This is what makes saves
   reproducible — a save replayed from the same state produces the same season. If you need
   randomness, thread the RNG; never call the platform.

3. **Money is integer dollars.** Use `Math.round` at every computation boundary. No floats
   leaking into balances.

4. **The engine emits no user-facing prose.** It emits *structured* facts — e.g. a `NewsItem` is
   `{ type, params, week, season }`, and a ledger entry carries a canonical-English label that
   `i18n/ledger.ts` translates at display time. This is why switching language retranslates the
   entire history retroactively. If you're tempted to build a sentence in the engine, stop and
   emit data instead.

5. **Saves are versioned and migrated.** `GameState.version` is currently **7**. Any change to the
   state shape bumps the version and adds a migration step to the `migrateToCurrent` chain in
   `src/engine/save.ts` (`migrateV1 → migrateV2 → … → migrateV7`). `migrateToCurrent` also has a
   structural shape guard and returns `null` for anything it can't safely load (a bare
   `{"version":7}` must not crash the app). Never widen the state without a migration + a
   regression test that loads an old save.

---

## i18n discipline

- `src/i18n/en.ts` is the source of truth: `export const en = { ... } as const`, and
  `TranslationKey = keyof typeof en`.
- `src/i18n/pt.ts` is typed `Record<TranslationKey, string>`, so a missing translation is a
  **compile error**. Add a key to `en.ts` → you must add it to `pt.ts` or the build breaks.
- `t(key, params?)` interpolates `{param}` placeholders. `useLang()` (a `useSyncExternalStore`
  hook) re-renders on language change.
- Engine → display translation happens in `i18n/ledger.ts` (finance labels) and `i18n/news.ts`
  (news items), each with a **compile-checked map** from engine enum → `TranslationKey`. Add a
  new `NewsType` and you're forced to give it a translation key. Format numbers (money) *before*
  interpolation, not inside the dictionary string.

---

## UI / design system

- **Tailwind v4, CSS-first.** Semantic design tokens are defined on `:root` / `.dark` and mapped
  via `@theme inline`. Use the **semantic tokens** (`text-ink`, `bg-surface`, `border-rule`,
  `text-accent`, `text-danger`, ...) — not raw Tailwind color scales. The token values are
  WCAG-AA corrected; don't reintroduce raw `stone-500`-style colors.
- Light + dark + a single-source theme toggle; **fully responsive, mobile-equal** (every screen
  works on mobile, not a degraded version). `DataTable` renders a desktop table and mobile cards
  from one column spec.
- Build screens out of the `src/ui/` kit (Panel, SectionLabel, Button, MoneyText, StatChip,
  Badge, ConfirmButton, Toast/useToasts, EmptyState, DataTable, Sparkline, Shell, ScreenHeader,
  EventFeed, icons). Reach for an existing primitive before writing a new one.
- Fonts are self-hosted (`@fontsource-variable/inter`, `jetbrains-mono`) — no CDN, no network.

---

## Tuning constants (`ponytail:` comments)

Economy/balance constants live next to the logic they govern, each tagged with a `// ponytail:`
comment so they can be retuned in one place: `salaryFor`, `DIVISION_FACTOR`,
`MAINTENANCE_PER_SEAT`, `SPONSOR_BASE`, attendance formula, `EXPANSION`, `MIN_SQUAD`,
`CHANCE_RATE`, board-confidence thresholds, etc. When balancing, change the constant — don't
scatter magic numbers. Balance is validated by driving headless seasons (see below), not by
eyeballing.

---

## Testing

- **TDD.** Tests live beside their source (`match.ts` ↔ `match.test.ts`). Write the failing test
  first, watch it fail, implement the minimum, watch it pass.
- The engine's purity makes tests mock-free: construct a `GameState`, call the transform, assert
  on the returned state.
- **Balance/economy changes** are verified by simulating full seasons headlessly through the Vite
  dev server (import `src/engine/season.ts` in-page and drive `advanceRound`/`newSeason` for N
  seasons across several seeds), not by intuition. A retune isn't done until the probe shows the
  target survival/outcome rate.
- Non-trivial logic leaves at least one runnable check behind. Don't ship a branch/loop/money path
  with no test.

---

## How to design and plan a new feature

This project runs on the **superpowers** workflow. Features ship as numbered **phases**. The
pipeline, in order:

1. **Brainstorm** (`superpowers:brainstorming`) — explore intent and requirements *before*
   touching code. For anything user-visible, produce visual direction too.
2. **Spec** → `docs/superpowers/specs/YYYY-MM-DD-<name>.md`. The master game design lives in
   `docs/superpowers/specs/2026-07-06-futscript-design.md` — read it first; it catalogs every
   phase (shipped and planned) and the architecture rationale.
3. **Plan** (`superpowers:writing-plans`) → `docs/superpowers/plans/YYYY-MM-DD-phase-N-<name>.md`.
   Plans are exhaustive and TDD-structured: exact file paths, complete code in every step, exact
   test code, exact commands with expected output. Assume the implementer has zero repo context.
   **Writing a plan is not implementing it** — plans are written and committed on their own; wait
   for an explicit go-ahead before execution.
4. **Execute** (`superpowers:subagent-driven-development`) — fresh implementer subagent per task,
   a spec+quality review after each task, a fix loop, then one whole-branch review on the most
   capable model. Tag the phase, then fast-forward merge to `main`.

**When writing a plan, sanity-check the sequencing:** a task that widens the world (e.g. more
teams, a new state field) can break a *later* task's assumptions (finances, fixtures, migrations).
Catch cross-task breakage in the plan, not at runtime.

### Phase status

Phases 1–7 are shipped and merged (`git log` — through the `phase-7` Career Mode merge). Planned/
future work (2D match visualization, hot-seat, more countries, club editor) is described in the
master design spec. Check `docs/superpowers/plans/` for the latest written plan before assuming a
phase needs writing.

---

## Working conventions

- Small, focused files; files that change together live together. Follow the patterns already in
  the neighbor you're editing — match its naming, comment density, and idiom.
- Commit at meaningful boundaries with conventional-commit prefixes (`feat:`, `fix:`, `chore:`,
  `docs:`, and scopes like `feat(ui):`, `feat(career):`). Only commit/push when asked.
- `.superpowers/` is gitignored scratch (specs' working files, the SDD progress ledger). Don't
  `git add -A` blindly — it has swept scratch into a commit before.
- Prefer the lazy solution that actually works: stdlib and native platform features before new
  dependencies, one line before fifty. New dependencies are a high bar in a game that is
  deliberately backend-free and self-contained.
- Always use git worktrees to implement plans.
