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
      <div aria-live="polite" className="fixed left-1/2 top-3 z-50 flex w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2 md:bottom-4 md:left-auto md:right-4 md:top-auto md:translate-x-0 xl:right-[19rem]">
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
