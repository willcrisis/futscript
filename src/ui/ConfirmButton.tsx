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
