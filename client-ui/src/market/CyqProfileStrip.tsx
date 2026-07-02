import { useEffect, useMemo, useRef } from 'react'
import { makeStyles } from '@fluentui/react-components'
import type { ChipDistributionPoint, ChipDistributionProfileData } from '../types/market'
import { MARKET_DOWN, MARKET_UP } from './chartTheme'
import { priceToCanvasY } from './cyqUtils'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'

const useStyles = makeStyles({
  root: {
    width: '88px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    borderLeft: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    minHeight: 0,
  },
  head: {
    flexShrink: 0,
    padding: '2px 4px',
    fontSize: '7px',
    fontWeight: 650,
    color: opptrixCssVars.textTertiary,
    textAlign: 'center',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    lineHeight: 1.2,
  },
  profitTag: {
    color: MARKET_UP,
    fontWeight: 700,
  },
  canvasWrap: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
  },
  canvas: {
    display: 'block',
    width: '100%',
    height: '100%',
  },
})

interface Props {
  profile: ChipDistributionProfileData
  latest: ChipDistributionPoint
  priceSpan: { min: number; max: number }
}

function drawStrip(
  canvas: HTMLCanvasElement,
  profile: ChipDistributionProfileData,
  latest: ChipDistributionPoint,
  priceSpan: { min: number; max: number },
) {
  const rect = canvas.getBoundingClientRect()
  const w = Math.max(1, Math.floor(rect.width))
  const h = Math.max(1, Math.floor(rect.height))
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.floor(w * dpr)
  canvas.height = Math.floor(h * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const { min, max } = priceSpan
  const levels = profile.levels.filter(l => l.weight > 0)
  if (!levels.length) return

  const y90Top = priceToCanvasY(latest.cost90High, min, max, h)
  const y90Bot = priceToCanvasY(latest.cost90Low, min, max, h)
  ctx.fillStyle = 'rgba(255, 149, 0, 0.12)'
  ctx.fillRect(0, Math.min(y90Top, y90Bot), w, Math.abs(y90Bot - y90Top) || 1)

  const barMaxW = w - 6
  const span = Math.max(max - min, 0.01)
  const bucketH = Math.max(1.5, (span / Math.max(levels.length, 1)) * (h / span) * 0.85)

  for (const level of levels) {
    const y = priceToCanvasY(level.price, min, max, h)
    const profit = level.price <= profile.currentPrice
    ctx.fillStyle = profit ? 'rgba(255, 59, 48, 0.78)' : 'rgba(52, 199, 89, 0.68)'
    const barW = Math.max(1, level.weight * barMaxW)
    ctx.fillRect(w - barW - 2, y - bucketH / 2, barW, bucketH)
  }

  const yAvg = priceToCanvasY(latest.avgCost, min, max, h)
  ctx.strokeStyle = 'rgba(88, 86, 214, 0.95)'
  ctx.setLineDash([3, 2])
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, yAvg)
  ctx.lineTo(w, yAvg)
  ctx.stroke()
  ctx.setLineDash([])

  const yNow = priceToCanvasY(profile.currentPrice, min, max, h)
  ctx.strokeStyle = MARKET_UP
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(0, yNow)
  ctx.lineTo(w, yNow)
  ctx.stroke()

  ctx.fillStyle = opptrixCssVars.textTertiary
  ctx.font = '8px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(profile.currentPrice.toFixed(2), 2, Math.max(9, Math.min(h - 2, yNow - 2)))
}

export default function CyqProfileStrip({ profile, latest, priceSpan }: Props) {
  const s = useStyles()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const profitPct = useMemo(
    () => `${(latest.benefitPart * 100).toFixed(1)}%`,
    [latest.benefitPart],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    drawStrip(canvas, profile, latest, priceSpan)

    const wrap = wrapRef.current
    if (!wrap) return undefined
    const ro = new ResizeObserver(() => {
      drawStrip(canvas, profile, latest, priceSpan)
    })
    ro.observe(wrap)
    return () => { ro.disconnect() }
  }, [profile, latest, priceSpan])

  return (
    <div className={s.root} title="筹码分布：右→左为占比，纵轴与 K 线价位对齐">
      <div className={s.head}>
        筹码
        <br />
        <span className={s.profitTag}>获{profitPct}</span>
      </div>
      <div ref={wrapRef} className={s.canvasWrap}>
        <canvas ref={canvasRef} className={s.canvas} />
      </div>
    </div>
  )
}
