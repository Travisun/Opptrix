import type { ReactNode } from 'react'
import {
  Dialog,
  DialogBody,
  DialogSurface,
  DialogTitle,
  Spinner,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import { CopyRegular, DeleteRegular, SaveRegular } from '@fluentui/react-icons'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import OpptrixField from '../../components/opptrix/OpptrixField'
import OpptrixInput from '../../components/opptrix/OpptrixInput'
import OpptrixTextarea from '../../components/opptrix/OpptrixTextarea'
import { factorLabel } from '../../market/factorLabels'
import type { CustomDiscoverStrategy, DiscoverStrategyDetail } from '../../types/schemas'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'

export type StrategyDraft = {
  name: string
  tagline: string
  description: string
  methodology: string
  refinement_notes: string
  prompt: string
  profile: import('../../types/schemas').DiscoverStrategyProfile
  copied_from: string | null
}

const useStyles = makeStyles({
  dialogSurface: {
    maxWidth: '560px',
    width: 'calc(100vw - 40px)',
    maxHeight: 'min(88vh, 720px)',
    display: 'flex',
    flexDirection: 'column',
  },
  dialogBody: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    flex: 1,
    overflow: 'hidden',
  },
  dialogHeader: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
  },
  dialogTitle: {
    fontSize: '16px',
    fontWeight: 650,
    letterSpacing: '-0.02em',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.3,
  },
  dialogIntro: {
    fontSize: '13px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
    marginTop: '4px',
  },
  dialogScroll: {
    flex: 1,
    minHeight: 0,
    overflowX: 'hidden',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    marginRight: '-4px',
    paddingRight: '4px',
    marginTop: '14px',
  },
  dialogForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  formSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  formSectionLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
    letterSpacing: '-0.01em',
    lineHeight: 1.35,
  },
  formGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  viewField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  viewLabel: {
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '-0.02em',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.3,
  },
  viewValue: {
    fontSize: '13px',
    lineHeight: 1.55,
    color: opptrixCssVars.textSecondary,
    whiteSpace: 'pre-wrap',
  },
  conditions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  conditionRow: {
    fontSize: '12px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
    padding: '6px 10px',
    borderRadius: opptrixTokens.radiusSm,
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  dialogFooter: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    paddingTop: '16px',
    marginTop: '16px',
    borderTop: `1px solid ${opptrixCssVars.separator}`,
  },
  dialogFooterStart: {
    marginRight: 'auto',
  },
})

function StrategyViewField({ label, children }: { label: string; children: ReactNode }) {
  const s = useStyles()
  return (
    <div className={s.viewField}>
      <Text className={s.viewLabel} block>{label}</Text>
      <div className={s.viewValue}>{children}</div>
    </div>
  )
}

function BuiltinViewBody({ detail }: { detail: DiscoverStrategyDetail }) {
  const s = useStyles()
  return (
    <div className={s.formSection}>
      <StrategyViewField label="一句话">{detail.tagline}</StrategyViewField>
      <StrategyViewField label="方法论">{detail.methodology}</StrategyViewField>
      <StrategyViewField label="执行说明">{detail.description}</StrategyViewField>
      <StrategyViewField label="参考因子（执行时由 AI 解析）">
        <div className={s.conditions}>
          {detail.conditions.map(c => (
            <div key={`${c.factor}-${c.op}-${c.value}`} className={s.conditionRow}>
              {`${factorLabel(c.factor) ?? c.factor} ${c.op} ${c.value}`}
            </div>
          ))}
        </div>
      </StrategyViewField>
      <StrategyViewField label="挖掘侧重">{detail.refinement_notes}</StrategyViewField>
      <StrategyViewField label="运行参数">
        {`初选 ${detail.prescreen_top_n} 只 · 精选 ${detail.final_top_n} 只 · ${detail.scorecard}`}
      </StrategyViewField>
    </div>
  )
}

function CustomViewBody({ custom }: { custom: CustomDiscoverStrategy }) {
  const s = useStyles()
  return (
    <div className={s.formSection}>
      {custom.tagline && <StrategyViewField label="一句话">{custom.tagline}</StrategyViewField>}
      {custom.methodology && <StrategyViewField label="方法论">{custom.methodology}</StrategyViewField>}
      {custom.description && <StrategyViewField label="执行说明">{custom.description}</StrategyViewField>}
      {custom.refinement_notes && <StrategyViewField label="挖掘侧重">{custom.refinement_notes}</StrategyViewField>}
      <StrategyViewField label="执行 Prompt">{custom.prompt}</StrategyViewField>
    </div>
  )
}

export function StrategyViewDialog({
  open,
  title,
  kind,
  loading,
  builtinDetail,
  custom,
  onClose,
  onCopyBuiltin,
  onEditCustom,
}: {
  open: boolean
  title: string
  kind: 'builtin' | 'custom' | null
  loading: boolean
  builtinDetail: DiscoverStrategyDetail | null
  custom: CustomDiscoverStrategy | null
  onClose: () => void
  onCopyBuiltin: () => void
  onEditCustom: () => void
}) {
  const s = useStyles()
  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onClose() }}>
      <DialogSurface className={mergeClasses(s.dialogSurface, 'opptrix-dialog-surface')}>
        <DialogBody className={s.dialogBody}>
          <div className={s.dialogHeader}>
            <DialogTitle className={s.dialogTitle}>{title}</DialogTitle>
            <Text className={s.dialogIntro} block>
              {kind === 'builtin' ? '内置策略为只读，可复制为自编后继续编辑。' : '自编策略可在选股页直接执行。'}
            </Text>
          </div>
          <div className={mergeClasses(s.dialogScroll, 'opptrix-scroll')}>
            {kind === 'builtin' && loading && (
              <Spinner size="tiny" label="加载策略详情…" />
            )}
            {kind === 'builtin' && builtinDetail && (
              <BuiltinViewBody detail={builtinDetail} />
            )}
            {kind === 'custom' && custom && (
              <CustomViewBody custom={custom} />
            )}
          </div>
          <div className={s.dialogFooter}>
            {kind === 'builtin' && builtinDetail && (
              <OpptrixButton variant="secondary" onClick={onCopyBuiltin}>
                <CopyRegular fontSize={14} />
                复制为自编
              </OpptrixButton>
            )}
            {kind === 'custom' && custom && (
              <OpptrixButton variant="secondary" onClick={onEditCustom}>
                编辑
              </OpptrixButton>
            )}
          </div>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export function StrategyEditDialog({
  open,
  mode,
  draft,
  onDraftChange,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean
  mode: 'create' | 'edit'
  draft: StrategyDraft
  onDraftChange: (patch: Partial<StrategyDraft>) => void
  onClose: () => void
  onSave: () => void
  onDelete: () => void
}) {
  const s = useStyles()
  const canSave = draft.name.trim().length > 0 && draft.prompt.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onClose() }}>
      <DialogSurface className={mergeClasses(s.dialogSurface, 'opptrix-dialog-surface')}>
        <DialogBody className={s.dialogBody}>
          <div className={s.dialogHeader}>
            <DialogTitle className={s.dialogTitle}>
              {mode === 'create' ? '新建自编策略' : '编辑自编策略'}
            </DialogTitle>
            <Text className={s.dialogIntro} block>
              填写策略说明与执行 Prompt；选股页将按 Prompt 运行挖掘。
            </Text>
          </div>
          <div className={mergeClasses(s.dialogScroll, 'opptrix-scroll')}>
            <div className={s.dialogForm}>
              <div className={s.formSection}>
                <Text className={s.formSectionLabel} block>基本信息</Text>
                <div className={s.formGrid}>
                  <OpptrixField label="策略名称" hint="在策略库与选股页中显示">
                    <OpptrixInput
                      value={draft.name}
                      placeholder="例如 低估值质量股"
                      onChange={(_, d) => onDraftChange({ name: d.value })}
                    />
                  </OpptrixField>
                  <OpptrixField label="一句话说明" hint="简短概括策略风格，显示在列表副标题">
                    <OpptrixInput
                      value={draft.tagline}
                      placeholder="例如 低 PE、高 ROE 的价值精选"
                      onChange={(_, d) => onDraftChange({ tagline: d.value })}
                    />
                  </OpptrixField>
                </div>
              </div>

              <div className={s.formSection}>
                <Text className={s.formSectionLabel} block>策略内容</Text>
                <div className={s.formGrid}>
                  <OpptrixField
                    label="执行说明"
                    hint="描述筛选思路与目标，便于日后回顾"
                    multiline
                  >
                    <OpptrixTextarea
                      resize="vertical"
                      rows={3}
                      value={draft.description}
                      placeholder="说明选股逻辑、行业偏好与风险约束…"
                      onChange={(_, d) => onDraftChange({ description: d.value })}
                    />
                  </OpptrixField>
                  <OpptrixField label="方法论" hint="可选，记录投资框架或参考体系" multiline>
                    <OpptrixTextarea
                      resize="vertical"
                      rows={3}
                      value={draft.methodology}
                      placeholder="例如 巴菲特价值投资、GARP…"
                      onChange={(_, d) => onDraftChange({ methodology: d.value })}
                    />
                  </OpptrixField>
                  <OpptrixField label="挖掘侧重" hint="可选，指导 Agent 深挖时的关注点" multiline>
                    <OpptrixTextarea
                      resize="vertical"
                      rows={2}
                      value={draft.refinement_notes}
                      placeholder="例如 关注现金流质量、管理层变动…"
                      onChange={(_, d) => onDraftChange({ refinement_notes: d.value })}
                    />
                  </OpptrixField>
                </div>
              </div>

              <div className={s.formSection}>
                <Text className={s.formSectionLabel} block>运行配置</Text>
                <div className={s.formGrid}>
                  <OpptrixField
                    label="执行 Prompt"
                    hint="选股页实际提交给挖掘流程的指令，必填"
                    multiline
                  >
                    <OpptrixTextarea
                      resize="vertical"
                      rows={6}
                      value={draft.prompt}
                      placeholder="描述你的选股逻辑，例如：低 PE 且 ROE>12% 的价值股，初选 50 只后精选 15 只"
                      onChange={(_, d) => onDraftChange({ prompt: d.value })}
                    />
                  </OpptrixField>
                </div>
              </div>
            </div>
          </div>
          <div className={s.dialogFooter}>
            {mode === 'edit' && (
              <div className={s.dialogFooterStart}>
                <OpptrixButton variant="secondary" onClick={onDelete}>
                  <DeleteRegular fontSize={14} />
                  删除
                </OpptrixButton>
              </div>
            )}
            <OpptrixButton variant="secondary" onClick={onClose}>
              取消
            </OpptrixButton>
            <OpptrixButton variant="primary" onClick={onSave} disabled={!canSave}>
              <SaveRegular fontSize={14} />
              保存
            </OpptrixButton>
          </div>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
