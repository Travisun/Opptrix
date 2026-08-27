import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { pctTone } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import { opptrixCssVars } from '../../theme/tokens'

function hashSeed(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0
  }
  return h || 1
}

function buildPoints(seed: string, tone: ReturnType<typeof pctTone>, count = 16): number[] {
  const base = hashSeed(seed)
  const bias = tone === 'up' ? 0.62 : tone === 'down' ? 0.38 : 0.5
  const pts: number[] = []
  for (let i = 0; i < count; i += 1) {
    const wave = Math.sin((i / (count - 1)) * Math.PI * 1.6 + (base % 7))
    const noise = ((base >> (i % 5)) & 7) / 14 - 0.25
    const t = i / (count - 1)
    pts.push(bias + (t - 0.5) * 0.12 + wave * 0.08 + noise)
  }
  return pts
}

const useStyles = makeStyles({
  root: {
    display: 'block',
    flexShrink: 0,
  },
  fluidWrap: {
    display: 'block',
    width: '100%',
    minWidth: 0,
  },
  lineUp: { stroke: MARKET_UP },
  lineDown: { stroke: MARKET_DOWN },
  lineFlat: { stroke: opptrixCssVars.textTertiary },
  fillUp: { fill: `color-mix(in srgb, ${MARKET_UP} 14%, transparent)` },
  fillDown: { fill: `color-mix(in srgb, ${MARKET_DOWN} 14%, transparent)` },
  fillFlat: { fill: 'color-mix(in srgb, var(--opptrix-text-tertiary) 8%, transparent)' },
})

type Props = {
  seed: string
  changePct?: number | null
  width?: number
  height?: number
  /** 撑满父容器宽度 */
  fluid?: boolean
  className?: string
}

function SparklineSvg({
  seed,
  changePct,
  width,
  height,
  className,
}: Required<Pick<Props, 'seed' | 'width' | 'height'>> & Pick<Props, 'changePct' | 'className'>) {
  const s = useStyles()
  const tone = pctTone(changePct)

  const { linePath, areaPath } = useMemo(() => {
    const pts = buildPoints(seed, tone)
    const padX = 2
    const padY = 3
    const innerW = width - padX * 2
    const innerH = height - padY * 2
    const coords = pts.map((v, i) => ({
      x: padX + (i / (pts.length - 1)) * innerW,
      y: padY + (1 - v) * innerH,
    }))
    const line = coords.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    const area = `${line} L${coords[coords.length - 1]!.x.toFixed(1)},${(height - 1).toFixed(1)} L${coords[0]!.x.toFixed(1)},${(height - 1).toFixed(1)} Z`
    return { linePath: line, areaPath: area }
  }, [height, seed, tone, width])

  const lineClass = tone === 'up' ? s.lineUp : tone === 'down' ? s.lineDown : s.lineFlat
  const fillClass = tone === 'up' ? s.fillUp : tone === 'down' ? s.fillDown : s.fillFlat

  return (
    <svg
      className={mergeClasses(s.root, className)}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      <path className={fillClass} d={areaPath} stroke="none" />
      <path
        className={lineClass}
        d={linePath}
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function CnMiniSparkline({
  seed,
  changePct,
  width = 72,
  height = 28,
  fluid = false,
  className,
}: Props) {
  const s = useStyles()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [fluidWidth, setFluidWidth] = useState(width)

  useLayoutEffect(() => {
    if (!fluid) return
    const el = wrapRef.current
    if (!el) return
    const sync = () => setFluidWidth(Math.max(48, Math.floor(el.clientWidth)))
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fluid])

  if (fluid) {
    return (
      <div ref={wrapRef} className={mergeClasses(s.fluidWrap, className)}>
        <SparklineSvg
          seed={seed}
          changePct={changePct}
          width={fluidWidth}
          height={height}
        />
      </div>
    )
  }

  return (
    <SparklineSvg
      seed={seed}
      changePct={changePct}
      width={width}
      height={height}
      className={className}
    />
  )
}
