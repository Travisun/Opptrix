import { useCallback, useEffect, useRef, useState } from 'react'
import { Spinner, Text, makeStyles } from '@fluentui/react-components'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { portfolioFeeGlobal, portfolioFeeGlobalSave } from '../../api/client'
import { DEFAULT_PORTFOLIO_GLOBAL_FEES, normalizePortfolioGlobalFees, type PortfolioGlobalFees } from '@opptrix/shared/portfolio-fees'
import PortfolioGlobalFeeEditor from '../../market/PortfolioGlobalFeeEditor'
import { opptrixCssVars } from '../../theme/tokens'
import {
  SettingsGroup,
  SettingsRow,
} from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  intro: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: '18px',
    padding: '0 2px',
  },
})

export default function PortfolioFeeSettingsSection() {
  const s = useStyles()
  const toast = useSettingsToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [globalFees, setGlobalFees] = useState<PortfolioGlobalFees>(DEFAULT_PORTFOLIO_GLOBAL_FEES)
  const baselineRef = useRef<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await portfolioFeeGlobal()
      if (resp.success && resp.data?.globalFees) {
        const normalized = normalizePortfolioGlobalFees(resp.data.globalFees)
        setGlobalFees(normalized)
        baselineRef.current = JSON.stringify(normalized)
      }
    } catch {
      toast.showToast('暂时无法加载组合费率', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  const dirty = JSON.stringify(globalFees) !== baselineRef.current

  const handleSave = async () => {
    setSaving(true)
    try {
      const resp = await portfolioFeeGlobalSave(globalFees)
      if (!resp.success || !resp.data?.globalFees) {
        toast.showToast('保存失败，请稍后重试', 'error')
        return
      }
      setGlobalFees(normalizePortfolioGlobalFees(resp.data.globalFees))
      baselineRef.current = JSON.stringify(normalizePortfolioGlobalFees(resp.data.globalFees))
      const n = resp.data.recalculatedTrades ?? 0
      toast.showToast(
        n > 0 ? `已保存，并按新费率重算了 ${n} 笔历史交易` : '组合默认费率已保存',
        'success',
      )
    } catch {
      toast.showToast('保存失败，请稍后重试', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <Spinner size="small" label="正在加载组合费率…" />
  }

  return (
    <div className={s.root}>
      <Text className={s.intro} block>
        作为所有标的的默认计费规则。在「管理持仓」里可为单只标的单独覆盖；保存后会按新规则自动重算已有买卖记录的费用与持仓盈亏。
      </Text>
      <PortfolioGlobalFeeEditor value={globalFees} onChange={setGlobalFees} />
      <SettingsGroup>
        <SettingsRow
          title="保存并重算"
          desc="保存后立即按新规则重算全部历史买卖记录的费用，并更新持仓盈亏"
          last
          control={
            <OpptrixButton
              variant="primary"
              disabled={!dirty || saving}
              onClick={() => void handleSave()}
            >
              {saving ? '保存中…' : '保存并重算'}
            </OpptrixButton>
          }
        />
      </SettingsGroup>
    </div>
  )
}
