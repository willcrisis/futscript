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
