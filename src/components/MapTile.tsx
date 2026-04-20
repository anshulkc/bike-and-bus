type Props = {
  width?: number
  height?: number
  className?: string
}

// Procedural map placeholder — grid roads + a polyline through bike → transit → walk.
// Uses theme tokens via currentColor + CSS variables for fills.
export function MapTile({ width = 402, height = 240, className }: Props) {
  const w = width
  const h = height
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={h}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      style={{ display: 'block', background: 'var(--bb-soft)' }}
      aria-hidden
    >
      <rect width={w} height={h} fill="var(--bb-soft)" />
      {/* "water" blob */}
      <path d={`M ${w - 120} ${h} Q ${w - 40} ${h - 70}, ${w} ${h - 140} L ${w} ${h} Z`} fill="var(--bb-line)" opacity="0.55" />
      {/* "park" */}
      <path d={`M 20 ${h - 40} Q 80 ${h - 110}, 150 ${h - 70} T 260 ${h - 30} L 20 ${h} Z`} fill="var(--bb-line)" opacity="0.7" />
      {/* grid roads (minor) */}
      {Array.from({ length: 7 }, (_, i) => (
        <line key={`v${i}`} x1={(i + 1) * (w / 8)} y1={0} x2={(i + 1) * (w / 8) - 30} y2={h} stroke="var(--bb-surface)" strokeWidth="1.4" />
      ))}
      {Array.from({ length: 5 }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={(i + 1) * (h / 6)} x2={w} y2={(i + 1) * (h / 6) - 10} stroke="var(--bb-surface)" strokeWidth="1.4" />
      ))}
      {/* major roads */}
      <path d={`M 0 ${h * 0.42} L ${w} ${h * 0.35}`} stroke="var(--bb-surface)" strokeWidth="7" />
      <path d={`M ${w * 0.28} 0 L ${w * 0.35} ${h}`} stroke="var(--bb-surface)" strokeWidth="5" />
      <path d={`M ${w * 0.74} 0 L ${w * 0.7} ${h}`} stroke="var(--bb-surface)" strokeWidth="5" />
      <path d={`M 0 ${h * 0.78} L ${w} ${h * 0.86}`} stroke="var(--bb-surface)" strokeWidth="6" />
      {/* route polylines */}
      <path d={`M 40 ${h * 0.78} L ${w * 0.28} ${h * 0.55} L ${w * 0.34} ${h * 0.38}`} stroke="var(--bb-fg)" strokeWidth="4" fill="none" strokeDasharray="2 6" strokeLinecap="round" />
      <path d={`M ${w * 0.34} ${h * 0.38} L ${w * 0.62} ${h * 0.34} L ${w * 0.72} ${h * 0.32}`} stroke="var(--bb-transit)" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d={`M ${w * 0.72} ${h * 0.32} L ${w * 0.82} ${h * 0.24}`} stroke="var(--bb-fg)" strokeWidth="3" fill="none" strokeDasharray="1 4" strokeLinecap="round" />
      {/* origin pin */}
      <circle cx={40} cy={h * 0.78} r="8" fill="var(--bb-fg)" />
      <circle cx={40} cy={h * 0.78} r="3" fill="var(--bb-bg)" />
      {/* board / alight stops */}
      <rect x={w * 0.34 - 6} y={h * 0.38 - 6} width="12" height="12" rx="2" fill="var(--bb-transit)" />
      <rect x={w * 0.72 - 6} y={h * 0.32 - 6} width="12" height="12" rx="2" fill="var(--bb-transit)" />
      {/* destination pin */}
      <g transform={`translate(${w * 0.82 - 8} ${h * 0.24 - 20})`}>
        <path d="M8 0a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z" fill="var(--bb-fg)" />
        <circle cx="8" cy="7" r="2.5" fill="var(--bb-bg)" />
      </g>
    </svg>
  )
}
