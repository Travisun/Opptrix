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
    pixelRatio: Math.min(2, window.devicePixelRatio || 1),
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
  pdf.addImage(dataUrl, 'PNG', x, y, drawW, drawH, undefined, 'FAST')
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
  drawPngContainOnCurrentPage(pdf, dataUrl, width, height)
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
