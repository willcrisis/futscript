import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  label: string
  align?: 'left' | 'right'
  mono?: boolean
  hideOnMobile?: boolean
  /** Render as a full-width block below the mobile card's dl, instead of a dt/dd row. */
  fullWidthOnMobile?: boolean
  render: (row: T) => ReactNode
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  rowAccent?: (row: T) => 'user' | 'up' | 'down' | null
  /** Extra classes for a specific row (e.g. a highlight ring), layered on top of any spine. */
  rowClass?: (row: T) => string | undefined
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

export default function DataTable<T>({ columns, rows, rowKey, rowAccent, rowClass, onRowClick, groupLabel, empty }: Props<T>) {
  if (rows.length === 0 && empty) return <>{empty}</>
  const clickable = onRowClick !== undefined

  return (
    <>
      {/* desktop: hairline table */}
      <table className="hidden w-full border-collapse text-sm md:table">
        <thead>
          <tr className="sticky top-0 border-b border-rule bg-surface">
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
                className={`border-b border-rule/60 ${accent ? SPINE[accent] : ''} ${rowClass?.(row) ?? ''} ${clickable ? 'cursor-pointer hover:bg-surface-raised' : ''}`}
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
          const [first, ...others] = visible
          const rest = others.filter(c => !c.fullWidthOnMobile)
          const fullWidth = others.filter(c => c.fullWidthOnMobile)
          return [
            groupLabel && group !== prevGroup ? (
              <div key={`g-${group}`} className="pt-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">
                {group}
              </div>
            ) : null,
            <div
              key={rowKey(row)}
              onClick={clickable ? () => onRowClick(row) : undefined}
              className={`rounded-lg border border-rule bg-surface-raised p-3 ${accent ? SPINE[accent] : ''} ${rowClass?.(row) ?? ''} ${clickable ? 'cursor-pointer' : ''}`}
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
              {fullWidth.map(c => (
                <div key={c.key} className="mt-2 flex flex-wrap gap-1.5">{c.render(row)}</div>
              ))}
            </div>,
          ]
        })}
      </div>
    </>
  )
}
