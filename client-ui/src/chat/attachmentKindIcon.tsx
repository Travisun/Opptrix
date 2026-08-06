import type { ReactElement } from 'react'
import {
  DocumentDataRegular,
  DocumentPdfRegular,
  DocumentRegular,
  DocumentTextRegular,
  ImageRegular,
  MusicNote2Regular,
  SlideTextRegular,
  VideoRegular,
} from '@fluentui/react-icons'
import type { MediaKind } from '../types/chat'

function extOfFilename(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return ''
  return name.slice(dot).toLowerCase()
}

function documentIconByExt(ext: string, fontSize: number): ReactElement {
  if (ext === '.txt' || ext === '.log' || ext === '.md' || ext === '.markdown') {
    return <DocumentTextRegular fontSize={fontSize} />
  }
  if (ext === '.csv' || ext === '.json' || ext === '.xml') {
    return <DocumentDataRegular fontSize={fontSize} />
  }
  if (ext === '.docx' || ext === '.doc') {
    return <DocumentRegular fontSize={fontSize} />
  }
  if (ext === '.pptx' || ext === '.ppt') {
    return <SlideTextRegular fontSize={fontSize} />
  }
  return <DocumentRegular fontSize={fontSize} />
}

/** 附件 kind + 文件名 → Fluent 图标（消息条 / 输入条 / 预览头共用） */
export function attachmentKindIcon(
  kind: MediaKind,
  name: string,
  fontSize = 18,
): ReactElement {
  switch (kind) {
    case 'pdf':
      return <DocumentPdfRegular fontSize={fontSize} />
    case 'image':
      return <ImageRegular fontSize={fontSize} />
    case 'video':
      return <VideoRegular fontSize={fontSize} />
    case 'audio':
      return <MusicNote2Regular fontSize={fontSize} />
    case 'document':
    case 'text':
      return documentIconByExt(extOfFilename(name), fontSize)
    default:
      return <DocumentRegular fontSize={fontSize} />
  }
}
