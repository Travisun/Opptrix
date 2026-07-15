import { Text, makeStyles } from '@fluentui/react-components'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { ONBOARDING_COPY } from './manifest'
import type { LlmActiveSummary } from './llmSummary'

const useStyles = makeStyles({
  title: {
    fontSize: 'clamp(20px, 3.2vw, 26px)',
    fontWeight: 600,
    letterSpacing: '-0.025em',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.2,
  },
  lead: {
    marginTop: 'clamp(12px, 2vh, 16px)',
    marginBottom: 'clamp(18px, 3vh, 24px)',
    fontSize: 'clamp(15px, 2vw, 17px)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.65,
  },
  card: {
    padding: '16px 18px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.border}`,
    backgroundColor: opptrixCssVars.surface,
  },
  cardKicker: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
  provider: {
    marginTop: '8px',
    fontSize: 'var(--opptrix-font-2xl)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
  model: {
    marginTop: '4px',
    fontSize: 'var(--opptrix-font-lg)',
    color: opptrixCssVars.accent,
    lineHeight: 1.45,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  meta: {
    marginTop: '10px',
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
  fallback: {
    fontSize: 'var(--opptrix-font-lg)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.6,
  },
})

export function OnboardingLlmReadyPanel({
  summary,
}: {
  summary: LlmActiveSummary | null
}) {
  const s = useStyles()

  return (
    <>
      <Text className={s.title} block>{ONBOARDING_COPY.llm.title}</Text>
      <Text className={s.lead} block>{ONBOARDING_COPY.llm.readyLead}</Text>
      {summary ? (
        <div className={s.card}>
          <Text className={s.cardKicker} block>当前使用</Text>
          <Text className={s.provider} block>{summary.providerName}</Text>
          <Text className={s.model} block>{summary.model}</Text>
          {summary.totalModels > 1 && (
            <Text className={s.meta} block>
              共 {summary.totalModels} 个可用模型，可在设置或对话中切换
            </Text>
          )}
        </div>
      ) : (
        <Text className={s.fallback} block>
          大模型已配置完成，可直接继续。
        </Text>
      )}
    </>
  )
}
