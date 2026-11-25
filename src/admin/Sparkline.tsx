const WIDTH = 100
const HEIGHT = 24
const PADDING = 2

/** A small inline-SVG trend line for a fixed-length numeric series. No axes, no labels, no tooltip. */
export function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min

  const points = values.map((v, i) => {
    const x = values.length > 1 ? (i / (values.length - 1)) * WIDTH : WIDTH / 2
    // Flat line (max === min, including the single-value case) stays centered instead of dividing by zero.
    const y = range === 0 ? HEIGHT / 2 : HEIGHT - PADDING - ((v - min) / range) * (HEIGHT - PADDING * 2)
    return `${x},${y}`
  })

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-hidden="true"
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="var(--muted)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
