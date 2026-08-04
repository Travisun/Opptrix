import { useCallback, useEffect, useRef, useState } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { isElectron } from '../platform/detect'
import { opptrixCssVars } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'

const useStyles = makeStyles({
  root: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingLeft: '2px',
    gap: '0',
    WebkitAppRegion: 'no-drag',
  },
  item: {
    ...ghostInteractive,
    appearance: 'none',
    border: 'none',
    margin: 0,
    height: '100%',
    maxHeight: '28px',
    padding: '0 10px',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 400,
    lineHeight: 1,
    cursor: 'default',
    whiteSpace: 'nowrap',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
    },
  },
  itemOpen: {
    backgroundColor: opptrixCssVars.surfaceHover,
  },
})

type AppMenuItem = { index: number; label: string }

/**
 * Simulated native menu bar (文件 / 编辑 / 视图 / 窗口 / 帮助).
 * Clicks open the real Electron application submenu via IPC.
 */
export default function FrameAppMenu() {
  const s = useStyles()
  const [items, setItems] = useState<AppMenuItem[]>([])
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const popupGenRef = useRef(0)

  useEffect(() => {
    if (!isElectron() || !window.electronAPI?.appMenuList) return
    let cancelled = false
    void window.electronAPI.appMenuList().then((list) => {
      if (!cancelled && Array.isArray(list)) setItems(list)
    }).catch(() => {
      if (!cancelled) setItems([])
    })
    return () => { cancelled = true }
  }, [])

  const popupAt = useCallback(async (index: number, anchor: HTMLElement) => {
    const api = window.electronAPI
    if (!api?.appMenuPopup) return
    const rect = anchor.getBoundingClientRect()
    const gen = ++popupGenRef.current
    setOpenIndex(index)
    try {
      await api.appMenuPopup({
        index,
        x: Math.round(rect.left),
        y: Math.round(rect.bottom),
      })
    } finally {
      if (popupGenRef.current === gen) setOpenIndex(null)
    }
  }, [])

  const onItemClick = useCallback((index: number, el: HTMLElement) => {
    void popupAt(index, el)
  }, [popupAt])

  const onItemPointerEnter = useCallback((index: number, el: HTMLElement) => {
    // Windows-style: hover other top-level items while a menu is open.
    if (openIndex == null || openIndex === index) return
    void popupAt(index, el)
  }, [openIndex, popupAt])

  if (items.length === 0) return null

  return (
    <nav className={s.root} aria-label="应用程序菜单">
      {items.map((item) => (
        <button
          key={item.index}
          type="button"
          className={mergeClasses(s.item, openIndex === item.index && s.itemOpen)}
          onClick={(e) => onItemClick(item.index, e.currentTarget)}
          onPointerEnter={(e) => onItemPointerEnter(item.index, e.currentTarget)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}
