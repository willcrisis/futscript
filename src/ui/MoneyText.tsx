interface Props {
  amount: number
  size?: 'sm' | 'md' | 'lg'
  signed?: boolean
}

const SIZES = { sm: 'text-xs', md: 'text-sm', lg: 'text-2xl font-semibold' }

export default function MoneyText({ amount, size = 'md', signed = false }: Props) {
  const abs = Math.abs(Math.round(amount)).toLocaleString('en-US')
  const text = amount < 0 ? `-$${abs}` : signed && amount > 0 ? `+$${abs}` : `$${abs}`
  const tone =
    amount < 0 ? 'text-danger' :
    signed && amount > 0 ? 'text-accent-strong' :
    signed && amount === 0 ? 'text-ink-faint' :
    'text-ink'
  return <span className={`font-mono tabular-nums ${SIZES[size]} ${tone}`}>{text}</span>
}
