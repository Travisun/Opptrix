import { useCallback, useEffect, useRef, useState } from 'react'
import { research } from '../../api/client'
import type { MarketHotItem } from '../../types/schemas'
import { mapCnHotBoardItems } from './cnHotBoardUtils'
import { defaultHotHistoryDate, normalizeTradeDate, resolveLastTradingDayOnOrBefore } from './cnTradingDayUtils'

type State = {
  items: MarketHotItem[]
  queryDate: string | null
  loading: boolean
  error: string
}

export function useCnHotBoardHistory(enabled: boolean) {
  const [state, setState] = useState<State>({
    items: [],
    queryDate: null,
    loading: false,
    error: '',
  })
  const [pickerDate, setPickerDate] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const loadForDate = useCallback(async (rawDate: string) => {
    const normalized = normalizeTradeDate(rawDate)
    if (!normalized) {
      setState(prev => ({ ...prev, error: '日期格式无效', loading: false }))
      return
    }
    setState(prev => ({ ...prev, loading: true, error: '' }))
    try {
      const tradeDate = await resolveLastTradingDayOnOrBefore(normalized)
      setPickerDate(tradeDate)
      const resp = await research.cnMarketSpecial({ kind: 'hot_history', date: tradeDate })
      if (!mountedRef.current) return
      if (!resp.success) {
        setState({
          items: [],
          queryDate: tradeDate,
          loading: false,
          error: resp.message || '暂时无法获取历史热股',
        })
        return
      }
      const items = mapCnHotBoardItems(resp.data?.items ?? [])
      setState({
        items,
        queryDate: tradeDate,
        loading: false,
        error: items.length ? '' : '该日暂无热股排行',
      })
    } catch (e) {
      if (!mountedRef.current) return
      setState({
        items: [],
        queryDate: null,
        loading: false,
        error: e instanceof Error ? e.message : '加载失败',
      })
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void (async () => {
      const initial = await defaultHotHistoryDate()
      await loadForDate(initial)
    })()
  }, [enabled, loadForDate])

  const onPickerChange = useCallback((value: string) => {
    void loadForDate(value)
  }, [loadForDate])

  return {
    ...state,
    pickerDate,
    onPickerChange,
    refresh: () => {
      if (pickerDate) void loadForDate(pickerDate)
    },
  }
}
