import { isElectron } from './detect'
import { sanitizeSessionFilename } from '../chat/sessionExportMarkdown'

export interface SaveTextFileResult {
  filePath: string
  bytes: number
}

/** 弹出保存对话框并将文本写入所选路径；用户取消时返回 null */
export async function saveTextFileWithDialog(
  text: string,
  suggestedFilename: string,
): Promise<SaveTextFileResult | null> {
  const safeName = `${sanitizeSessionFilename(suggestedFilename.replace(/\.md$/i, ''))}.md`
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })

  if (isElectron() && window.electronAPI?.pickSaveFile && window.electronAPI?.writeTextFile) {
    const filePath = await window.electronAPI.pickSaveFile({
      defaultPath: safeName,
      title: '导出对话',
    })
    if (!filePath) return null
    const savedPath = await window.electronAPI.writeTextFile({ filePath, text })
    return { filePath: savedPath, bytes: new TextEncoder().encode(text).length }
  }

  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: safeName,
        types: [{
          description: 'Markdown',
          accept: { 'text/markdown': ['.md'] },
        }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return { filePath: handle.name, bytes: blob.size }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null
      throw e
    }
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = safeName
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  return { filePath: safeName, bytes: blob.size }
}
