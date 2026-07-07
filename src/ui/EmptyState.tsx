import type { ReactNode } from 'react'

export default function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-ink-faint">
      <div>{children}</div>
      {action}
    </div>
  )
}
