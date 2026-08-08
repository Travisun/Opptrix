import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  ArrowFitRegular,
  ZoomInRegular,
  ZoomOutRegular,
} from '@fluentui/react-icons'
import { opptrixCssVars } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'
import FilenameEllipsis from './FilenameEllipsis'

const ZOOM_STEP = 1.2
const ZOOM_MIN = 0.25
const ZOOM_MAX = 4

interface Props {
  url: string
  alt?: string
  /** 次级工具条左侧文件名 */
  title?: string
  panelVisible?: boolean
}

const useStyles = makeStyles({
  root: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: opptrixCssVars.canvas,
  },
  toolbar: {
    flexShrink: 0,
    height: '34px',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    padding: '0 8px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvas,
  },
  toolbarTitle: {
    flex: '0 1 auto',
    minWidth: 0,
    maxWidth: '46%',
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-sm)',
    userSelect: 'none',
    paddingRight: '4px',
  },
  toolBtn: {
    ...ghostInteractive,
    width: '28px',
    height: '28px',
    minWidth: '28px',
    minHeight: '28px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    color: opptrixCssVars.textSecondary,
    cursor: 'pointer',
    ':disabled': {
      opacity: 0.35,
      cursor: 'default',
      ':hover': {
        backgroundColor: 'transparent',
      },
    },
  },
  spacer: {
    flex: 1,
    minWidth: '4px',
  },
  imageArea: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    padding: '8px',
    backgroundColor: opptrixCssVars.canvasMuted,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'grab',
    userSelect: 'none',
    touchAction: 'none',
  },
  imageAreaDragging: {
    cursor: 'grabbing',
  },
  imageStage: {
    boxSizing: 'border-box',
    width: '100%',
    transformOrigin: 'center center',
    willChange: 'transform',
  },
  image: {
    display: 'block',
    width: '100%',
    height: 'auto',
    objectFit: 'contain',
    userSelect: 'none',
    pointerEvents: 'none',
  },
})

export default function ImagePreviewViewer({
  url,
  alt = '',
  title,
  panelVisible = true,
}: Props) {
  const s = useStyles()
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const imageAreaRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    offsetX: number
    offsetY: number
  } | null>(null)

  useEffect(() => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setDragging(false)
    dragRef.current = null
  }, [url])

  useEffect(() => {
    if (!panelVisible) return
    const area = imageAreaRef.current
    if (!area) return

    // Chromium/Electron：触控板捏合会以 ctrlKey + wheel 上报；拦截以免整窗缩放
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const factor = Math.exp(-e.deltaY * 0.01)
      setZoom((z) => {
        const next = Math.round(z * factor * 100) / 100
        return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))
      })
    }
    area.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      area.removeEventListener('wheel', onWheel)
    }
  }, [panelVisible, url])

  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, Math.round(z * ZOOM_STEP * 100) / 100))
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, Math.round(z / ZOOM_STEP * 100) / 100))
  const fitWidth = () => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }

  const endDrag = (pointerId: number) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== pointerId) return
    dragRef.current = null
    setDragging(false)
    const area = imageAreaRef.current
    if (area?.hasPointerCapture(pointerId)) {
      try {
        area.releasePointerCapture(pointerId)
      } catch {
        // ignore
      }
    }
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const area = imageAreaRef.current
    if (!area) return
    e.preventDefault()
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    }
    area.setPointerCapture(e.pointerId)
    setDragging(true)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    setOffset({
      x: drag.offsetX + (e.clientX - drag.startX),
      y: drag.offsetY + (e.clientY - drag.startY),
    })
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    endDrag(e.pointerId)
  }

  if (!panelVisible) {
    return <div className={s.root} aria-hidden />
  }

  return (
    <div className={s.root}>
      <div className={s.toolbar} role="toolbar" aria-label="图片预览">
        {title ? (
          <FilenameEllipsis name={title} className={s.toolbarTitle} />
        ) : null}
        <span className={s.spacer} />
        <button
          type="button"
          className={s.toolBtn}
          onClick={zoomOut}
          disabled={zoom <= ZOOM_MIN}
          aria-label="缩小"
          title="缩小"
        >
          <ZoomOutRegular fontSize={16} />
        </button>
        <button
          type="button"
          className={s.toolBtn}
          onClick={fitWidth}
          aria-label="适合宽度"
          title="适合宽度"
        >
          <ArrowFitRegular fontSize={16} />
        </button>
        <button
          type="button"
          className={s.toolBtn}
          onClick={zoomIn}
          disabled={zoom >= ZOOM_MAX}
          aria-label="放大"
          title="放大"
        >
          <ZoomInRegular fontSize={16} />
        </button>
      </div>
      <div
        className={mergeClasses(s.imageArea, dragging && s.imageAreaDragging)}
        ref={imageAreaRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className={s.imageStage}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          }}
        >
          <img src={url} alt={alt} className={s.image} draggable={false} />
        </div>
      </div>
    </div>
  )
}
