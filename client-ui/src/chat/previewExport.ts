/**
 * Shared PNG / PDF export helpers for canvas & mindmap preview hosts.
 */
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'

function baseName(name: string): string {
  const trimmed = name.trim() || 'export'
  return trimmed.replace(/\.[^.]+$/, '') || 'export'
}

function triggerDownload(href: string, filename: string): void {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function loadImageNaturalSize(
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      reject(new Error('Failed to load export image'))
    }
    img.src = dataUrl
  })
}

/** Capture element at full scroll size so horizontally overflowed content is included. */
async function captureElementPngDataUrl(el: HTMLElement): Promise<string> {
  const width = Math.max(el.scrollWidth, el.offsetWidth, 1)
  const height = Math.max(el.scrollHeight, el.offsetHeight, 1)
  return toPng(el, {
    cacheBust: true,
    pixelRatio: Math.min(3, Math.max(2, window.devicePixelRatio || 1)),
    backgroundColor: '#ffffff',
    width,
    height,
  })
}

/** Draw a PNG data URL onto the current PDF page with contain (aspect preserved + margin). */
function drawPngContainOnCurrentPage(
  pdf: jsPDF,
  dataUrl: string,
  widthPx: number,
  heightPx: number,
): void {
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 8
  const maxW = pageW - margin * 2
  const maxH = pageH - margin * 2
  const imgAspect = widthPx / heightPx
  const boxAspect = maxW / maxH

  let drawW: number
  let drawH: number
  if (imgAspect > boxAspect) {
    drawW = maxW
    drawH = maxW / imgAspect
  } else {
    drawH = maxH
    drawW = maxH * imgAspect
  }

  const x = (pageW - drawW) / 2
  const y = (pageH - drawH) / 2
  pdf.addImage(dataUrl, 'PNG', x, y, drawW, drawH, undefined, 'NONE')
}

/**
 * 长图多页切分计划（纯函数，便于单测）。
 * 按页宽等比缩放后，纵向按可绘高度切片；返回源图像素坐标系下的切片。
 */
export function planLongImagePdfSlices(
  widthPx: number,
  heightPx: number,
  opts?: { pageWidthMm?: number; pageHeightMm?: number; marginMm?: number },
): { pageWidthMm: number; pageHeightMm: number; marginMm: number; slices: Array<{ y: number; height: number }> } {
  const pageWidthMm = opts?.pageWidthMm ?? 210
  const pageHeightMm = opts?.pageHeightMm ?? 297
  const marginMm = opts?.marginMm ?? 8
  const maxW = Math.max(pageWidthMm - marginMm * 2, 1)
  const maxH = Math.max(pageHeightMm - marginMm * 2, 1)

  if (widthPx <= 0 || heightPx <= 0) {
    return { pageWidthMm, pageHeightMm, marginMm, slices: [] }
  }

  // 等比缩放到页宽后，一页可容纳的源图像素高度
  const scale = maxW / widthPx
  const pageContentHeightPx = Math.max(1, Math.floor(maxH / scale))

  const slices: Array<{ y: number; height: number }> = []
  let y = 0
  while (y < heightPx) {
    const h = Math.min(pageContentHeightPx, heightPx - y)
    slices.push({ y, height: h })
    y += h
  }
  return { pageWidthMm, pageHeightMm, marginMm, slices }
}

async function slicePngDataUrl(
  dataUrl: string,
  widthPx: number,
  sliceY: number,
  sliceHeight: number,
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Failed to load export image'))
    el.src = dataUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(widthPx))
  canvas.height = Math.max(1, Math.floor(sliceHeight))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(
    img,
    0,
    sliceY,
    widthPx,
    sliceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  return canvas.toDataURL('image/png')
}

export async function exportElementPng(
  el: HTMLElement,
  filename: string,
): Promise<void> {
  const dataUrl = await captureElementPngDataUrl(el)
  triggerDownload(dataUrl, `${baseName(filename)}.png`)
}

/**
 * PDF: one page per `[data-opptrix-page]`, else a single page from the root element.
 * Each page uses contain layout (aspect preserved + margin) — same as mindmap export.
 */
export async function exportElementPdf(
  el: HTMLElement,
  filename: string,
): Promise<void> {
  const pages = Array.from(el.querySelectorAll<HTMLElement>('[data-opptrix-page]'))
  const targets = pages.length > 0 ? pages : [el]
  let pdf: jsPDF | null = null

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]
    const dataUrl = await captureElementPngDataUrl(target)
    const { width, height } = await loadImageNaturalSize(dataUrl)
    if (width <= 0 || height <= 0) {
      throw new Error('Invalid export image size')
    }
    const orientation = width >= height ? 'landscape' : 'portrait'
    if (!pdf) {
      pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation })
    } else {
      pdf.addPage('a4', orientation)
    }
    drawPngContainOnCurrentPage(pdf, dataUrl, width, height)
  }

  if (!pdf) {
    throw new Error('No export targets')
  }
  pdf.save(`${baseName(filename)}.pdf`)
}

/** Capture mind-elixir board (`mind.nodes`) as PNG data URL — full scroll size, no chrome. */
export async function captureMindmapBoardPngDataUrl(
  nodesEl: HTMLElement,
  backgroundColor: string,
): Promise<string> {
  const width = Math.max(nodesEl.scrollWidth, nodesEl.offsetWidth, 1)
  const height = Math.max(nodesEl.scrollHeight, nodesEl.offsetHeight, 1)
  return toPng(nodesEl, {
    cacheBust: true,
    pixelRatio: 3,
    backgroundColor,
    width,
    height,
  })
}

/** Download mindmap board PNG only (nodes root, not container/toolbars). */
export async function exportMindmapBoardPng(
  nodesEl: HTMLElement,
  filename: string,
  backgroundColor: string,
): Promise<void> {
  const dataUrl = await captureMindmapBoardPngDataUrl(nodesEl, backgroundColor)
  triggerDownload(dataUrl, `${baseName(filename)}.png`)
}

/**
 * Place a PNG data URL onto A4 PDF.
 * 单页可容纳（contain）时一页；过长则按页宽等比缩放后纵向切多页。
 */
export async function exportPngDataUrlToPdf(
  dataUrl: string,
  filename: string,
): Promise<void> {
  const { width, height } = await loadImageNaturalSize(dataUrl)
  if (width <= 0 || height <= 0) {
    throw new Error('Invalid export image size')
  }

  const pageWidthMm = 210
  const pageHeightMm = 297
  const marginMm = 8
  const maxW = pageWidthMm - marginMm * 2
  const maxH = pageHeightMm - marginMm * 2

  // 宽图：单页 landscape contain；否则 portrait，必要时长图切页
  if (width >= height) {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
    drawPngContainOnCurrentPage(pdf, dataUrl, width, height)
    pdf.save(`${baseName(filename)}.pdf`)
    return
  }

  const fittedH = (height / width) * maxW
  if (fittedH <= maxH) {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    drawPngContainOnCurrentPage(pdf, dataUrl, width, height)
    pdf.save(`${baseName(filename)}.pdf`)
    return
  }

  const { slices } = planLongImagePdfSlices(width, height, {
    pageWidthMm,
    pageHeightMm,
    marginMm,
  })
  if (slices.length === 0) {
    throw new Error('Invalid export image size')
  }

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i]
    if (i > 0) pdf.addPage('a4', 'portrait')
    const sliceUrl = await slicePngDataUrl(dataUrl, width, slice.y, slice.height)
    const drawW = maxW
    const drawH = (slice.height / width) * maxW
    const x = marginMm
    const y = marginMm
    pdf.addImage(sliceUrl, 'PNG', x, y, drawW, Math.min(drawH, maxH), undefined, 'NONE')
  }
  pdf.save(`${baseName(filename)}.pdf`)
}

/** Export mindmap board as PDF via board PNG → contain layout. */
export async function exportMindmapBoardPdf(
  nodesEl: HTMLElement,
  filename: string,
  backgroundColor: string,
): Promise<void> {
  const dataUrl = await captureMindmapBoardPngDataUrl(nodesEl, backgroundColor)
  await exportPngDataUrlToPdf(dataUrl, filename)
}

/** Download a PNG blob (e.g. from server fullPage export). */
export function downloadPngBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob)
  try {
    triggerDownload(href, `${baseName(filename)}.png`)
  } finally {
    URL.revokeObjectURL(href)
  }
}

/** Convert PNG blob → multi-page PDF download. */
export async function exportPngBlobToPdf(blob: Blob, filename: string): Promise<void> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Failed to read export image'))
    }
    reader.onerror = () => reject(new Error('Failed to read export image'))
    reader.readAsDataURL(blob)
  })
  await exportPngDataUrlToPdf(dataUrl, filename)
}
