import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Spinner,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import { DeleteRegular, EditRegular } from '@fluentui/react-icons'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { getExpert } from '../../api/client'
import type { ExpertCatalogEntry, ExpertDefinition } from '../../types/chat'
import ExpertIconTile from './ExpertIconTile'

const useStyles = makeStyles({
  surface: {
    maxWidth: '480px',
    width: 'min(480px, calc(100vw - 32px))',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  head: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  headText: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  title: {
    fontSize: 'var(--opptrix-font-lg)',
    fontWeight: 650,
    color: 'var(--opptrix-text-primary)',
  },
  summary: {
    fontSize: 'var(--opptrix-font-sm)',
    color: 'var(--opptrix-text-secondary)',
    lineHeight: 1.55,
  },
  sectionLabel: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    color: 'var(--opptrix-text-tertiary)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  persona: {
    fontSize: 'var(--opptrix-font-sm)',
    color: 'var(--opptrix-text-primary)',
    lineHeight: 1.65,
    whiteSpace: 'pre-wrap',
    maxHeight: '220px',
    overflowY: 'auto',
  },
  tags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  tag: {
    fontSize: 'var(--opptrix-font-xs)',
    color: 'var(--opptrix-text-tertiary)',
    backgroundColor: 'var(--opptrix-surface-muted)',
    borderRadius: '6px',
    padding: '2px 8px',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '4px',
  },
  error: {
    color: 'var(--opptrix-error)',
    fontSize: 'var(--opptrix-font-sm)',
  },
})

function isPersonal(expert: ExpertCatalogEntry | ExpertDefinition) {
  return expert.source === 'local'
}

interface Props {
  open: boolean
  expert: ExpertCatalogEntry | null
  onOpenChange: (open: boolean) => void
  onChat: (expertId: string) => void
  onEdit?: (expertId: string) => void
  onDelete?: (expert: ExpertCatalogEntry) => void
}

export default function ExpertDetailDialog({
  open,
  expert,
  onOpenChange,
  onChat,
  onEdit,
  onDelete,
}: Props) {
  const s = useStyles()
  const [detail, setDetail] = useState<ExpertDefinition | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !expert) {
      setDetail(null)
      setError('')
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    void getExpert(expert.id)
      .then(({ expert: full }) => {
        if (!cancelled) setDetail(full)
      })
      .catch(e => {
        if (!cancelled) {
          setDetail(null)
          setError(e instanceof Error ? e.message : '暂时无法加载详情')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [open, expert])

  if (!expert) return null

  const personal = isPersonal(expert)
  const summary = detail?.summary ?? expert.summary
  const tags = detail?.tags ?? expert.tags
  const persona = detail?.persona

  return (
    <Dialog open={open} onOpenChange={(_, data) => onOpenChange(data.open)}>
      <DialogSurface className={mergeClasses(s.surface, 'opptrix-dialog-surface')}>
        <DialogBody>
          <DialogTitle>专家详情</DialogTitle>
          <DialogContent className={s.body}>
            <div className={s.head}>
              <ExpertIconTile expertId={expert.id} size="lg" personal={personal} />
              <div className={s.headText}>
                <Text className={s.title} block>{expert.title}</Text>
                <Text className={s.summary} block>{summary}</Text>
              </div>
            </div>

            {loading ? (
              <Spinner size="tiny" label="正在加载…" />
            ) : (
              <>
                {error && <Text className={s.error}>{error}</Text>}
                {persona && (
                  <>
                    <Text className={s.sectionLabel} block>回答风格</Text>
                    <Text className={s.persona} block>{persona}</Text>
                  </>
                )}
                {tags.length > 0 && (
                  <>
                    <Text className={s.sectionLabel} block>标签</Text>
                    <div className={s.tags}>
                      {tags.map(tag => (
                        <span key={tag} className={s.tag}>{tag}</span>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            <div className={s.actions}>
              {personal && onDelete && (
                <OpptrixButton
                  variant="ghost"
                  icon={<DeleteRegular />}
                  onClick={() => onDelete(expert)}
                >
                  删除
                </OpptrixButton>
              )}
              {personal && onEdit && (
                <OpptrixButton
                  variant="secondary"
                  icon={<EditRegular />}
                  onClick={() => onEdit(expert.id)}
                >
                  编辑
                </OpptrixButton>
              )}
              <OpptrixButton
                variant="primary"
                onClick={() => {
                  onOpenChange(false)
                  onChat(expert.id)
                }}
              >
                开始聊天
              </OpptrixButton>
            </div>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
