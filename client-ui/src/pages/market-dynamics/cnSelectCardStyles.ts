import { makeStyles } from '@fluentui/react-components'
import { opptrixCssVars } from '../../theme/tokens'
import { CN_DASH } from './cnDashboardTokens'

/** 看板内可点击卡片统一交互：浅底、无深色描边 */
export const useCnSelectCardStyles = makeStyles({
  card: {
    border: CN_DASH.cardBorder,
    backgroundColor: opptrixCssVars.surface,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    appearance: 'none',
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
    transitionTimingFunction: 'ease',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceMuted,
    },
    ':focus': { outline: 'none' },
    ':focus-visible': {
      outline: `2px solid ${opptrixCssVars.separatorStrong}`,
      outlineOffset: '1px',
    },
    ':active': {
      backgroundColor: opptrixCssVars.accentSoft,
    },
    ':disabled': {
      cursor: 'default',
      opacity: 0.72,
    },
  },
  cardActive: {
    backgroundColor: opptrixCssVars.accentSoft,
    boxShadow: `inset 0 0 0 1px ${opptrixCssVars.separatorStrong}`,
    ':hover': {
      backgroundColor: opptrixCssVars.accentSoft,
    },
    ':active': {
      backgroundColor: opptrixCssVars.accentSoft,
    },
  },
})

/** 顶栏指数卡：无 outline / inset 描边，避免与内容重叠感 */
export const useCnHeroCardStyles = makeStyles({
  card: {
    border: CN_DASH.cardBorder,
    backgroundColor: opptrixCssVars.surface,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    appearance: 'none',
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
    transitionTimingFunction: 'ease',
    outline: 'none',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceMuted,
    },
    ':focus': { outline: 'none' },
    ':focus-visible': { outline: 'none' },
    ':active': {
      backgroundColor: opptrixCssVars.accentSoft,
    },
  },
  cardActive: {
    backgroundColor: opptrixCssVars.accentSoft,
    ':hover': {
      backgroundColor: opptrixCssVars.accentSoft,
    },
    ':active': {
      backgroundColor: opptrixCssVars.accentSoft,
    },
  },
})
