# Futscript UI Redesign — "Quiet Heritage" Design Spec

A full UI/UX overhaul of futscript's ten screens onto a modern, minimalist design system. The engine (`src/engine/`) is byte-untouched; this is a pure presentation-layer project.

**Date:** 2026-07-07

## Decisions

| Question | Decision |
|---|---|
| Styling stack | Tailwind CSS v4 (CSS-first config, no other UI dependency) |
| Visual direction | "Quiet Heritage" (M1): Ledger's warm-paper minimalism + Teletext's monospace data voice |
| App shell | Slim sidebar (desktop) + command-center Home dashboard; bottom tab bar (mobile) |
| Dark mode | Light + dark + manual toggle (system default, persisted in localStorage, `dark:` class strategy) |
| Responsive | Fully responsive, mobile-equal (tables become card lists on small screens) |
| Execution | Design-system-first: tokens + primitives + shell, then screen-by-screen migration |

## Visual identity

**Light (default) tokens** — warm paper, near-black ink, one green accent:

| Token | Value | Use |
|---|---|---|
| `--surface` | `#fafaf9` (stone-50) | app background |
| `--surface-raised` | `#f5f5f4` (stone-100) | sidebar, panels, cards |
| `--rule` | `#e7e5e4` (stone-200) | hairline borders/dividers |
| `--ink` | `#1c1917` (stone-900) | primary text |
| `--ink-muted` | `#57534e` (stone-600) | secondary text, inactive nav |
| `--ink-faint` | `#a8a29e` (stone-400) | tertiary: row numbers, units |
| `--accent` | `#16a34a` (green-600) | THE accent: user's club, money, positive deltas, primary buttons |
| `--accent-strong` | `#15803d` (green-700) | accent text on light surfaces (AA) |
| `--danger` | `#dc2626` (red-600) | negative money, injuries, destructive confirm |
| `--warn` | `#d97706` (amber-600) | warnings (board patience, expiring contracts) |

**Dark tokens** — the same design at night, warm not blue: `--surface #0c0a09` (stone-950), `--surface-raised #1c1917`, `--rule #292524`, `--ink #fafaf9`, `--ink-muted #a8a29e`, `--ink-faint #57534e`, `--accent #4ade80` (green-400), `--accent-strong #86efac` where contrast demands, `--danger #f87171`, `--warn #fbbf24`. All pairings meet WCAG AA (4.5:1 body, 3:1 large text) — verify at implementation.

**Typography.** Inter (self-hosted via `@fontsource-variable/inter`) for prose, labels, names. JetBrains Mono (`@fontsource-variable/jetbrains-mono`) for every number: scores, money, dates, ages, levels, week counters — always `font-variant-numeric: tabular-nums`. Scale: 12px labels (uppercase, `tracking-wider`, `--ink-muted`), 14px body, 16px emphasized, 20px screen titles, 32px+ scoreline. No CDN fonts — bundles must work offline.

**Voice.** Small uppercase letter-spaced section labels. Hairline rules, never boxes-in-boxes. Whitespace does the grouping; color only speaks when something needs you. "Your" rows get a 3px green left spine (not a filled bar). Money is always mono and signed-colored (green positive, red negative, muted zero).

## App shell

**Desktop (≥768px).** Fixed left sidebar, `--surface-raised`, hairline right rule, ~13rem wide:
- Wordmark `FUT_` (mono, bold).
- Nav: Home, Squad, Table, Fixtures, Cup, Stats, Transfers, Finance, History, Saves. Active item: raised pill, `--ink`; inactive `--ink-muted`. Each item = icon (inline SVG, stroke style) + label.
- Footer block: club name, cash (`MoneyText`), Season/Week (mono), theme toggle (sun/moon icon button), and the primary **Advance Week** button — always visible, never scrolled away. When the season is over it becomes **New Season**; during a replay/game-over takeover it's hidden with the whole shell.
- Attention dot on nav items with pending items (Transfers: offers count; Finance: broke warning).

**Mobile (<768px).** Sidebar collapses to a fixed bottom tab bar: Home, Squad, Table, Finance, More. "More" opens a bottom sheet listing the remaining screens + theme toggle. Advance Week floats as a pill button above the tab bar, right-aligned. Screen headers gain the club vitals line (cash · week) since the sidebar footer is gone.

**Screen header pattern (every screen).** Uppercase section label (e.g. `DIVISION 3`), 20px title (e.g. `League Table`), contextual actions right (selects, buttons). Consistent 24px top padding, max-width 64rem centered content column.

**Takeovers.** MatchScreen (replay), the sacked screen, and the champion moment render full-bleed without the shell, in the same token language.

## Home — the command center (new screen)

Default screen on load. A 12-column responsive grid of Panels (stacks single-column on mobile):

1. **Next fixture** — opponent name, home/away, competition (league week N / cup round name), opponent's division position; primary Advance Week button beside it (mobile: this is the main Advance affordance).
2. **Table excerpt** — 5 rows centered on the user (2 above, 2 below; clamped at table edges), green spine on the user row, "Full table →" link. Uses the same `DataTable` columns as TableScreen.
3. **Money** — cash (large `MoneyText`), this-week net delta, and a hand-rolled SVG sparkline of the last ~20 ledger entries' running balance (no chart library). Links to Finance.
4. **Club mood** — fan mood as a number + a thin horizontal meter (green fill), season position, capacity.
5. **Attention list** — one line each, only when present: incoming offers (count + best amount), contracts expiring (count), construction (weeks left), board patience (N/8, amber, red at ≥6), cup tie this week. Each links to its screen. Empty state: "All quiet at the club."

## Component kit (`src/ui/`, one file per primitive)

| Component | Responsibility |
|---|---|
| `Panel` | Raised surface, hairline border, consistent padding; optional header (SectionLabel + action slot) |
| `SectionLabel` | The uppercase micro-label |
| `DataTable<T>` | THE workhorse. Takes column defs `{ key, label, align, mono?, render?, hideOnMobile? }` + rows + `rowAccent?(row)` (green spine) + `onRowClick?`. Desktop: hairline table, mono numeric cells, sticky header. Mobile: renders the same defs as stacked cards (label:value pairs, `hideOnMobile` columns dropped). One component, two layouts — screens never write `<table>` again |
| `StatChip` | Label + big mono value + optional delta (signed, colored) |
| `Button` | `primary` (green fill), `ghost` (hairline), `danger` (red fill); sizes `sm`/`md`; `disabled` styles |
| `Badge` | Status dots + label: injury (red, `🚑 3w` → dot + "Injured · 3w"), suspension, yellow cards, form arrows (`▲2` green / `▼1` red / `–` muted) |
| `ConfirmButton` | Formalizes the existing two-click pattern: first click arms (`danger` styling + label swap), second fires, outside-click/timeout disarms |
| `Toast` + `useToasts` | Bottom-right stack (top-center mobile), auto-dismiss 5s, max 3. Fired by a small UI-side diff of state transitions after `advanceRound`/actions: offer arrived, player sold/bought (yours), expansion complete, loan interest warning. Pure UI — the engine stays silent |
| `EmptyState` | Icon + one line + optional action, for empty lists |
| `MoneyText` | Mono, `toLocaleString`, sign-colored; sizes |
| `Sparkline` | ~30-line inline SVG polyline, stroke `--accent`, no axes |
| `ThemeToggle` | Reads/writes `futscript-theme` (`'light' \| 'dark' \| null` = system), toggles `dark` class on `<html>`; inline script in `index.html` prevents flash-of-wrong-theme |

No Radix/shadcn/Headless UI initially — the UI is tables, buttons, selects, and one bottom sheet. If keyboard/a11y gaps appear in the sheet or menus during implementation, adding a single Radix primitive is permitted but must be justified in the task report.

## Screens

All ten screens migrate onto the kit; **all game behavior, engine calls, and state handling stay exactly as they are**. Per-screen notes:

- **Squad** (flagship): DataTable grouped GK/DF/MF/FW with sticky group sub-headers; columns Pos · Name · Age · Lvl · Form · Fit · Status · Salary · Contract · Value (Age/Fit/Salary `hideOnMobile`); Badge column for status; row actions (Start/Sell/Release/Renew) inline on desktop, in a row-tap action sheet on mobile; controls row: formation/tactic/training selects + auto-pick + friendlies checkbox as a labeled switch.
- **Table**: division select in header; DataTable; promotion (top 3, green tint) and relegation (bottom 3, red tint) zone markers as 3px spines; user row green spine + bold.
- **Fixtures**: week navigation as `‹ Week N ›` segmented control; fixture rows with mono scores; played rows expand to the report inline (event feed styling shared with the ticker); cup-week empty state links to Cup.
- **Cup**: rounds as vertical sections with SectionLabels (round name + week); ties as fixture rows, `(p)` penalty marker, winner in ink / loser muted; champion banner as a Panel with the trophy moment; report expansion like Fixtures.
- **Stats**: two Panels (season top 15 / all-time top 20), DataTables, rank column mono.
- **Transfers**: Offers as attention-styled Panels with Accept (primary) / Counter (ghost) / Reject (danger-ghost) buttons; listings DataTable with inline bid input (mono) + Bid button; "you lead" / "your listing" as Badges.
- **Finance**: top StatChip row (Cash · Weekly wages · Loan · Board patience when >0); Stadium Panel (capacity, mood meter, maintenance, ticket price stepper input, Expand `ConfirmButton` or construction countdown); loan controls; ledger DataTable grouped by week with signed `MoneyText`, newest first.
- **History**: honours StatChips (titles · cups) + season DataTable.
- **Saves**: three slot Panels (career summary, active Badge, Save here / Load / Delete `ConfirmButton`); Backup Panel with Export/Import buttons + error toast instead of inline banner.
- **Match ticker** (biggest glow-up): full-bleed takeover. Top: thin minute progress bar (0–90). Center: club names + huge mono scoreline. Below: event feed, newest on top, icons per type (goal ⚽ filled green when yours, cards as colored squares, injury as red cross), your club's events emphasized (ink vs muted). Controls: 1× / 2× / Skip, then Continue. `prefers-reduced-motion`: render final state immediately with the feed complete.
- **Sacked / Champion moments**: full-bleed, mono display type, single accent; New Career primary button.

## Accessibility & quality bar

- WCAG AA contrast on both themes (checked with tooling during implementation).
- `:focus-visible` rings (`--accent`, 2px offset) on all interactive elements; icon-only buttons get `aria-label`.
- `prefers-reduced-motion`: no ticker animation, no toast slide (fade only).
- Tables keyboard-navigable (row actions reachable by Tab); the mobile More-sheet and action sheets trap focus and close on Escape.
- Touch targets ≥ 40px on mobile.

## Testing & verification

- Engine untouched: the 146-test suite is the regression net and must stay green after every task.
- No component-test framework (consistent with the repo). Each screen migration is verified in the browser at desktop and 390px widths.
- Final acceptance: play flows across all ten screens on both form factors and both themes; Lighthouse a11y pass ≥ 95 on Home, Squad, Finance.

## Non-goals

No router library (state-based nav stays). No chart library. No component library (single-primitive exception clause above). No engine changes, no new game features, no save-schema changes (`futscript-theme` is a separate localStorage key, not part of `GameState`).

## Delivery phases

- **A — Foundations**: Tailwind v4 + fonts + tokens (both themes) + theme toggle + component kit.
- **B — Shell + Home**: sidebar/bottom-bar shell, screen-header pattern, Home dashboard, toast plumbing.
- **C — Screen migrations**: Table+Stats, Fixtures+Cup, Squad, Transfers, Finance+History+Saves (5 tasks).
- **D — Moments**: match ticker, sacked/champion takeovers.
- **E — Cleanup & acceptance**: delete legacy `index.css` styles, a11y sweep, dual-form-factor/theme acceptance.
