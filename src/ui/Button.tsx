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
