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
