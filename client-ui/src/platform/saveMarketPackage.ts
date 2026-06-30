import { isElectron } from './detect'

export type ExportDestination =
  | { kind: 'electron'; dirPath: string }
  | { kind: 'fs-handle'; dirHandle: FileSystemDirectoryHandle }
  | { kind: 'download' }

export interface ExportPackageResult {
  filename: string
  displayPath: string
  bytes: number
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatExportResultMessage(result: ExportPackageResult): string {
  return `导出完成：${result.displayPath}（${formatBytes(result.bytes)}）`
}

/** 先选导出位置；返回 null 表示用户取消。 */
export async function pickExportDestination(): Promise<ExportDestination | null> {
  if (isElectron() && window.electronAPI?.pickExportDirectory) {
    const dirPath = await window.electronAPI.pickExportDirectory()
    if (!dirPath) return null
    return { kind: 'electron', dirPath }
  }

  if (typeof window.showDirectoryPicker === 'function') {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
      return { kind: 'fs-handle', dirHandle }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null
      throw e
    }
  }

  return { kind: 'download' }
}

export async function saveMarketPackageBlob(
  blob: Blob,
  filename: string,
  destination: ExportDestination,
): Promise<ExportPackageResult> {
  const bytes = blob.size

  if (destination.kind === 'electron') {
    if (!window.electronAPI?.writeBinaryFile) {
      throw new Error('当前环境不支持写入所选文件夹')
    }
    const buffer = await blob.arrayBuffer()
    const filePath = await window.electronAPI.writeBinaryFile({
      dirPath: destination.dirPath,
      filename,
      data: buffer,
    })
    return { filename, displayPath: filePath, bytes }
  }

  if (destination.kind === 'fs-handle') {
    const fileHandle = await destination.dirHandle.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(blob)
    await writable.close()
    const folder = destination.dirHandle.name
    return { filename, displayPath: `${folder}/${filename}`, bytes }
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  return { filename, displayPath: filename, bytes }
}
