import { makeStyles, mergeClasses } from '@fluentui/react-components'

const MAX_EXT_LEN = 10

export function splitFilename(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.')
  if (dot > 0 && name.length - dot <= MAX_EXT_LEN) {
    return { base: name.slice(0, dot), ext: name.slice(dot) }
  }
  return { base: name, ext: '' }
}

const useStyles = makeStyles({
  root: {
    display: 'inline-flex',
    minWidth: 0,
    maxWidth: '100%',
    alignItems: 'baseline',
  },
  base: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  ext: {
    flexShrink: 0,
  },
})

interface Props {
  name: string
  className?: string
  /** 悬停提示，默认完整文件名 */
  title?: string
}

export default function FilenameEllipsis({ name, className, title }: Props) {
  const s = useStyles()
  const { base, ext } = splitFilename(name)
  const tooltip = title ?? name

  return (
    <span className={mergeClasses(s.root, className)} title={tooltip}>
      <span className={s.base}>{base}</span>
      {ext ? <span className={s.ext}>{ext}</span> : null}
    </span>
  )
}
