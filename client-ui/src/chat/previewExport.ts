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

export async function exportElementPng(
  el: HTMLElement,
  filename: string,
): Promise<void> {
  const dataUrl = await toPng(el, {
    cacheBust: true,
    pixelRatio: Math.min(2, window.devicePixelRatio || 1),
    backgroundColor: '#ffffff',
  })
  triggerDownload(dataUrl, `${baseName(filename)}.png`)
}

/**
 * PDF MVP: one page per `[data-opptrix-page]`, else a single page from the root element.
 */
export async function exportElementPdf(
  el: HTMLElement,
  filename: string,
): Promise<void> {
  const pages = Array.from(el.querySelectorAll<HTMLElement>('[data-opptrix-page]'))
  const targets = pages.length > 0 ? pages : [el]
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 8

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]
    const dataUrl = await toPng(target, {
      cacheBust: true,
      pixelRatio: Math.min(2, window.devicePixelRatio || 1),
      backgroundColor: '#ffffff',
    })
    if (i > 0) pdf.addPage()
    const imgW = pageW - margin * 2
    const imgH = pageH - margin * 2
    pdf.addImage(dataUrl, 'PNG', margin, margin, imgW, imgH, undefined, 'FAST')
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
    pixelRatio: 2,
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
 * Place a PNG data URL onto a single A4 page with contain (aspect preserved + margin).
 * Orientation follows the image aspect ratio.
 */
export async function exportPngDataUrlToPdf(
  dataUrl: string,
  filename: string,
): Promise<void> {
  const { width, height } = await loadImageNaturalSize(dataUrl)
  if (width <= 0 || height <= 0) {
    throw new Error('Invalid export image size')
  }

  const orientation = width >= height ? 'landscape' : 'portrait'
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 8
  const maxW = pageW - margin * 2
  const maxH = pageH - margin * 2
  const imgAspect = width / height
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
  pdf.addImage(dataUrl, 'PNG', x, y, drawW, drawH, undefined, 'FAST')
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
