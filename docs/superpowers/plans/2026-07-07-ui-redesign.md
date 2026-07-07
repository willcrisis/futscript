# Futscript UI Redesign — "Quiet Heritage" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild futscript's presentation layer — Tailwind v4 tokens, a ten-primitive component kit, a sidebar/bottom-bar shell with a Home command center, all ten screens migrated, and a redesigned match ticker — per the Quiet Heritage spec, with the engine byte-untouched.

**Architecture:** Design-system-first. Task 1 lays Tailwind v4 + fonts + semantic tokens (light/dark via a `.dark` class); Tasks 2–3 build the kit in `src/ui/` (one file per primitive; `DataTable` renders desktop tables and mobile card lists from one column contract); Task 4 replaces the tab bar with the shell; Task 5 adds Home + toast plumbing; Tasks 6–10 migrate screens in pairs; Task 11 redoes the takeover moments; Task 12 deletes legacy CSS and runs acceptance. Screens keep their exact engine calls and state handling — only markup changes.

**Tech Stack:** Existing React 19 + TypeScript (strict) + Vite + Vitest. New: `tailwindcss` + `@tailwindcss/vite` (v4), `@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono`. Nothing else.

## Prerequisite

Phase 5 merged (tag `phase-5`, 146/146 green). The binding spec is `docs/superpowers/specs/2026-07-07-ui-redesign-design.md` — read it before any UI task; its token table and per-screen notes override taste.

## Global Constraints

- `src/engine/` is byte-untouched in every task. `npm test` (146 tests) must pass after each task — it is the regression net.
- Typecheck via `npx tsc -b --force` (plain `tsc --noEmit` is a no-op in this repo); `npm run build` must stay clean.
- Tokens are used ONLY via the semantic Tailwind utilities defined in Task 1 (`bg-surface`, `text-ink`, `border-rule`, `text-accent`, …) — never raw palette classes like `bg-stone-50` or hex values in components.
- Every number, date, and money figure renders in mono (`font-mono tabular-nums` via the kit; screens use `MoneyText`/`mono` columns rather than styling by hand).
- Green is the only accent: user's club, money, positive deltas, primary actions. Red = negative/destructive, amber = warnings. Nothing else is colored.
- All interactive elements: `:focus-visible` ring (`ring-2 ring-accent ring-offset-2 ring-offset-surface`), `aria-label` on icon-only buttons, touch targets ≥ 40px on mobile.
- Mobile breakpoint: Tailwind `md` (768px). Below it: bottom tab bar, card-list tables, floating Advance.
- Dark mode: `.dark` class on `<html>`, toggled by `ThemeToggle`, persisted at localStorage key `futscript-theme` (`'light' | 'dark'`, absent = system). Not part of `GameState`.
- No new dependencies beyond the four named above; a single Radix primitive may be added ONLY if a task hits a real keyboard/focus gap it cannot close by hand, and the task report must justify it.
- UI tasks have no unit-test step; verification = suite green + tsc + build + dev-server check at 1280px and 390px widths in BOTH themes for the screens the task touched.

## File Structure

- `src/index.css` — Tailwind import, token definitions (both themes), font imports, tiny base layer. Legacy rules deleted in Task 12.
- `index.html` — theme bootstrap inline script.
- `src/ui/` — NEW: `Panel.tsx`, `SectionLabel.tsx`, `Button.tsx`, `MoneyText.tsx`, `StatChip.tsx`, `Badge.tsx`, `EmptyState.tsx`, `ConfirmButton.tsx`, `DataTable.tsx`, `Sparkline.tsx`, `Toast.tsx`, `ThemeToggle.tsx`, `Shell.tsx`, `ScreenHeader.tsx`, `icons.tsx`, `toastEvents.ts`.
- `src/screens/HomeScreen.tsx` — NEW dashboard.
- `src/screens/*.tsx` — migrated in place.
- `src/App.tsx` — shell integration, toast provider, advance flow.

---

### Task 1: Tailwind v4 foundations — tokens, fonts, theme toggle

**Files:**
- Modify: `vite.config.ts`, `index.html`, `src/index.css`, `package.json`
- Create: `src/ui/ThemeToggle.tsx`

**Interfaces:**
- Produces (every later task consumes): semantic utilities `bg-surface`, `bg-surface-raised`, `border-rule`, `text-ink`, `text-ink-muted`, `text-ink-faint`, `text-accent`, `text-accent-strong`, `bg-accent`, `text-danger`, `bg-danger`, `text-warn`, `font-sans` (Inter), `font-mono` (JetBrains Mono); `.dark` class theming; `<ThemeToggle />` (self-contained icon button).

- [ ] **Step 1: Install**

```bash
npm install tailwindcss @tailwindcss/vite @fontsource-variable/inter @fontsource-variable/jetbrains-mono
```

- [ ] **Step 2: Wire the Vite plugin**

`vite.config.ts` gains the plugin (kept alongside the existing `test` block):

```ts
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Rewrite `src/index.css`**

Replace the whole file (the legacy component rules — `.app`, `header`, `nav`, `table`, `.ticker`, `.banner`, etc. — are kept temporarily BELOW the new foundation so un-migrated screens keep working; Task 12 deletes them):

```css
@import '@fontsource-variable/inter';
@import '@fontsource-variable/jetbrains-mono';
@import 'tailwindcss';

@custom-variant dark (&:where(.dark, .dark *));

:root {
  --surface: #fafaf9;
  --surface-raised: #f5f5f4;
  --rule: #e7e5e4;
  --ink: #1c1917;
  --ink-muted: #57534e;
  --ink-faint: #a8a29e;
  --accent: #16a34a;
  --accent-strong: #15803d;
  --danger: #dc2626;
  --warn: #d97706;
}

.dark {
  --surface: #0c0a09;
  --surface-raised: #1c1917;
  --rule: #292524;
  --ink: #fafaf9;
  --ink-muted: #a8a29e;
  --ink-faint: #57534e;
  --accent: #4ade80;
  --accent-strong: #86efac;
  --danger: #f87171;
  --warn: #fbbf24;
}

@theme inline {
  --font-sans: 'Inter Variable', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono Variable', ui-monospace, 'SF Mono', monospace;
  --color-surface: var(--surface);
  --color-surface-raised: var(--surface-raised);
  --color-rule: var(--rule);
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-ink-faint: var(--ink-faint);
  --color-accent: var(--accent);
  --color-accent-strong: var(--accent-strong);
  --color-danger: var(--danger);
  --color-warn: var(--warn);
}

@layer base {
  body {
    @apply bg-surface font-sans text-ink antialiased;
  }
  button {
    cursor: pointer;
  }
}

/* ── LEGACY (Task 12 deletes everything below this line) ─────────────── */
```

…followed by the current file's existing rules verbatim (copy them under the legacy marker; drop only `:root { font-family... color-scheme }` and `body { margin: 0 }` which the base layer replaces).

- [ ] **Step 4: Theme bootstrap in `index.html`**

Add as the FIRST child of `<head>` (prevents wrong-theme flash):

```html
    <script>
      const t = localStorage.getItem('futscript-theme')
      if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark')
      }
    </script>
```

- [ ] **Step 5: Create `src/ui/ThemeToggle.tsx`**

```tsx
import { useEffect, useState } from 'react'

function currentlyDark(): boolean {
  return document.documentElement.classList.contains('dark')
}

export default function ThemeToggle() {
  const [dark, setDark] = useState(currentlyDark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('futscript-theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <button
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setDark(d => !d)}
      className="rounded-md p-2 text-ink-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      {dark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
    </button>
  )
}
```

- [ ] **Step 6: Verify**

`npm test` (146 green), `npx tsc -b --force`, `npm run build`, then `npm run dev`: the app renders as before (legacy CSS still active), body background follows the token. Temporarily drop `<ThemeToggle />` into App's header to click-test both themes and the flash-free reload, then REMOVE that temporary usage (the shell mounts it properly in Task 4; an unused component is fine to leave exported).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): tailwind v4 foundations, quiet-heritage tokens, theme toggle"
```

---

### Task 2: Component kit I — Panel, SectionLabel, Button, MoneyText, StatChip, Badge, EmptyState

**Files:**
- Create: `src/ui/Panel.tsx`, `src/ui/SectionLabel.tsx`, `src/ui/Button.tsx`, `src/ui/MoneyText.tsx`, `src/ui/StatChip.tsx`, `src/ui/Badge.tsx`, `src/ui/EmptyState.tsx`

**Interfaces:**
- Consumes: Task 1 utilities
- Produces (exact props later tasks rely on):
  - `Panel({ label?, action?, children, className? })` — raised card; when `label` present renders a header row with `SectionLabel` left and `action` node right
  - `SectionLabel({ children })`
  - `Button({ variant?: 'primary' | 'ghost' | 'danger', size?: 'sm' | 'md', ...buttonProps })`
  - `MoneyText({ amount, size?: 'sm' | 'md' | 'lg', signed?: boolean })` — mono, locale-formatted, colored by sign when `signed`
  - `StatChip({ label, value, delta?, hint? })` — `delta` is a signed number rendered ±mono-colored
  - `Badge({ tone: 'danger' | 'warn' | 'accent' | 'muted', children })` — dot + label
  - `EmptyState({ children, action? })`

- [ ] **Step 1: Create the seven files**

`src/ui/SectionLabel.tsx`:

```tsx
import type { ReactNode } from 'react'

export default function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{children}</div>
  )
}
```

`src/ui/Panel.tsx`:

```tsx
import type { ReactNode } from 'react'
import SectionLabel from './SectionLabel'

interface Props {
  label?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}

export default function Panel({ label, action, children, className = '' }: Props) {
  return (
    <section className={`rounded-lg border border-rule bg-surface-raised p-4 ${className}`}>
      {(label || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {label ? <SectionLabel>{label}</SectionLabel> : <span />}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
```

`src/ui/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

const VARIANTS = {
  primary: 'bg-accent-strong text-white hover:opacity-90 disabled:opacity-40 dark:text-stone-950',
  ghost: 'border border-rule text-ink hover:bg-surface-raised disabled:opacity-40',
  danger: 'bg-danger text-white hover:opacity-90 disabled:opacity-40 dark:text-stone-950',
}

const SIZES = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3.5 py-2 text-sm',
}

export default function Button({ variant = 'ghost', size = 'md', className = '', ...rest }: Props) {
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface md:min-h-0 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    />
  )
}
```

(Note `dark:text-stone-950` is the ONE sanctioned raw-palette exception: filled buttons need dark text on the bright dark-mode green/red; it is confined to this file. `primary` fills with `bg-accent-strong` rather than `bg-accent` — white on light `--accent-strong` #15803d is ≈5.0:1, AA; white on light `--accent` #16a34a was only ≈3.3:1 and failed. White on `bg-danger` clears AA on both themes with the AA-corrected `--danger` token (light #b91c1c ≈6.5:1, dark #f87171 with the `dark:text-stone-950` override ≈7.6:1) — no fill-color change needed for `danger`.)

`src/ui/MoneyText.tsx`:

```tsx
interface Props {
  amount: number
  size?: 'sm' | 'md' | 'lg'
  signed?: boolean
}

const SIZES = { sm: 'text-xs', md: 'text-sm', lg: 'text-2xl font-semibold' }

export default function MoneyText({ amount, size = 'md', signed = false }: Props) {
  const abs = Math.abs(Math.round(amount)).toLocaleString('en-US')
  const text = amount < 0 ? `-$${abs}` : signed && amount > 0 ? `+$${abs}` : `$${abs}`
  const tone = !signed ? 'text-ink' : amount > 0 ? 'text-accent-strong' : amount < 0 ? 'text-danger' : 'text-ink-faint'
  return <span className={`font-mono tabular-nums ${SIZES[size]} ${tone}`}>{text}</span>
}
```

`src/ui/StatChip.tsx`:

```tsx
import type { ReactNode } from 'react'
import SectionLabel from './SectionLabel'

interface Props {
  label: string
  value: ReactNode
  delta?: number
  hint?: string
}

export default function StatChip({ label, value, delta, hint }: Props) {
  return (
    <div className="rounded-lg border border-rule bg-surface-raised px-4 py-3">
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-xl font-semibold tabular-nums">{value}</span>
        {delta !== undefined && delta !== 0 && (
          <span className={`font-mono text-xs tabular-nums ${delta > 0 ? 'text-accent-strong' : 'text-danger'}`}>
            {delta > 0 ? '+' : ''}{delta.toLocaleString('en-US')}
          </span>
        )}
      </div>
      {hint && <div className="mt-0.5 text-xs text-ink-faint">{hint}</div>}
    </div>
  )
}
```

`src/ui/Badge.tsx`:

```tsx
import type { ReactNode } from 'react'

const TONES = {
  danger: 'text-danger',
  warn: 'text-warn',
  accent: 'text-accent-strong',
  muted: 'text-ink-faint',
}

export default function Badge({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${TONES[tone]}`}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}
```

`src/ui/EmptyState.tsx`:

```tsx
import type { ReactNode } from 'react'

export default function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-ink-faint">
      <div>{children}</div>
      {action}
    </div>
  )
}
```

- [ ] **Step 2: Verify and commit**

`npm test`, `npx tsc -b --force`, `npm run build` (components are unreferenced; tree-shaken — that's fine).

```bash
git add -A
git commit -m "feat(ui): component kit I — panel, buttons, money, chips, badges"
```

---

### Task 3: Component kit II — DataTable, ConfirmButton, Toast, Sparkline

**Files:**
- Create: `src/ui/DataTable.tsx`, `src/ui/ConfirmButton.tsx`, `src/ui/Toast.tsx`, `src/ui/Sparkline.tsx`

**Interfaces:**
- Consumes: Tasks 1–2
- Produces:
  - `Column<T> = { key: string; label: string; align?: 'left' | 'right'; mono?: boolean; hideOnMobile?: boolean; render: (row: T) => ReactNode }`
  - `DataTable<T>({ columns, rows, rowKey, rowAccent?, onRowClick?, groupLabel?, empty? })` where `rowAccent?: (row: T) => 'user' | 'up' | 'down' | null` (3px left spine: accent/accent/danger), `groupLabel?: (row: T) => string` (sticky sub-header emitted when the label changes between consecutive rows), `empty?: ReactNode`
  - `ConfirmButton({ label, confirmLabel, onConfirm, size? })` — two-click with 4s auto-disarm
  - `ToastProvider({ children })`, `useToasts(): { push: (toast: { tone: 'accent' | 'warn' | 'danger'; text: string }) => void }`
  - `Sparkline({ values, width?, height? })` — SVG polyline, stroke accent

- [ ] **Step 1: Create `src/ui/DataTable.tsx`**

```tsx
import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  label: string
  align?: 'left' | 'right'
  mono?: boolean
  hideOnMobile?: boolean
  render: (row: T) => ReactNode
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  rowAccent?: (row: T) => 'user' | 'up' | 'down' | null
  onRowClick?: (row: T) => void
  groupLabel?: (row: T) => string
  empty?: ReactNode
}

const SPINE = {
  user: 'shadow-[inset_3px_0_0_0_var(--accent)]',
  up: 'shadow-[inset_3px_0_0_0_var(--accent)] opacity-90',
  down: 'shadow-[inset_3px_0_0_0_var(--danger)]',
}

function cellClass<T>(c: Column<T>): string {
  return `${c.align === 'right' ? 'text-right' : 'text-left'} ${c.mono ? 'font-mono tabular-nums' : ''}`
}

export default function DataTable<T>({ columns, rows, rowKey, rowAccent, onRowClick, groupLabel, empty }: Props<T>) {
  if (rows.length === 0 && empty) return <>{empty}</>
  const clickable = onRowClick !== undefined

  return (
    <>
      {/* desktop: hairline table */}
      <table className="hidden w-full border-collapse text-sm md:table">
        <thead>
          <tr className="border-b border-rule">
            {columns.map(c => (
              <th key={c.key} className={`px-2 py-2 text-xs font-semibold uppercase tracking-wider text-ink-muted ${cellClass(c)}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const accent = rowAccent?.(row) ?? null
            const group = groupLabel?.(row)
            const prevGroup = i > 0 ? groupLabel?.(rows[i - 1]) : undefined
            return [
              groupLabel && group !== prevGroup ? (
                <tr key={`g-${group}`} className="sticky top-0 bg-surface">
                  <td colSpan={columns.length} className="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-ink-faint">
                    {group}
                  </td>
                </tr>
              ) : null,
              <tr
                key={rowKey(row)}
                onClick={clickable ? () => onRowClick(row) : undefined}
                className={`border-b border-rule/60 ${accent ? SPINE[accent] : ''} ${clickable ? 'cursor-pointer hover:bg-surface-raised' : ''}`}
              >
                {columns.map(c => (
                  <td key={c.key} className={`px-2 py-2 ${cellClass(c)}`}>{c.render(row)}</td>
                ))}
              </tr>,
            ]
          })}
        </tbody>
      </table>

      {/* mobile: card list from the same columns */}
      <div className="flex flex-col gap-2 md:hidden">
        {rows.map((row, i) => {
          const accent = rowAccent?.(row) ?? null
          const group = groupLabel?.(row)
          const prevGroup = i > 0 ? groupLabel?.(rows[i - 1]) : undefined
          const visible = columns.filter(c => !c.hideOnMobile)
          const [first, ...rest] = visible
          return [
            groupLabel && group !== prevGroup ? (
              <div key={`g-${group}`} className="pt-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">
                {group}
              </div>
            ) : null,
            <div
              key={rowKey(row)}
              onClick={clickable ? () => onRowClick(row) : undefined}
              className={`rounded-lg border border-rule bg-surface-raised p-3 ${accent ? SPINE[accent] : ''} ${clickable ? 'cursor-pointer' : ''}`}
            >
              <div className={`text-sm font-medium ${first.mono ? 'font-mono tabular-nums' : ''}`}>{first.render(row)}</div>
              {rest.length > 0 && (
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {rest.map(c => (
                    <div key={c.key} className="flex items-baseline justify-between gap-2">
                      <dt className="text-ink-faint">{c.label}</dt>
                      <dd className={c.mono ? 'font-mono tabular-nums' : ''}>{c.render(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>,
          ]
        })}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Create `src/ui/ConfirmButton.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Button from './Button'

interface Props {
  label: ReactNode
  confirmLabel: ReactNode
  onConfirm: () => void
  size?: 'sm' | 'md'
}

export default function ConfirmButton({ label, confirmLabel, onConfirm, size = 'sm' }: Props) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!armed) return
    timer.current = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(timer.current)
  }, [armed])

  return armed ? (
    <Button variant="danger" size={size} onClick={() => { setArmed(false); onConfirm() }}>
      {confirmLabel}
    </Button>
  ) : (
    <Button variant="ghost" size={size} onClick={() => setArmed(true)}>
      {label}
    </Button>
  )
}
```

- [ ] **Step 3: Create `src/ui/Toast.tsx`**

```tsx
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export interface ToastInput {
  tone: 'accent' | 'warn' | 'danger'
  text: string
}

interface ToastItem extends ToastInput {
  id: number
}

const ToastContext = createContext<{ push: (t: ToastInput) => void }>({ push: () => {} })

// eslint-disable-next-line react-refresh/only-export-components
export function useToasts() {
  return useContext(ToastContext)
}

const TONES = {
  accent: 'border-accent/40',
  warn: 'border-warn/40',
  danger: 'border-danger/40',
}

const DOTS = {
  accent: 'bg-accent',
  warn: 'bg-warn',
  danger: 'bg-danger',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const push = useCallback((t: ToastInput) => {
    const id = nextId.current++
    setToasts(list => [...list.slice(-2), { ...t, id }]) // max 3 on screen
    setTimeout(() => setToasts(list => list.filter(x => x.id !== id)), 5000)
  }, [])

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div aria-live="polite" className="fixed left-1/2 top-3 z-50 flex w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2 md:bottom-4 md:left-auto md:right-4 md:top-auto md:translate-x-0">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-center gap-2 rounded-lg border bg-surface-raised px-3 py-2 text-sm shadow-sm motion-safe:animate-[fadein_.15s_ease-out] ${TONES[t.tone]}`}
          >
            <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${DOTS[t.tone]}`} />
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
```

and add the keyframe to `src/index.css` (inside the new foundation section, above the legacy marker):

```css
@keyframes fadein {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
```

- [ ] **Step 4: Create `src/ui/Sparkline.tsx`**

```tsx
interface Props {
  values: number[]
  width?: number
  height?: number
}

export default function Sparkline({ values, width = 120, height = 28 }: Props) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * width},${height - 2 - ((v - min) / span) * (height - 4)}`)
    .join(' ')
  return (
    <svg width={width} height={height} aria-hidden className="text-accent">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
```

- [ ] **Step 5: Verify and commit**

`npm test`, `npx tsc -b --force`, `npm run build`.

```bash
git add -A
git commit -m "feat(ui): component kit II — data table, confirm, toasts, sparkline"
```

---

### Task 4: The shell — sidebar, bottom bar, screen headers

**Files:**
- Create: `src/ui/icons.tsx`, `src/ui/Shell.tsx`, `src/ui/ScreenHeader.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: kit + `ThemeToggle`
- Produces:
  - `icons.tsx`: `Icon` components `HomeIcon, SquadIcon, TableIcon, FixturesIcon, CupIcon, StatsIcon, TransfersIcon, FinanceIcon, HistoryIcon, SavesIcon` — all `({ className? })`, 16×16 stroke SVGs
  - `Shell({ screen, onNavigate, state, advanceLabel, onAdvance, children })` with `screen: ScreenId`, `onNavigate: (s: ScreenId) => void`; exports `type ScreenId = 'home' | 'squad' | 'table' | 'fixtures' | 'cup' | 'stats' | 'transfers' | 'finance' | 'history' | 'saves'` and `NAV: { id: ScreenId; label: string; icon: FC }[]`
  - `ScreenHeader({ label, title, actions? })`
  - `App` renders everything inside `Shell` except the replay/sacked takeovers; `screen` state starts at `'home'` (placeholder paragraph until Task 5)

- [ ] **Step 1: Create `src/ui/icons.tsx`**

All icons share the wrapper; keep geometry minimal (stroke, round caps):

```tsx
import type { ReactNode } from 'react'

function Icon({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden
    >
      {children}
    </svg>
  )
}

export const HomeIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></Icon>
)
export const SquadIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21 20c0-2.8-1.9-5.1-4.5-5.8" /></Icon>
)
export const TableIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M4 6h16M4 12h16M4 18h10" /></Icon>
)
export const FixturesIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4m8-4v4M4 11h16" /></Icon>
)
export const CupIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4M12 13v4m-3 4h6m-3-4v4" /></Icon>
)
export const StatsIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M5 20V12m7 8V6m7 14v-5" /></Icon>
)
export const TransfersIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M4 8h13m0 0-3-3m3 3-3 3M20 16H7m0 0 3-3m-3 3 3 3" /></Icon>
)
export const FinanceIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M3 11h18" /><circle cx="12" cy="15" r="1.5" /></Icon>
)
export const HistoryIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" /><path d="M9 8h6M9 12h6" /></Icon>
)
export const SavesIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M5 4h11l3 3v13H5V4Z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></Icon>
)
export const MoreIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Icon>
)
```

- [ ] **Step 2: Create `src/ui/ScreenHeader.tsx`**

```tsx
import type { ReactNode } from 'react'
import SectionLabel from './SectionLabel'

export default function ScreenHeader({ label, title, actions }: { label: string; title: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <SectionLabel>{label}</SectionLabel>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
```

- [ ] **Step 3: Create `src/ui/Shell.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { FC, ReactNode } from 'react'
import type { GameState } from '../engine/types'
import { totalRounds } from '../engine/season'
import Button from './Button'
import MoneyText from './MoneyText'
import ThemeToggle from './ThemeToggle'
import {
  CupIcon, FinanceIcon, FixturesIcon, HistoryIcon, HomeIcon, MoreIcon,
  SavesIcon, SquadIcon, StatsIcon, TableIcon, TransfersIcon,
} from './icons'

export type ScreenId =
  | 'home' | 'squad' | 'table' | 'fixtures' | 'cup'
  | 'stats' | 'transfers' | 'finance' | 'history' | 'saves'

export const NAV: { id: ScreenId; label: string; icon: FC<{ className?: string }> }[] = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'squad', label: 'Squad', icon: SquadIcon },
  { id: 'table', label: 'Table', icon: TableIcon },
  { id: 'fixtures', label: 'Fixtures', icon: FixturesIcon },
  { id: 'cup', label: 'Cup', icon: CupIcon },
  { id: 'stats', label: 'Stats', icon: StatsIcon },
  { id: 'transfers', label: 'Transfers', icon: TransfersIcon },
  { id: 'finance', label: 'Finance', icon: FinanceIcon },
  { id: 'history', label: 'History', icon: HistoryIcon },
  { id: 'saves', label: 'Saves', icon: SavesIcon },
]

const MOBILE_PRIMARY: ScreenId[] = ['home', 'squad', 'table', 'finance']

interface Props {
  screen: ScreenId
  onNavigate: (s: ScreenId) => void
  state: GameState
  advanceLabel: string
  onAdvance: () => void
  children: ReactNode
}

function attentionFor(id: ScreenId, state: GameState): boolean {
  if (id === 'transfers') return state.incomingOffers.length > 0
  if (id === 'finance') return state.brokeRounds > 0
  return false
}

export default function Shell({ screen, onNavigate, state, advanceLabel, onAdvance, children }: Props) {
  const [moreOpen, setMoreOpen] = useState(false)
  const user = state.teams.find(t => t.id === state.userTeamId)!
  const week = Math.min(state.round, totalRounds(state))

  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moreOpen])

  const navigate = (id: ScreenId) => {
    setMoreOpen(false)
    onNavigate(id)
  }

  return (
    <div className="min-h-dvh md:flex">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-52 flex-col border-r border-rule bg-surface-raised p-3 md:flex">
        <div className="px-2 py-1 font-mono text-sm font-bold tracking-tight">FUT_</div>
        <nav className="mt-4 flex flex-1 flex-col gap-0.5" aria-label="Sections">
          {NAV.map(({ id, label, icon: NavIcon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              aria-current={screen === id ? 'page' : undefined}
              className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-accent ${
                screen === id ? 'bg-rule/60 font-medium text-ink' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <NavIcon />
              {label}
              {attentionFor(id, state) && <span aria-label="needs attention" className="ml-auto size-1.5 rounded-full bg-accent" />}
            </button>
          ))}
        </nav>
        <div className="mt-4 border-t border-rule pt-3 text-sm">
          <div className="flex items-center justify-between gap-2 px-2">
            <div className="min-w-0">
              <div className="truncate font-medium">{user.name}</div>
              <div className="font-mono text-xs tabular-nums text-ink-muted">
                <MoneyText amount={user.cash} size="sm" /> · S{state.season} W{week}
              </div>
            </div>
            <ThemeToggle />
          </div>
          <Button variant="primary" className="mt-3 w-full" onClick={onAdvance}>
            {advanceLabel}
          </Button>
        </div>
      </aside>

      {/* content */}
      <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-6 md:ml-52 md:pb-10">
        {/* mobile vitals line */}
        <div className="mb-4 flex items-center justify-between text-xs text-ink-muted md:hidden">
          <span className="font-medium text-ink">{user.name}</span>
          <span className="font-mono tabular-nums">
            <MoneyText amount={user.cash} size="sm" /> · S{state.season} W{week}
          </span>
        </div>
        {children}
      </main>

      {/* mobile: floating advance + bottom bar */}
      <div className="fixed bottom-16 right-4 z-40 md:hidden">
        <Button variant="primary" onClick={onAdvance}>{advanceLabel}</Button>
      </div>
      <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-rule bg-surface-raised md:hidden">
        {MOBILE_PRIMARY.map(id => {
          const item = NAV.find(n => n.id === id)!
          const NavIcon = item.icon
          return (
            <button
              key={id}
              onClick={() => navigate(id)}
              aria-current={screen === id ? 'page' : undefined}
              className={`relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] ${
                screen === id ? 'text-ink' : 'text-ink-muted'
              }`}
            >
              <NavIcon />
              {item.label}
              {attentionFor(id, state) && <span className="absolute right-1/4 top-1.5 size-1.5 rounded-full bg-accent" />}
            </button>
          )
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] ${
            MOBILE_PRIMARY.includes(screen) ? 'text-ink-muted' : 'text-ink'
          }`}
        >
          <MoreIcon />
          More
        </button>
      </nav>

      {/* mobile more-sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="More sections">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setMoreOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-xl border-t border-rule bg-surface p-4">
            <div className="grid grid-cols-3 gap-2">
              {NAV.filter(n => !MOBILE_PRIMARY.includes(n.id)).map(({ id, label, icon: NavIcon }) => (
                <button
                  key={id}
                  onClick={() => navigate(id)}
                  className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-rule bg-surface-raised text-xs"
                >
                  <NavIcon />
                  {label}
                </button>
              ))}
              <div className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-rule bg-surface-raised text-xs">
                <ThemeToggle />
                Theme
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Rewire `src/App.tsx`**

Full replacement (behavioral logic — load/save, advance with replay lookup, takeovers, gameOver — is IDENTICAL to the current file; only the frame changes):

```tsx
import { useEffect, useState } from 'react'
import { cupWinner } from './engine/cup'
import { newGame } from './engine/newGame'
import { load, save } from './engine/save'
import { advanceRound, newSeason, totalRounds } from './engine/season'
import { standings } from './engine/standings'
import type { GameState } from './engine/types'
import Button from './ui/Button'
import Shell from './ui/Shell'
import type { ScreenId } from './ui/Shell'
import { ToastProvider } from './ui/Toast'
import CupScreen from './screens/CupScreen'
import FinanceScreen from './screens/FinanceScreen'
import FixturesScreen from './screens/FixturesScreen'
import HistoryScreen from './screens/HistoryScreen'
import MatchScreen from './screens/MatchScreen'
import type { MatchLike } from './screens/MatchScreen'
import SavesScreen from './screens/SavesScreen'
import SquadScreen from './screens/SquadScreen'
import StatsScreen from './screens/StatsScreen'
import TableScreen from './screens/TableScreen'
import TransfersScreen from './screens/TransfersScreen'

export default function App() {
  const [state, setState] = useState<GameState>(() => load() ?? newGame(Date.now() % 2147483647))
  const [screen, setScreen] = useState<ScreenId>('home')
  const [replay, setReplay] = useState<MatchLike | null>(null)
  useEffect(() => { save(state) }, [state])

  const userTeam = state.teams.find(t => t.id === state.userTeamId)!
  const total = totalRounds(state)
  const seasonOver = state.round > total

  const advance = () => {
    if (seasonOver) {
      setState(newSeason)
      return
    }
    const next = advanceRound(state)
    const mine = (f: { homeId: number; awayId: number }) =>
      f.homeId === state.userTeamId || f.awayId === state.userTeamId
    const played =
      next.fixtures.find(f => f.round === state.round && mine(f)) ??
      next.cupFixtures.find(f => f.week === state.round && mine(f)) ??
      null
    setState(next)
    setReplay(played)
  }

  if (replay) {
    return <MatchScreen fixture={replay} state={state} onClose={() => setReplay(null)} />
  }

  if (state.gameOver) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="font-mono text-4xl font-bold">Sacked!</h1>
        <p className="max-w-md text-ink-muted">
          {userTeam.name} spent too long in the red. The board has shown you the door
          after {state.season} season{state.season > 1 ? 's' : ''}.
        </p>
        <Button variant="primary" onClick={() => setState(newGame(Date.now() % 2147483647))}>
          Start a new career
        </Button>
      </div>
    )
  }

  const champion = seasonOver
    ? state.teams.find(t => t.id === standings(state, userTeam.division)[0].teamId)!
    : null
  const cupChampId = seasonOver ? cupWinner(state) : null
  const expiringCount = seasonOver
    ? userTeam.playerIds.filter(id => state.players[id].contractSeasons <= 1).length
    : 0

  return (
    <ToastProvider>
      <Shell
        screen={screen}
        onNavigate={setScreen}
        state={state}
        advanceLabel={seasonOver ? 'New Season' : 'Advance Week'}
        onAdvance={advance}
      >
        {champion && (
          <div className="mb-4 rounded-lg border border-accent/40 bg-surface-raised px-4 py-3 text-sm">
            🏆 {champion.name} are the Division {userTeam.division} champions!
            {cupChampId !== null && <> · 🏆 {state.teams.find(t => t.id === cupChampId)!.name} win the Cup!</>}
            {expiringCount > 0 && (
              <> · ⚠ {expiringCount} contract{expiringCount > 1 ? 's' : ''} expire — unrenewed players leave
              (cheapest are kept automatically if the squad would drop below 14)</>
            )}
          </div>
        )}
        {screen === 'home' && <p className="text-ink-muted">Home dashboard coming next.</p>}
        {screen === 'squad' && <SquadScreen state={state} setState={setState} />}
        {screen === 'table' && <TableScreen key={state.season} state={state} />}
        {screen === 'fixtures' && <FixturesScreen key={state.season} state={state} />}
        {screen === 'cup' && <CupScreen key={state.season} state={state} />}
        {screen === 'stats' && <StatsScreen state={state} />}
        {screen === 'transfers' && <TransfersScreen state={state} setState={setState} />}
        {screen === 'finance' && <FinanceScreen state={state} setState={setState} />}
        {screen === 'history' && <HistoryScreen state={state} />}
        {screen === 'saves' && <SavesScreen state={state} setState={setState} />}
      </Shell>
    </ToastProvider>
  )
}
```

(The old `<header>`, `<nav>`, and the New Season button all disappear — advance/new-season is the shell's primary button. Note `seasonOver` short-circuits `advance()` into `newSeason`.)

- [ ] **Step 5: Verify**

`npm test`, `npx tsc -b --force`, `npm run build`; `npm run dev` at 1280px and 390px in both themes: sidebar/bottom-bar navigation works across all screens (still legacy-styled inside), vitals + Advance reachable everywhere, More-sheet opens/closes (Escape + backdrop), no legacy top nav remains.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): sidebar shell, mobile bottom bar, screen scaffolding"
```

---

### Task 5: Home command center + toast plumbing

**Files:**
- Create: `src/screens/HomeScreen.tsx`, `src/ui/toastEvents.ts`
- Modify: `src/App.tsx` (replace the home placeholder; wire toasts into `advance`)

**Interfaces:**
- Consumes: kit, `useToasts`
- Produces:
  - `detectToasts(prev: GameState, next: GameState): ToastInput[]` — pure; rules below
  - `HomeScreen({ state, onAdvance, onNavigate })` — the dashboard

- [ ] **Step 1: Create `src/ui/toastEvents.ts`**

```ts
import type { GameState } from '../engine/types'
import type { ToastInput } from './Toast'

// Pure diff of two consecutive states → toast-worthy news, max 3.
export function detectToasts(prev: GameState, next: GameState): ToastInput[] {
  const out: ToastInput[] = []

  const known = new Set(prev.incomingOffers.map(o => `${o.playerId}:${o.bidderTeamId}`))
  for (const o of next.incomingOffers) {
    if (known.has(`${o.playerId}:${o.bidderTeamId}`)) continue
    const player = next.players[o.playerId]
    const bidder = next.teams.find(t => t.id === o.bidderTeamId)
    if (player && bidder) {
      out.push({ tone: 'accent', text: `${bidder.name} offer $${o.amount.toLocaleString('en-US')} for ${player.name}` })
    }
  }

  const fresh = next.finances.slice(prev.finances.length)
  for (const e of fresh) {
    if (e.label.startsWith('Sold ') || e.label.startsWith('Signed ') || e.label.startsWith('Stadium expansion complete')) {
      out.push({
        tone: 'accent',
        text: e.amount === 0 ? e.label : `${e.label}: ${e.amount > 0 ? '+' : '-'}$${Math.abs(e.amount).toLocaleString('en-US')}`,
      })
    }
  }

  if (next.brokeRounds >= 6 && next.brokeRounds > prev.brokeRounds) {
    out.push({ tone: 'danger', text: `Board patience running out: ${next.brokeRounds}/8 weeks in the red` })
  }

  return out.slice(0, 3)
}
```

(`next.finances.slice(prev.finances.length)` is safe because the ledger is append-only within a week and capped at 300 — when the cap trims, `fresh` may include a few re-indexed old entries once; harmless for toasts.)

- [ ] **Step 2: Create `src/screens/HomeScreen.tsx`**

```tsx
import { totalRounds } from '../engine/season'
import { standings } from '../engine/standings'
import type { GameState } from '../engine/types'
import Button from '../ui/Button'
import DataTable from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import MoneyText from '../ui/MoneyText'
import Panel from '../ui/Panel'
import ScreenHeader from '../ui/ScreenHeader'
import type { ScreenId } from '../ui/Shell'
import Sparkline from '../ui/Sparkline'

interface Props {
  state: GameState
  onAdvance: () => void
  onNavigate: (s: ScreenId) => void
}

interface Row { pos: number; teamId: number; name: string; points: number; gd: number }

export default function HomeScreen({ state, onAdvance, onNavigate }: Props) {
  const user = state.teams.find(t => t.id === state.userTeamId)!
  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  const total = totalRounds(state)
  const week = state.round
  const seasonOver = week > total

  // next match: league or cup, this week
  const mine = (f: { homeId: number; awayId: number }) => f.homeId === user.id || f.awayId === user.id
  const league = state.fixtures.find(f => f.round === week && mine(f))
  const cup = state.cupFixtures.find(f => f.week === week && f.winnerId === null && mine(f))
  const nextMatch = league ?? cup
  const isHome = nextMatch?.homeId === user.id
  const opponentId = nextMatch ? (isHome ? nextMatch.awayId : nextMatch.homeId) : null

  // table excerpt: 5 rows centered on the user
  const table = standings(state, user.division)
  const myIndex = table.findIndex(r => r.teamId === user.id)
  const from = Math.max(0, Math.min(myIndex - 2, table.length - 5))
  const excerpt: Row[] = table.slice(from, from + 5).map((r, i) => ({
    pos: from + i + 1, teamId: r.teamId, name: name(r.teamId), points: r.points, gd: r.goalsFor - r.goalsAgainst,
  }))
  const excerptColumns: Column<Row>[] = [
    { key: 'pos', label: '#', mono: true, render: r => r.pos },
    { key: 'team', label: 'Team', render: r => r.name },
    { key: 'gd', label: 'GD', align: 'right', mono: true, render: r => (r.gd > 0 ? `+${r.gd}` : r.gd) },
    { key: 'pts', label: 'Pts', align: 'right', mono: true, render: r => <strong>{r.points}</strong> },
  ]

  // money: sparkline over running balance of recent ledger, delta of this week's entries
  const recent = state.finances.slice(-20)
  let running = user.cash - recent.reduce((s, e) => s + e.amount, 0)
  const balances = recent.map(e => (running += e.amount))
  const lastWeekPlayed = week - 1
  const weekDelta = state.finances
    .filter(e => e.season === state.season && e.round === lastWeekPlayed)
    .reduce((s, e) => s + e.amount, 0)

  // attention items
  const expiring = user.playerIds.filter(id => state.players[id].contractSeasons <= 1).length
  const attention: { text: string; screen: ScreenId; tone?: 'warn' | 'danger' }[] = []
  if (state.incomingOffers.length > 0) {
    const best = Math.max(...state.incomingOffers.map(o => o.amount))
    attention.push({ text: `${state.incomingOffers.length} offer${state.incomingOffers.length > 1 ? 's' : ''} on the table (best $${best.toLocaleString('en-US')})`, screen: 'transfers' })
  }
  if (expiring > 0) attention.push({ text: `${expiring} contract${expiring > 1 ? 's' : ''} expiring`, screen: 'squad', tone: 'warn' })
  if (state.construction) attention.push({ text: `Stadium expansion ready in ${state.construction.weeksLeft}w`, screen: 'finance' })
  if (state.brokeRounds > 0) attention.push({ text: `Board patience ${state.brokeRounds}/8`, screen: 'finance', tone: state.brokeRounds >= 6 ? 'danger' : 'warn' })
  if (cup) attention.push({ text: 'Cup tie this week', screen: 'cup' })

  return (
    <div>
      <ScreenHeader label={`Season ${state.season} · Week ${Math.min(week, total)}/${total}`} title={user.name} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel label={seasonOver ? 'Season complete' : 'Next match'}>
          {seasonOver ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink-muted">The season is over — start the next one when ready.</p>
              <Button variant="primary" onClick={onAdvance}>New Season</Button>
            </div>
          ) : nextMatch ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-medium">{opponentId !== null && name(opponentId)}</div>
                <div className="mt-0.5 text-xs text-ink-muted">
                  {isHome ? 'Home' : 'Away'} · {league ? `League · Week ${week}` : `Cup · Round ${cup!.cupRound}`}
                </div>
              </div>
              <Button variant="primary" onClick={onAdvance}>Advance Week</Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink-muted">
                Free week{state.playFriendlies ? ' — a friendly will be arranged' : ''}.
              </p>
              <Button variant="primary" onClick={onAdvance}>Advance Week</Button>
            </div>
          )}
        </Panel>

        <Panel label="Money" action={<button className="text-xs text-ink-muted hover:text-ink" onClick={() => onNavigate('finance')}>Finance →</button>}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <MoneyText amount={user.cash} size="lg" />
              <div className="mt-1 text-xs text-ink-muted">
                This week: <MoneyText amount={weekDelta} size="sm" signed />
              </div>
            </div>
            <Sparkline values={balances} />
          </div>
        </Panel>

        <Panel label={`Division ${user.division}`} action={<button className="text-xs text-ink-muted hover:text-ink" onClick={() => onNavigate('table')}>Full table →</button>}>
          <DataTable
            columns={excerptColumns}
            rows={excerpt}
            rowKey={r => r.teamId}
            rowAccent={r => (r.teamId === user.id ? 'user' : null)}
          />
        </Panel>

        <Panel label="Club">
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">Fan mood</span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-rule">
                  <div className="h-full bg-accent" style={{ width: `${user.fanMood}%` }} />
                </div>
                <span className="font-mono text-xs tabular-nums">{user.fanMood}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">Stadium</span>
              <span className="font-mono text-xs tabular-nums">{user.capacity.toLocaleString('en-US')} seats</span>
            </div>
            {attention.length > 0 ? (
              <ul className="mt-1 flex flex-col gap-1.5 border-t border-rule pt-3">
                {attention.map((a, i) => (
                  <li key={i}>
                    <button
                      onClick={() => onNavigate(a.screen)}
                      className={`text-left text-sm underline-offset-2 hover:underline ${
                        a.tone === 'danger' ? 'text-danger' : a.tone === 'warn' ? 'text-warn' : 'text-ink'
                      }`}
                    >
                      {a.text} →
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="border-t border-rule pt-3 text-xs text-ink-faint">All quiet at the club.</div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire into App**

In `src/App.tsx`: replace the home placeholder with

```tsx
        {screen === 'home' && <HomeScreen state={state} onAdvance={advance} onNavigate={setScreen} />}
```

and wire toasts into `advance` — App's body becomes a child of `ToastProvider`, so split App: keep `App` as the provider wrapper and move everything else into an inner `Game` component that can call `useToasts()`:

```tsx
export default function App() {
  return (
    <ToastProvider>
      <Game />
    </ToastProvider>
  )
}

function Game() {
  const { push } = useToasts()
  // ...everything App previously did...
  const advance = () => {
    if (seasonOver) {
      setState(newSeason)
      return
    }
    const next = advanceRound(state)
    for (const t of detectToasts(state, next)) push(t)
    // ...replay lookup + setState/setReplay exactly as before...
  }
  // ...
}
```

with `import { ToastProvider, useToasts } from './ui/Toast'` and `import { detectToasts } from './ui/toastEvents'` and `import HomeScreen from './screens/HomeScreen'`.

- [ ] **Step 4: Verify**

`npm test`, `npx tsc -b --force`, `npm run build`; dev at both widths/themes: Home shows next match, table excerpt with green spine, money + sparkline, mood meter, attention list linking through; advancing fires toasts when an offer arrives or a sale lands (play a few weeks with a listed player to observe one).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): home command center and event toasts"
```

---

Tasks 6–10 are migrations. They share one contract, stated once here and binding for all five:

**Migration contract.** Keep every engine import, every `setState` updater, every piece of behavioral logic EXACTLY as it is — move markup only. Replace `<table>` with `DataTable` column defs, panels with `Panel`, buttons with `Button`/`ConfirmButton`, money strings with `MoneyText`, status text with `Badge`, headers with `ScreenHeader`. All numbers via `mono: true` columns or `MoneyText`. Keep the components' existing prop signatures so `App.tsx` is untouched. Verify each migrated screen at 1280px + 390px in both themes; suite + tsc + build green; commit per task.

### Task 6: Migrate Table + Stats

**Files:**
- Modify: `src/screens/TableScreen.tsx`, `src/screens/StatsScreen.tsx`

**TableScreen.** `ScreenHeader label={`DIVISION ${division}`} title="League Table"` with the division `<select>` (styled: `rounded-md border border-rule bg-surface-raised px-2 py-1.5 text-sm`) as `actions`. One `DataTable` with columns:

| key | label | align | mono | hideOnMobile | render |
|---|---|---|---|---|---|
| pos | # | left | ✓ | | index+1 (precompute into row objects) |
| team | Team | left | | | name |
| p | P | right | ✓ | ✓ | played |
| w | W | right | ✓ | ✓ | won |
| d | D | right | ✓ | ✓ | drawn |
| l | L | right | ✓ | ✓ | lost |
| gf | GF | right | ✓ | ✓ | goalsFor |
| ga | GA | right | ✓ | ✓ | goalsAgainst |
| gd | GD | right | ✓ | | signed diff |
| pts | Pts | right | ✓ | | `<strong>` points |

`rowAccent`: `'user'` for the user's club; `'up'` for positions 1–3 when the division has a division below it (promotion zone; in division 1 the top-3 spine marks the title race — keep it); `'down'` for positions 14–16 when a division above exists... — precise rule: promotion spine (`'up'`) for top 3 in divisions 2–3; relegation spine (`'down'`) for bottom 3 in divisions 1–2; `'user'` wins any overlap. Map row → accent in the screen, not in the kit.

**StatsScreen.** Two `Panel`s ("This season" / "All-time") each holding a `DataTable`: rank (mono) · Player · Club · Goals (right, mono, strong). `EmptyState` texts unchanged from the current screen.

Commit: `git commit -m "feat(ui): migrate table and stats screens"`

---

### Task 7: Migrate Fixtures + Cup

**Files:**
- Modify: `src/screens/FixturesScreen.tsx`, `src/screens/CupScreen.tsx`

**FixturesScreen.** Header: `label="CALENDAR" title="Fixtures"`, actions = division select + week segmented control (`‹` ghost sm button · `Week N` mono text · `›` ghost sm button). Fixture list is NOT a DataTable (it's a scoreline list): each fixture renders as a row `grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border border-rule bg-surface-raised px-3 py-2` — home name right-aligned, center score in mono (`vs` muted when unplayed), away name left; the user's fixtures get the green spine class from DataTable's recipe (`shadow-[inset_3px_0_0_0_var(--accent)]`). Played rows are buttons that toggle an inline report below the row: the report reuses the event-feed markup defined in Task 11's `EventFeed` — until Task 11 lands, keep the current `<ul className="ticker">` markup for the report (Task 11 swaps it). Cup-week empty state: `EmptyState` with "Cup week — see the Cup tab." and a ghost Button linking via a new optional `onGoToCup?: () => void` prop... — NO: App must stay untouched; instead render the text without a link (the bottom nav is one tap away). Keep the `key={state.season}` remount behavior (it's set in App).

**CupScreen.** Header `label="NATIONAL CUP" title="Cup"`. Each round = `SectionLabel` (`ROUND 1 — WEEK 4` style) + the same fixture-row markup as FixturesScreen (extract a tiny local `TieRow` inside CupScreen; do NOT share a file between screens — duplication of 15 lines beats a premature shared module, and Task 11's EventFeed unifies the report side). `(p)` marker mono muted after the score; winner column: `Badge tone="accent"` with "through" on the winner side, loser name in `text-ink-faint`. Champion banner: `Panel` with 🏆 + `text-lg font-semibold`. Report expansion identical pattern to FixturesScreen.

Commit: `git commit -m "feat(ui): migrate fixtures and cup screens"`

---

### Task 8: Migrate Squad (flagship)

**Files:**
- Modify: `src/screens/SquadScreen.tsx`

Header: `label={`${FORMATIONS ? '' : ''}SQUAD OF ${teamName}`}`— plainly: `label="SQUAD" title={team.name}`; actions = formation/tactic/training selects (styled like Table's) + Auto-pick ghost Button + friendlies switch: a `<label>` wrapping a visually-styled checkbox (`accent-accent size-4` is acceptable native styling) + "Friendlies".

One `DataTable` with `groupLabel: p => p.position` (rows pre-sorted GK→DF→MF→FW as today, so groups emit once) and columns:

| key | label | mono | hideOnMobile | render |
|---|---|---|---|---|
| name | Name | | | name + (starting ? `Badge tone="accent"` "XI" : null) inline |
| age | Age | ✓ | ✓ | age |
| level | Lvl | ✓ | | `<strong>` level |
| form | Form | ✓ | ✓ | `▲n` accent / `▼n` danger / `–` faint |
| fit | Fit | ✓ | ✓ | `{fitness}%`, `text-warn` when < 70 |
| status | Status | | | `Badge`: injured → danger "Injured · Nw"; suspended → warn "Banned · Nw"; else yellows → muted "🟨×n" as "Cards · n"; else null |
| salary | Salary | ✓ | ✓ | `MoneyText size="sm"` + `/wk` faint |
| contract | Contract | ✓ | ✓ | `{n}y`, `text-warn` when ≤ 1 |
| value | Value | ✓ | ✓ | `MoneyText size="sm"` |
| actions | | | | see below |

Actions cell (desktop; on mobile DataTable shows it via the card's dl — acceptable, buttons wrap): keep the EXACT current three-mode state machine (`selling`/`confirmRelease`/default) and engine calls, restyled: Start = ghost sm Button (disabled logic unchanged); Sell opens the inline price `<input>` (mono, `w-24 rounded-md border border-rule bg-surface px-2 py-1 text-xs`) + primary sm List + ghost sm ✕ (`aria-label="Cancel"`); Release/Confirm becomes `ConfirmButton label="Release" confirmLabel={`Confirm ${formatMoney(-severanceFor(p))}`}`; Renew = ghost sm Button showing `renewalSalary`. Note `ConfirmButton` replaces the manual `confirmRelease` state — delete that state variable; keep `selling`/`askingPrice`.

Commit: `git commit -m "feat(ui): migrate squad screen"`

---

### Task 9: Migrate Transfers

**Files:**
- Modify: `src/screens/TransfersScreen.tsx`

Header: `label="MARKET" title="Transfers"`, actions = `StatChip`-style cash display — simpler: a `MoneyText` line "Your cash" in the header actions.

**Offers section.** `Panel label="Offers for your players"`. Each offer: a row with `Badge tone="accent"` dot + `{bidder} offer <MoneyText> for {player} (POS LVL)` + `expires in Nw` faint + buttons: Accept (primary sm) · Counter (ghost sm, label unchanged) · Reject (`ConfirmButton` label "Reject" confirm "Confirm reject"? — NO: rejection is low-stakes and reversible-ish; keep a plain danger-ghost… use ghost sm with `text-danger`). `EmptyState`: "No offers on the table."

**Listings.** `Panel label="Transfer list"` holding a `DataTable`:

| key | label | mono | hideOnMobile | render |
|---|---|---|---|---|
| player | Player | | | name |
| pos | Pos | | ✓ | position |
| lvl | Lvl | ✓ | | level |
| age | Age | ✓ | ✓ | age |
| seller | Seller | | ✓ | seller name |
| min | Min | ✓ | ✓ | MoneyText sm |
| bid | Top bid | ✓ | | `—` faint, or MoneyText sm + bidder name faint |
| ends | Ends | ✓ | | `{n}w` |
| action | | | | mine → Badge muted "your listing"; leading → Badge accent "you lead"; else bid input (mono, defaulting `requiredBid`) + Bid primary sm (disabled rule unchanged) |

`rowAccent`: `'user'` when `sellerTeamId === userTeamId`. Empty: `EmptyState` "Nobody is for sale this week."

Commit: `git commit -m "feat(ui): migrate transfers screen"`

---

### Task 10: Migrate Finance + History + Saves

**Files:**
- Modify: `src/screens/FinanceScreen.tsx`, `src/screens/HistoryScreen.tsx`, `src/screens/SavesScreen.tsx`

**FinanceScreen.** Header `label="THE BOOKS" title="Finance"`. Top: `grid grid-cols-2 gap-3 md:grid-cols-4` of `StatChip`s — Cash (`MoneyText` value) · Weekly wages · Loan (hint: `cap $2,000,000`) · Board patience (only when `brokeRounds > 0`; value `{n}/8`, red text via wrapping the value in a span when ≥6 — StatChip takes ReactNode). Loan controls: ghost Buttons (Borrow/Repay $100k, disabled rules unchanged). Stadium `Panel label="Stadium"`: capacity + mood meter (reuse Home's meter markup) + maintenance line; ticket price `<input type="number">` styled like Squad's; Expand primary Button ↔ construction countdown text (unchanged logic; expansion is already gated by `expandStadium`'s no-op so a ConfirmButton is optional — keep plain Button). Ledger: `Panel label="Ledger"` with a `DataTable` of the last 50 entries — but grouped: `groupLabel: e => `S${e.season} · W${e.round}`` on the reversed list; columns Item · Amount (`MoneyText signed`, right). Delete the old `td.neg/td.pos` reliance.

**HistoryScreen.** Header `label="THE LONG GAME" title="History"`. Honours: two `StatChip`s (D1 titles · Cups). Seasons `DataTable`: Season (mono) · D1 champions · Cup winners · Top scorer (`{player} ({goals}) — {team}`) · Your finish (`Div {d} · P{p}`, mono). EmptyState text unchanged.

**SavesScreen.** Header `label="CAREERS" title="Saves"`. Three slot `Panel`s (label `SLOT {n}` + `Badge tone="accent"` "active" when active): career line (`{team} — Season {s}, Division {d}, <MoneyText>`) or `EmptyState` "empty"; actions: Save here (ghost) · Load (primary, same visibility rule) · Delete (`ConfirmButton` — replaces the manual confirmDelete state). Backup `Panel`: Export (ghost) + Import (ghost) + hidden file input (logic unchanged); the import error banner becomes a `useToasts().push({ tone: 'danger', text: 'That file is not a valid futscript save.' })` — delete the `importError` state.

Commit: `git commit -m "feat(ui): migrate finance, history, and saves screens"`

---

### Task 11: The moments — match ticker, sacked, champion

**Files:**
- Create: `src/ui/EventFeed.tsx`
- Modify: `src/screens/MatchScreen.tsx`, `src/screens/FixturesScreen.tsx`, `src/screens/CupScreen.tsx`, `src/App.tsx` (sacked block + champion banner only)

**`EventFeed({ events, state, emphasisTeamId? })`** — shared by ticker and reports. Renders `<ol>` of events (as given; ticker passes newest-first): each row `flex items-baseline gap-2 border-b border-rule/60 py-1.5 text-sm` — minute (mono, w-8, faint) · icon per type (goal: `●` in accent when `teamId === emphasisTeamId` else ink; chance: `○` faint; yellow: 8px amber square; red: 8px red square; injury: `+` danger bold) · `eventText(e, state)` (function moves INTO EventFeed.tsx and is re-exported from MatchScreen for compatibility — simpler: move `eventText` to EventFeed.tsx, update the two report call sites, keep MatchScreen re-exporting `export { eventText } from '../ui/EventFeed'`) · team name faint. Rows not involving `emphasisTeamId` get `text-ink-muted`.

**MatchScreen rewrite** (public contract unchanged: `{ fixture: MatchLike, state, onClose }` + `MatchLike` export):

```tsx
// layout skeleton (full-bleed, no shell):
<div className="flex min-h-dvh flex-col items-center px-4 pt-2">
  {/* minute progress: fixed-height 2px bar, width = minute/90 */}
  <div className="h-0.5 w-full max-w-lg overflow-hidden rounded-full bg-rule">
    <div className="h-full bg-accent transition-[width]" style={{ width: `${(minute / 90) * 100}%` }} />
  </div>
  <div className="mt-8 flex w-full max-w-lg items-center justify-between gap-4">
    {/* home name (font-medium, text-right) · scoreline (font-mono text-4xl font-bold tabular-nums) · away name */}
  </div>
  <div className="mt-1 font-mono text-sm tabular-nums text-ink-muted">{Math.min(minute, 90)}'</div>
  {/* speed controls while minute < 90: 1× / 2× ghost sm buttons (aria-pressed) + Skip ghost sm; after 90: Continue primary */}
  <div className="mt-6 w-full max-w-lg flex-1 overflow-y-auto">
    <EventFeed events={visibleEventsNewestFirst} state={state} emphasisTeamId={userInvolved ? state.userTeamId : undefined} />
  </div>
</div>
```

Behavior: interval starts at 65ms; `2×` halves it to 32ms (state `speed: 1 | 2`, effect deps `[speed]`); Skip → minute 90. `prefers-reduced-motion` (via `matchMedia('(prefers-reduced-motion: reduce)').matches`, read once): start at minute 90 with the full feed and Continue shown. Score derives from visible events exactly as today. Penalty note: when `fixture` has `winnerId` set and a drawn score at minute ≥ 90 show `({name(winnerId)} win on penalties)` under the scoreline — `MatchLike` doesn't carry `winnerId`; extend `MatchLike` with `winnerId?: number | null` (App already passes whole fixtures, so cup ties carry it; league fixtures don't — undefined is fine).

**Reports** (Fixtures/Cup): swap the legacy `<ul className="ticker">` for `EventFeed events={selected.events ?? []} state={state}` (chronological as stored).

**Sacked screen** (App): keep Task 4's version, add `SectionLabel` "THE BOARD HAS DECIDED" above the mono headline. **Champion banner** (App): restyle to `Panel` with a `border-accent/40` — a proper moment: trophy line `text-lg font-semibold`, details `text-sm text-ink-muted`. (Full-bleed championship takeover is deliberately NOT built — the banner-in-shell is the minimalist call; note this deviation from the spec's "full-bleed moments" for the champion case in the task report.)

Verify: watch a full ticker at 1× and 2×, skip mid-match, reduced-motion (OS setting or devtools emulation) renders final state instantly; reports render with the new feed; penalties note appears on a drawn cup tie.

Commit: `git commit -m "feat(ui): match ticker, event feed, and season moments"`

---

### Task 12: Cleanup, a11y sweep, acceptance

**Files:**
- Modify: `src/index.css` (delete the legacy block), any stragglers found

- [ ] **Step 1: Delete legacy CSS**

Remove everything below the `── LEGACY` marker in `src/index.css`. Grep for the dead class names (`className="app"`, `"banner"`, `"ticker"`, `"controls"`, `"round-nav"`, `"user"`, `"starting"`, `"selected"`, `"report"`, `"home"`, `"actions"`, `"offer"`, `"minute"`, `"neg"`, `"pos"`) across `src/` — every hit must be either migrated to kit/tokens or (for `controls`-style layout divs) replaced with utility classes inline. Zero legacy class references remain.

- [ ] **Step 2: A11y sweep**

- Keyboard: Tab through Squad row actions, the More-sheet (Escape closes, focus returns to the More button — add focus return if missing), selects, ConfirmButtons.
- `aria-label` audit on every icon-only button (ThemeToggle, ✕ cancels, week ‹ ›).
- Contrast: check `text-ink-faint` on `bg-surface-raised` and `text-accent-strong` on both themes with a contrast checker; if any pair is < 4.5:1 for body-size text, darken/lighten the token (tokens only — one place).
- `prefers-reduced-motion`: toasts fade only (no translate) — wrap the keyframe transform in `motion-safe:` (already done) and verify.

- [ ] **Step 3: Acceptance**

- `npm test` (146), `npx tsc -b --force`, `npm run build`.
- Play flows at 1280px and 390px in light AND dark: advance weeks (ticker at both speeds), pick lineup + sell + renew on Squad, bid on Transfers, borrow + expand on Finance, browse Cup/History/Stats, save/load/export/import on Saves, verify Home attention list and toasts.
- Lighthouse (Chrome devtools) accessibility score ≥ 95 on Home, Squad, Finance (light theme, desktop).
- Fix what fails; do not tag until green.

- [ ] **Step 4: Tag**

```bash
git add -A
git commit -m "chore: ui redesign complete" --allow-empty
git tag ui-redesign
```
