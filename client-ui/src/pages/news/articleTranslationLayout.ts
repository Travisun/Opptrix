import { articleLikelyNeedsChineseTranslation, sanitizeFeedHtml } from './newsUtils'

export type TranslationBlock = {
  id: string
  text: string
  kind?: 'text' | 'html'
}

export type ArticleTranslationMode = 'blocks' | 'inline' | 'html' | 'plain'

export type ArticleTranslationPrepareResult = {
  mode: ArticleTranslationMode
  blocks: TranslationBlock[]
}

export type ArticleReaderViewMode = 'original' | 'translated'

const BLOCK_SELECTOR = [
  'p',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'figcaption',
  'td',
  'th',
  'dd',
  'dt',
  'pre',
  'summary',
  'div',
].join(', ')

const SKIP_INLINE_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'SVG', 'IMG', 'VIDEO', 'AUDIO', 'PICTURE'])

const BLOCK_ID_ATTR = 'data-opptrix-block-id'
const ORIGINAL_HTML_ATTR = 'data-opptrix-original-html'
const MODE_ATTR = 'data-opptrix-translation-mode'
const BLOCK_CLASS = 'opptrix-translatable-block'
const MIN_BLOCK_CHARS = 8
const PLAIN_CHUNK_CHARS = 720

function normalizeBlockText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getBlockPlainText(el: HTMLElement): string {
  return normalizeBlockText(el.innerText || el.textContent || '')
}

function isLeafBlock(el: Element): boolean {
  return !el.querySelector(BLOCK_SELECTOR)
}

function isMediaOnlyBlock(el: HTMLElement): boolean {
  const hasMedia = Boolean(el.querySelector('img, video, picture, audio, svg, iframe, source'))
  if (!hasMedia) return false
  return getBlockPlainText(el).length < MIN_BLOCK_CHARS
}

function shouldTranslateText(text: string): boolean {
  const normalized = normalizeBlockText(text)
  if (!normalized || normalized.length < MIN_BLOCK_CHARS) return false
  return articleLikelyNeedsChineseTranslation(normalized)
}

function shouldTranslateBlock(el: HTMLElement): boolean {
  if (isMediaOnlyBlock(el)) return false
  return shouldTranslateText(getBlockPlainText(el))
}

function getTranslatableBlocks(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR))
    .filter(isLeafBlock)
    .filter(el => !isMediaOnlyBlock(el))
}

function markBlockElement(el: HTMLElement, id: string, blocks: TranslationBlock[], text: string, kind: 'text' | 'html' = 'text'): void {
  if (!el.hasAttribute(ORIGINAL_HTML_ATTR)) {
    el.setAttribute(ORIGINAL_HTML_ATTR, kind === 'html' ? el.outerHTML : el.innerHTML)
  }
  el.setAttribute(BLOCK_ID_ATTR, id)
  el.classList.add(BLOCK_CLASS)
  blocks.push({ id, text, kind })
}

function collectBlockSegments(root: HTMLElement): TranslationBlock[] {
  const blocks: TranslationBlock[] = []
  for (const el of getTranslatableBlocks(root)) {
    if (!shouldTranslateBlock(el)) continue
    markBlockElement(el, String(blocks.length), blocks, getBlockPlainText(el), 'text')
  }
  return blocks
}

/** Leaf inline elements (span, a, strong, …) when block-level extraction finds nothing. */
function collectInlineTextSegments(root: HTMLElement): TranslationBlock[] {
  const blocks: TranslationBlock[] = []
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('*'))
    .filter(el => el.children.length === 0)
    .filter(el => !SKIP_INLINE_TAGS.has(el.tagName))
    .filter(el => !el.hasAttribute(BLOCK_ID_ATTR))
    .filter(el => shouldTranslateText(el.textContent || ''))

  for (const el of candidates) {
    if (el.closest(`[${BLOCK_ID_ATTR}]`)) continue
    markBlockElement(el, String(blocks.length), blocks, normalizeBlockText(el.textContent || ''), 'text')
  }
  return blocks
}

/** Send HTML fragments to the model when structure cannot be segmented as text blocks. */
function collectHtmlDocumentSegments(root: HTMLElement): TranslationBlock[] {
  const blocks: TranslationBlock[] = []
  const children = Array.from(root.children).filter(child => child instanceof HTMLElement) as HTMLElement[]

  const markHtmlElement = (el: HTMLElement, sourceHtml: string) => {
    if (!shouldTranslateText(el.innerText || el.textContent || '')) return
    const id = String(blocks.length)
    markBlockElement(el, id, blocks, sourceHtml, 'html')
  }

  if (children.length === 0) {
    const html = root.innerHTML.trim()
    if (!html || !shouldTranslateText(root.innerText || root.textContent || '')) return blocks
    if (!root.hasAttribute(ORIGINAL_HTML_ATTR)) {
      root.setAttribute(ORIGINAL_HTML_ATTR, html)
    }
    root.setAttribute(BLOCK_ID_ATTR, '0')
    blocks.push({ id: '0', text: html, kind: 'html' })
    return blocks
  }

  for (const child of children) {
    if (child.hasAttribute(BLOCK_ID_ATTR)) continue
    markHtmlElement(child, child.outerHTML)
  }
  return blocks
}

function splitPlainBodySegments(text: string): TranslationBlock[] {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const chunks: string[] = []
  if (normalized.length <= PLAIN_CHUNK_CHARS) {
    chunks.push(normalized)
  } else {
    const paragraphs = normalized.split(/\n{2,}/).map(part => part.trim()).filter(Boolean)
    let buffer = ''

    const flush = () => {
      if (!buffer.trim()) return
      chunks.push(buffer.trim())
      buffer = ''
    }

    for (const paragraph of paragraphs) {
      if (paragraph.length > PLAIN_CHUNK_CHARS) {
        flush()
        let rest = paragraph
        while (rest.length > PLAIN_CHUNK_CHARS) {
          let cut = rest.lastIndexOf(' ', PLAIN_CHUNK_CHARS)
          if (cut < PLAIN_CHUNK_CHARS * 0.5) cut = PLAIN_CHUNK_CHARS
          chunks.push(rest.slice(0, cut).trim())
          rest = rest.slice(cut).trim()
        }
        if (rest) buffer = rest
        continue
      }

      const next = buffer ? `${buffer}\n\n${paragraph}` : paragraph
      if (next.length > PLAIN_CHUNK_CHARS) {
        flush()
        buffer = paragraph
      } else {
        buffer = next
      }
    }
    flush()
    if (!chunks.length) chunks.push(normalized)
  }

  return chunks
    .filter(chunk => shouldTranslateText(chunk))
    .map((text, index) => ({ id: String(index), text, kind: 'text' as const }))
}

/**
 * Prepare translation segments with fallbacks:
 * 1. block-level DOM segments (preserve media/layout)
 * 2. inline leaf text elements
 * 3. HTML fragments for the model (preserve tags, translate readable text)
 * 4. plain-text chunks when the reader has no usable DOM structure
 */
export function prepareArticleTranslation(root: HTMLElement, plainBody: string): ArticleTranslationPrepareResult {
  clearTranslationMarks(root)

  let blocks = collectBlockSegments(root)
  if (blocks.length) {
    root.setAttribute(MODE_ATTR, 'blocks')
    return { mode: 'blocks', blocks }
  }

  blocks = collectInlineTextSegments(root)
  if (blocks.length) {
    root.setAttribute(MODE_ATTR, 'inline')
    return { mode: 'inline', blocks }
  }

  blocks = collectHtmlDocumentSegments(root)
  if (blocks.length) {
    root.setAttribute(MODE_ATTR, 'html')
    return { mode: 'html', blocks }
  }

  blocks = splitPlainBodySegments(plainBody)
  if (blocks.length) {
    root.setAttribute(MODE_ATTR, 'plain')
    if (!root.hasAttribute(ORIGINAL_HTML_ATTR)) {
      root.setAttribute(ORIGINAL_HTML_ATTR, root.innerHTML)
    }
    return { mode: 'plain', blocks }
  }

  return { mode: 'plain', blocks: [] }
}

/** @deprecated Use prepareArticleTranslation */
export function prepareTranslationBlocks(root: HTMLElement): TranslationBlock[] {
  return prepareArticleTranslation(root, getBlockPlainText(root)).blocks
}

export function clearTranslationMarks(root: ParentNode): void {
  if (root instanceof HTMLElement) {
    root.removeAttribute(MODE_ATTR)
    if (root.hasAttribute(BLOCK_ID_ATTR)) {
      root.removeAttribute(BLOCK_ID_ATTR)
      root.removeAttribute(ORIGINAL_HTML_ATTR)
      root.classList.remove(BLOCK_CLASS)
    }
  }

  root.querySelectorAll(`[${BLOCK_ID_ATTR}]`).forEach(el => {
    el.removeAttribute(BLOCK_ID_ATTR)
    el.removeAttribute(ORIGINAL_HTML_ATTR)
    el.classList.remove(BLOCK_CLASS)
  })
}

function restoreBlockOriginal(el: HTMLElement, kind: 'text' | 'html' = 'text'): void {
  const original = el.getAttribute(ORIGINAL_HTML_ATTR)
  if (original == null) return

  if (kind === 'html' && el.hasAttribute(MODE_ATTR)) {
    el.innerHTML = original
    return
  }

  if (kind === 'html' && el.parentElement) {
    el.outerHTML = original
    return
  }

  el.innerHTML = original
}

function applyBlockTranslation(el: HTMLElement, translated: string, kind: 'text' | 'html' = 'text'): void {
  if (kind === 'html' && el.hasAttribute(MODE_ATTR)) {
    el.innerHTML = sanitizeFeedHtml(translated)
    return
  }

  if (kind === 'html') {
    el.outerHTML = sanitizeFeedHtml(translated)
    return
  }

  const media = Array.from(el.querySelectorAll('img, video, picture, audio, svg, iframe'))
  const hasInlineMarkup = Boolean(el.querySelector('a, strong, em, b, i, code, mark, br'))

  if (media.length === 0 && !hasInlineMarkup) {
    el.textContent = translated
    return
  }

  if (media.length > 0 && !hasInlineMarkup && getBlockPlainText(el).length > 0) {
    const toRemove: ChildNode[] = []
    el.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        toRemove.push(node)
      }
    })
    toRemove.forEach(node => node.remove())

    const textNode = document.createTextNode(translated)
    if (media[0]) {
      el.insertBefore(textNode, media[0])
    } else {
      el.appendChild(textNode)
    }
    return
  }

  el.textContent = translated
}

function applyPlainDocumentTranslation(
  root: HTMLElement,
  viewMode: ArticleReaderViewMode,
  translated: Record<string, string>,
  layout: ArticleTranslationPrepareResult | null | undefined,
): void {
  if (viewMode === 'original') {
    const original = root.getAttribute(ORIGINAL_HTML_ATTR)
    if (original != null) root.innerHTML = original
    return
  }

  const blocks = layout?.blocks ?? []
  if (!blocks.length) return

  const parts = blocks.map(block => translated[block.id] ?? block.text).filter(Boolean)
  if (!parts.length) return

  root.innerHTML = parts.map(part => `<p>${escapeHtml(part)}</p>`).join('')
}

/** Switch reader between original HTML blocks and in-place translated text. */
export function applyReaderTranslationView(
  root: HTMLElement,
  mode: ArticleReaderViewMode,
  translated: Record<string, string>,
  layout?: ArticleTranslationPrepareResult | null,
): void {
  const translationMode = layout?.mode ?? root.getAttribute(MODE_ATTR) ?? 'blocks'

  if (translationMode === 'plain') {
    applyPlainDocumentTranslation(root, mode, translated, layout)
    return
  }

  if (mode === 'original') {
    root.querySelectorAll<HTMLElement>(`[${BLOCK_ID_ATTR}]`).forEach(el => {
      const id = el.getAttribute(BLOCK_ID_ATTR)
      const kind = layout?.blocks.find(block => block.id === id)?.kind
        ?? (translationMode === 'html' ? 'html' : 'text')
      restoreBlockOriginal(el, kind)
    })
    return
  }

  const blocks = root.querySelectorAll<HTMLElement>(`[${BLOCK_ID_ATTR}]`)
  blocks.forEach(el => {
    const id = el.getAttribute(BLOCK_ID_ATTR)
    if (!id) return

    const text = translated[id]
    if (!text) return

    const kind = layout?.blocks.find(block => block.id === id)?.kind
      ?? (translationMode === 'html' ? 'html' : 'text')

    applyBlockTranslation(el, text, kind)
  })
}

export function blocksToMap(blocks: Array<{ id: string; text: string }>): Record<string, string> {
  const map: Record<string, string> = {}
  for (const block of blocks) map[block.id] = block.text
  return map
}
