import { makeStyles, Text } from '@fluentui/react-components'
import type { PublicAgentSkill } from '../../api/client'
import MarkdownMessage from '../../chat/MarkdownMessage'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    padding: '4px 0 2px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    border: opptrixCssVars.settingsPanelBorder,
    borderRadius: opptrixTokens.radiusMd,
    overflow: 'hidden',
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  row: {
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  label: {
    width: '28%',
    minWidth: '88px',
    padding: '8px 12px',
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    verticalAlign: 'top',
    whiteSpace: 'nowrap',
  },
  value: {
    padding: '8px 12px',
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.45,
    wordBreak: 'break-word',
  },
  bodyWrap: {
    border: opptrixCssVars.settingsPanelBorder,
    borderRadius: opptrixTokens.radiusMd,
    padding: '12px 14px',
    backgroundColor: opptrixCssVars.canvas,
    maxHeight: '420px',
    overflow: 'auto',
  },
  sectionTitle: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    marginBottom: '2px',
  },
  emptyBody: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
  },
})

function MetaTable({ skill }: { skill: PublicAgentSkill }) {
  const s = useStyles()
  const rows: Array<{ label: string; value: string }> = [
    { label: '名称', value: skill.name },
    { label: '说明', value: skill.description },
  ]
  if (skill.license?.trim()) rows.push({ label: '许可', value: skill.license.trim() })
  if (skill.compatibility?.trim()) {
    rows.push({ label: '兼容说明', value: skill.compatibility.trim() })
  }
  if (skill.allowedTools?.trim()) {
    rows.push({ label: '可用能力', value: skill.allowedTools.trim() })
  }
  if (skill.references?.length) {
    rows.push({ label: '参考文件', value: skill.references.join('、') })
  }

  return (
    <table className={s.table}>
      <tbody>
        {rows.map(row => (
          <tr key={row.label} className={s.row}>
            <td className={s.label}>{row.label}</td>
            <td className={s.value}>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

interface Props {
  skill: PublicAgentSkill
}

/** 内置 / 只读：元数据表格 + Markdown 正文预览 */
export default function AgentSkillPreview({ skill }: Props) {
  const s = useStyles()
  const body = skill.body?.trim() ?? ''

  return (
    <div className={s.root}>
      <div>
        <Text className={s.sectionTitle} block>基本信息</Text>
        <MetaTable skill={skill} />
      </div>
      <div>
        <Text className={s.sectionTitle} block>步骤说明</Text>
        <div className={s.bodyWrap}>
          {body ? (
            <MarkdownMessage content={body} />
          ) : (
            <Text className={s.emptyBody} block>
              这份技能还没有步骤说明。
            </Text>
          )}
        </div>
      </div>
    </div>
  )
}
