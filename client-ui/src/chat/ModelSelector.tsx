import { Fragment, useMemo, useRef, useState } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ChevronDownRegular, CheckmarkRegular } from '@fluentui/react-icons'
import type { AvailableModel, ReasoningEffort, SessionLlmParams } from '../types/chat'
import {
  DEFAULT_SESSION_MAX_TOKENS,
  DEFAULT_SESSION_TEMPERATURE,
  MAX_OUTPUT_TOKENS_PRESETS,
  OUTPUT_TOKENS_64K,
  OUTPUT_TOKENS_128K,
  OUTPUT_TOKENS_384K,
  resolveSessionLlmParamsForUi,
} from '../types/chat'
import { opptrixCssVars } from '../theme/tokens'
import { focusVisibleRing, ghostInteractive, motion } from '../theme/mixins'
import OpptrixSegmentedControl from '../components/opptrix/OpptrixSegmentedControl'
import ComposerTooltipMenu, {
  COMPOSER_MENU_WIDTH,
  ComposerTooltipMenuItem,
} from './ComposerTooltipMenu'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    height: '28px',
    minHeight: '28px',
    flexShrink: 1,
    minWidth: 0,
    position: 'relative',
  },
  rootCompact: {
    maxWidth: '168px',
    minWidth: '88px',
  },
  rootDefault: {
    maxWidth: '220px',
    minWidth: '120px',
  },
  rootMobile: {
    maxWidth: '160px',
    minWidth: '100px',
  },
  trigger: {
    ...ghostInteractive,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    height: '28px',
    maxWidth: '100%',
    padding: 0,
    border: 'none',
    backgroundColor: 'transparent',
    color: opptrixCssVars.textTertiary,
    fontWeight: 400,
    cursor: 'pointer',
    transitionProperty: 'color, opacity',
    transitionDuration: motion.fast,
    ':hover': {
      color: opptrixCssVars.textSecondary,
      backgroundColor: 'transparent',
    },
    ':disabled': {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
    ...focusVisibleRing,
  },
  triggerCompact: {
    fontSize: 'var(--opptrix-font-md)',
  },
  triggerDefault: {
    fontSize: 'var(--opptrix-font-base)',
  },
  triggerLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  triggerIcon: {
    flexShrink: 0,
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
  },
  groupHeader: {
    display: 'block',
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    padding: '8px 10px 4px',
  },
  groupDivider: {
    height: '1px',
    margin: '4px 0',
    backgroundColor: opptrixCssVars.separator,
  },
  modelName: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 'var(--opptrix-font-base)',
  },
  /** Footer 内参数区：紧凑间距，与 Cursor 设置感接近；外层 __foot 已有 padding */
  params: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '2px 0 0',
  },
  paramRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  paramLabelRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  paramLabel: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
  },
  paramValue: {
    fontSize: 'var(--opptrix-font-sm)',
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textTertiary,
  },
  slider: {
    width: '100%',
    accentColor: opptrixCssVars.accent,
    height: '4px',
    cursor: 'pointer',
  },
})

/** Composer 选模+参数面板宽度（设置页仍用 COMPOSER_MENU_WIDTH.model） */
const MODEL_PARAMS_PANEL_WIDTH = 300
const MODEL_LIST_MAX_HEIGHT = 280
/** 温度 / 长度 / 思考强度 footer 约占高度；列表 maxHeight 与之分离 */
const MODEL_PARAMS_FOOTER_RESERVE = 148

/**
 * showParams 时：列表可滚、footer 固定在 ComposerTooltipMenu 外。
 * 整体预算约 min(70vh, 420)，减去 footer 后给列表。
 */
function resolveModelListMaxHeight(showParams: boolean): number {
  if (!showParams) return MODEL_LIST_MAX_HEIGHT
  const viewportCap = typeof window === 'undefined'
    ? 420
    : Math.floor(window.innerHeight * 0.7)
  const panelBudget = Math.min(420, viewportCap)
  return Math.max(180, panelBudget - MODEL_PARAMS_FOOTER_RESERVE)
}

export type SessionLlmParamsPatch = {
  temperature?: number
  maxTokens?: number
  reasoningEffort?: ReasoningEffort | null
}

interface ModelSelectorProps {
  models: AvailableModel[]
  value?: string
  disabled?: boolean
  isMobile?: boolean
  compact?: boolean
  /** 当 value 未匹配任何模型时，不回退到首项，显示此文案（设置页一步选模） */
  unsetLabel?: string
  onChange: (ref: string) => void
  /** 仅 Composer 传 true；设置页保持默认 false，不展示参数区 */
  showParams?: boolean
  llmParams?: SessionLlmParams | null
  onLlmParamsChange?: (patch: SessionLlmParamsPatch) => void
}

function groupModelsByProvider(models: AvailableModel[]) {
  const groups: { providerName: string; items: AvailableModel[] }[] = []
  const indexByProvider = new Map<string, number>()

  for (const model of models) {
    const idx = indexByProvider.get(model.providerName)
    if (idx !== undefined) {
      groups[idx].items.push(model)
    } else {
      indexByProvider.set(model.providerName, groups.length)
      groups.push({ providerName: model.providerName, items: [model] })
    }
  }

  return groups
}

const EFFORT_OPTIONS: Array<{ value: ReasoningEffort | 'off'; label: string }> = [
  { value: 'off', label: '默认' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
]

type OutputLengthPreset = `${(typeof MAX_OUTPUT_TOKENS_PRESETS)[number]}`

const OUTPUT_LENGTH_OPTIONS: Array<{ value: OutputLengthPreset; label: string }> = [
  { value: String(DEFAULT_SESSION_MAX_TOKENS) as OutputLengthPreset, label: '32k' },
  { value: String(OUTPUT_TOKENS_64K) as OutputLengthPreset, label: '64k' },
  { value: String(OUTPUT_TOKENS_128K) as OutputLengthPreset, label: '128k' },
  { value: String(OUTPUT_TOKENS_384K) as OutputLengthPreset, label: '384k' },
]

/** 将当前上限映射到可选档位（旧默认 / 未匹配偏低值落在 32k） */
function resolveOutputLengthPreset(maxTokens: number): OutputLengthPreset {
  if (maxTokens >= OUTPUT_TOKENS_384K) {
    return String(OUTPUT_TOKENS_384K) as OutputLengthPreset
  }
  if (maxTokens >= OUTPUT_TOKENS_128K) {
    return String(OUTPUT_TOKENS_128K) as OutputLengthPreset
  }
  if (maxTokens >= OUTPUT_TOKENS_64K) {
    return String(OUTPUT_TOKENS_64K) as OutputLengthPreset
  }
  return String(DEFAULT_SESSION_MAX_TOKENS) as OutputLengthPreset
}

export default function ModelSelector({
  models,
  value,
  disabled,
  isMobile,
  compact,
  unsetLabel,
  onChange,
  showParams = false,
  llmParams,
  onLlmParamsChange,
}: ModelSelectorProps) {
  const s = useStyles()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const activeRef = useMemo(() => {
    if (value && models.some(m => m.ref === value)) return value
    if (unsetLabel !== undefined) return undefined
    return models[0]?.ref
  }, [models, value, unsetLabel])

  const active = activeRef ? models.find(m => m.ref === activeRef) : undefined
  const groups = useMemo(() => groupModelsByProvider(models), [models])
  const displayModel = active?.model ?? unsetLabel ?? '选择模型'
  const resolved = resolveSessionLlmParamsForUi(llmParams)

  if (!models.length) {
    return (
      <Text style={{
        fontSize: compact ? 11 : 12,
        color: opptrixCssVars.textTertiary,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        lineHeight: '28px',
      }}
      >
        未配置模型
      </Text>
    )
  }

  const paramsFooter = showParams && onLlmParamsChange ? (
    <div className={s.params}>
      <div className={s.paramRow}>
        <div className={s.paramLabelRow}>
          <span className={s.paramLabel}>温度</span>
          <span className={s.paramValue}>{resolved.temperature.toFixed(1)}</span>
        </div>
        <input
          type="range"
          className={s.slider}
          min={0}
          max={2}
          step={0.1}
          value={resolved.temperature}
          disabled={disabled}
          aria-label="温度"
          onChange={(e) => {
            const next = Number.parseFloat(e.target.value)
            onLlmParamsChange({
              temperature: Number.isFinite(next) ? next : DEFAULT_SESSION_TEMPERATURE,
            })
          }}
        />
      </div>
      <div className={s.paramRow}>
        <span className={s.paramLabel}>回复长度上限</span>
        <OpptrixSegmentedControl
          variant="embedded"
          aria-label="回复长度上限"
          value={resolveOutputLengthPreset(resolved.maxTokens)}
          options={OUTPUT_LENGTH_OPTIONS}
          onChange={(next) => {
            const parsed = Number.parseInt(next, 10)
            onLlmParamsChange({
              maxTokens: Number.isFinite(parsed) ? parsed : DEFAULT_SESSION_MAX_TOKENS,
            })
          }}
        />
      </div>
      <div className={s.paramRow}>
        <span className={s.paramLabel}>思考强度</span>
        <OpptrixSegmentedControl
          variant="embedded"
          aria-label="思考强度"
          value={resolved.reasoningEffort}
          options={EFFORT_OPTIONS}
          onChange={(next) => {
            onLlmParamsChange({
              reasoningEffort: next === 'off' ? null : next,
            })
          }}
        />
      </div>
    </div>
  ) : undefined

  return (
    <div
      className={mergeClasses(
        s.root,
        compact ? s.rootCompact : (isMobile ? s.rootMobile : s.rootDefault),
      )}
    >
      <button
        ref={triggerRef}
        type="button"
        className={mergeClasses(
          s.trigger,
          compact || isMobile ? s.triggerCompact : s.triggerDefault,
          'opptrix-focusable',
        )}
        disabled={disabled}
        aria-label={`当前模型：${displayModel}`}
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <span className={s.triggerLabel}>{displayModel}</span>
        <ChevronDownRegular className={s.triggerIcon} />
      </button>

      <ComposerTooltipMenu
        open={open}
        anchorRef={triggerRef}
        align="end"
        width={showParams ? MODEL_PARAMS_PANEL_WIDTH : COMPOSER_MENU_WIDTH.model}
        maxHeight={resolveModelListMaxHeight(showParams)}
        ariaLabel={showParams ? '模型与参数' : '模型列表'}
        onClose={() => setOpen(false)}
        footer={paramsFooter}
      >
        {groups.map((group, groupIndex) => (
          <Fragment key={group.providerName}>
            {groupIndex > 0 && <div className={s.groupDivider} />}
            <span className={s.groupHeader}>{group.providerName}</span>
            {group.items.map(model => (
              <ComposerTooltipMenuItem
                key={model.ref}
                active={activeRef === model.ref}
                onClick={() => {
                  onChange(model.ref)
                  setOpen(false)
                }}
              >
                <span className={s.modelName}>{model.model}</span>
                {activeRef === model.ref ? (
                  <CheckmarkRegular fontSize={16} />
                ) : null}
              </ComposerTooltipMenuItem>
            ))}
          </Fragment>
        ))}
      </ComposerTooltipMenu>
    </div>
  )
}
