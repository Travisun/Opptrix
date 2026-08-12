import { makeStyles, Text } from '@fluentui/react-components'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import type { PublicAgentSkill } from '../../api/client'
import { opptrixCssVars } from '../../theme/tokens'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '2px 0 0',
  },
  intro: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  description: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
  },
  metaList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  metaRow: {
    display: 'flex',
    gap: '10px',
    alignItems: 'baseline',
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.45,
  },
  metaKey: {
    flexShrink: 0,
    color: opptrixCssVars.textTertiary,
    fontWeight: 500,
    minWidth: '56px',
  },
  metaValue: {
    color: opptrixCssVars.textSecondary,
    wordBreak: 'break-word',
  },
  sectionTitle: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    letterSpacing: '0.02em',
    lineHeight: 1.4,
    marginBottom: '8px',
  },
  emptyBody: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
  },
  body: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.6,
  },
  mdH1: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    margin: '0 0 8px',
    lineHeight: 1.4,
  },
  mdH2: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    margin: '14px 0 6px',
    lineHeight: 1.4,
  },
  mdH3: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    margin: '12px 0 4px',
    lineHeight: 1.4,
  },
  mdP: {
    margin: '0 0 8px',
    lineHeight: 1.6,
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-md)',
    whiteSpace: 'pre-wrap',
  },
  mdList: {
    margin: '0 0 8px',
    paddingLeft: '1.25em',
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-md)',
    lineHeight: 1.55,
  },
  mdLi: {
    marginBottom: '4px',
  },
  mdPre: {
    margin: '0 0 10px',
    padding: '10px 12px',
    borderRadius: '8px',
    backgroundColor: opptrixCssVars.canvasAlt,
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.5,
    overflowX: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    color: opptrixCssVars.textSecondary,
    fontFamily: 'var(--opptrix-font-mono)',
  },
  mdCode: {
    fontSize: '0.92em',
    fontFamily: 'var(--opptrix-font-mono)',
    color: opptrixCssVars.textSecondary,
  },
  mdBlockquote: {
    margin: '0 0 8px',
    paddingLeft: '12px',
    borderLeft: `2px solid ${opptrixCssVars.separator}`,
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-md)',
    lineHeight: 1.55,
  },
  mdHr: {
    border: 'none',
    borderTop: `1px solid ${opptrixCssVars.separator}`,
    margin: '12px 0',
  },
  mdLink: {
    color: opptrixCssVars.accent,
    textDecoration: 'none',
  },
})

function MetaRows({ skill }: { skill: PublicAgentSkill }) {
  const s = useStyles()
  const rows: Array<{ label: string; value: string }> = []
  if (skill.license?.trim()) rows.push({ label: '许可', value: skill.license.trim() })
  if (skill.compatibility?.trim()) {
    rows.push({ label: '兼容', value: skill.compatibility.trim() })
  }
  if (skill.allowedTools?.trim()) {
    rows.push({ label: '可用能力', value: skill.allowedTools.trim() })
  }
  if (rows.length === 0) return null

  return (
    <div className={s.metaList}>
      {rows.map(row => (
        <div key={row.label} className={s.metaRow}>
          <span className={s.metaKey}>{row.label}</span>
          <span className={s.metaValue}>{row.value}</span>
        </div>
      ))}
    </div>
  )
}

function SkillBody({ content }: { content: string }) {
  const s = useStyles()
  const components: Components = {
    h1: ({ children }) => <h1 className={s.mdH1}>{children}</h1>,
    h2: ({ children }) => <h2 className={s.mdH2}>{children}</h2>,
    h3: ({ children }) => <h3 className={s.mdH3}>{children}</h3>,
    h4: ({ children }) => <h3 className={s.mdH3}>{children}</h3>,
    h5: ({ children }) => <h3 className={s.mdH3}>{children}</h3>,
    h6: ({ children }) => <h3 className={s.mdH3}>{children}</h3>,
    p: ({ children }) => <p className={s.mdP}>{children}</p>,
    ul: ({ children }) => <ul className={s.mdList}>{children}</ul>,
    ol: ({ children }) => <ol className={s.mdList}>{children}</ol>,
    li: ({ children }) => <li className={s.mdLi}>{children}</li>,
    blockquote: ({ children }) => <blockquote className={s.mdBlockquote}>{children}</blockquote>,
    hr: () => <hr className={s.mdHr} />,
    pre: ({ children }) => <pre className={s.mdPre}>{children}</pre>,
    code: ({ children }) => <code className={s.mdCode}>{children}</code>,
    a: ({ children, href }) => (
      <a className={s.mdLink} href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    ),
    img: () => null,
  }

  return (
    <div className={s.body}>
      {/* 仅标题/列表/段落等基础节点；无 GFM 表格卡、无数学/HTML 重渲染 */}
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </div>
  )
}

interface Props {
  skill: PublicAgentSkill
}

/** 内置 / 只读：说明与克制的步骤正文（名称由 DialogTitle 展示，此处不重复） */
export default function AgentSkillPreview({ skill }: Props) {
  const s = useStyles()
  const body = skill.body?.trim() ?? ''
  const description = skill.description?.trim() ?? ''

  return (
    <div className={s.root}>
      {(description || Boolean(skill.license?.trim() || skill.compatibility?.trim() || skill.allowedTools?.trim())) ? (
        <div className={s.intro}>
          {description ? (
            <Text className={s.description} block>{description}</Text>
          ) : null}
          <MetaRows skill={skill} />
        </div>
      ) : null}

      <div>
        <Text className={s.sectionTitle} block>步骤说明</Text>
        {body ? (
          <SkillBody content={body} />
        ) : (
          <Text className={s.emptyBody} block>
            这份技能还没有步骤说明。
          </Text>
        )}
      </div>
    </div>
  )
}
