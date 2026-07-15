/**
 * MCP API Key 输入字段 — 编组密码框 + 眼睛切换 + 测试按钮
 *
 * 输入框与测试按钮在同一视觉容器内，感觉像一整块组件。
 * ┌──────────────────────────────────────────────┐
 * │ [••••••••••••••••••••]    👁️   │  测试连接   │
 * └──────────────────────────────────────────────┘
 */

import { useState, useCallback } from 'react'
import { Input, makeStyles, mergeClasses } from '@fluentui/react-components'
import { EyeRegular, EyeOffRegular, FlashRegular } from '@fluentui/react-icons'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'
import { motion } from '../../theme/mixins'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    border: opptrixCssVars.settingsPanelBorder,
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.inputBg,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: '12px',
    border: 'none !important',
    boxShadow: 'none !important',
    backgroundColor: 'transparent !important',
    '& input': {
      border: 'none !important',
      boxShadow: 'none !important',
      backgroundColor: 'transparent !important',
    },
  },
  eyeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'none',
    padding: '4px 4px 4px 2px',
    cursor: 'pointer',
    color: opptrixCssVars.textTertiary,
    minWidth: '26px',
    minHeight: '26px',
    flexShrink: 0,
    transitionProperty: 'color',
    transitionDuration: motion.fast,
    ':hover': {
      color: opptrixCssVars.textPrimary,
    },
  },
  separator: {
    width: '1px',
    height: '18px',
    backgroundColor: opptrixCssVars.separator,
    flexShrink: 0,
  },
  testBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'none',
    padding: '4px 10px',
    cursor: 'pointer',
    color: opptrixCssVars.textPrimary,
    fontSize: '14px',
    flexShrink: 0,
    minHeight: '28px',
    minWidth: '32px',
    transitionProperty: 'background-color, color',
    transitionDuration: motion.fast,
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
    },
    ':active': {
      opacity: 0.8,
    },
  },
  testBtnDisabled: {
    color: opptrixCssVars.textTertiary,
    cursor: 'default',
    ':hover': {
      backgroundColor: 'transparent',
    },
  },
  testBtnLoading: {
    color: opptrixCssVars.textTertiary,
    animation: 'mcp-spin 1s linear infinite',
    '@keyframes mcp-spin': {
      from: { transform: 'rotate(0deg)' },
      to: { transform: 'rotate(360deg)' },
    },
  },
})

interface McpApiKeyFieldProps {
  value: string
  configured: boolean
  testing?: boolean
  onValueChange: (value: string) => void
  onBlur?: () => void
  onTest: () => void
  placeholder?: string
  className?: string
}

export default function McpApiKeyField({
  value,
  configured,
  testing,
  onValueChange,
  onBlur,
  onTest,
  placeholder,
  className,
}: McpApiKeyFieldProps) {
  const s = useStyles()
  const [revealed, setRevealed] = useState(false)

  const toggleReveal = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setRevealed(v => !v)
  }, [])

  return (
    <div className={mergeClasses(s.root, className)}>
      <Input
        className={s.input}
        placeholder={placeholder}
        type={revealed ? 'text' : 'password'}
        size="small"
        value={value}
        onBlur={onBlur}
        onChange={(_, d) => onValueChange(d.value)}
        contentAfter={(
          <button
            type="button"
            className={s.eyeBtn}
            aria-label={revealed ? '隐藏 API Key' : '显示 API Key'}
            onClick={toggleReveal}
            tabIndex={-1}
          >
            {revealed ? <EyeOffRegular fontSize={14} /> : <EyeRegular fontSize={14} />}
          </button>
        )}
      />
      <div className={s.separator} />
      <button
        type="button"
        className={mergeClasses(s.testBtn, (!configured || testing) && s.testBtnDisabled, testing && s.testBtnLoading)}
        disabled={!configured || testing}
        onClick={onTest}
        aria-label="测试连接"
      >
        <FlashRegular fontSize={14} />
      </button>
    </div>
  )
}
