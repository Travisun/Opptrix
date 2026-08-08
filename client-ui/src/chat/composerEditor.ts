/**
 * ChatComposer contentEditable 编辑器的底层 DOM 工具。
 *
 * 设计要点：
 * - 编辑器是「非受控」的 contentEditable 容器，React 不渲染其内部内容，
 *   所有内容通过这里的命令式函数读写，避免 React 虚拟 DOM 与用户光标冲突。
 * - 股票引用是 `contenteditable=false` 的内联原子 chip：浏览器原生把它当成
 *   一个字符处理（光标可绕行、Backspace 整体删除、参与文字排版换行）。
 * - chip 自带 `data-send`（发送时展开的「名称(代码)」文本），序列化时就地替换，
 *   位置由用户在文字流中的插入点决定，后端仍收到纯文本，保持兼容。
 */

export const INLINE_CHIP_CLASS = 'opptrix-composer-inline-chip'

const CHIP_KEY_ATTR = 'data-chip-key'
const CHIP_SEND_ATTR = 'data-chip-send'

export interface InlineChipData {
  /** 去重用的唯一 key（instrument key / skill:name） */
  key: string
  /** 发送时展开的纯文本，如「贵州茅台(CN:SH.600519)」或「@skill:morning-market-brief」 */
  sendText: string
  /** 主显示文本（股票名称 / 技能名） */
  name: string
  /** 代码标签，如 CN:SH.600519；技能 chip 可省略 */
  code?: string
  /** 非 A 股时的市场短名，可选 */
  market?: string | null
}

/** 创建一个内联 chip 元素（命令式，样式走 global.css 稳定类名）。 */
export function createChipElement(data: InlineChipData): HTMLSpanElement {
  const chip = document.createElement('span')
  chip.className = INLINE_CHIP_CLASS
  chip.contentEditable = 'false'
  chip.setAttribute(CHIP_KEY_ATTR, data.key)
  chip.setAttribute(CHIP_SEND_ATTR, data.sendText)
  chip.setAttribute('data-testid', 'composer-inline-chip')
  // 视觉上不可选中内部文字，整体作为一个原子。
  const name = document.createElement('span')
  name.className = 'opptrix-composer-inline-chip__name'
  name.textContent = data.name
  chip.appendChild(name)
  if (data.market) {
    const mk = document.createElement('span')
    mk.className = 'opptrix-composer-inline-chip__code'
    mk.textContent = data.market
    chip.appendChild(mk)
  }
  if (data.code) {
    const code = document.createElement('span')
    code.className = 'opptrix-composer-inline-chip__code'
    code.textContent = data.code
    chip.appendChild(code)
  }
  return chip
}

/** 收集编辑器内现存的所有 chip key（用于去重）。 */
export function collectChipKeys(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll(`.${INLINE_CHIP_CLASS}`))
    .map(el => el.getAttribute(CHIP_KEY_ATTR) ?? '')
    .filter(Boolean)
}

/** 编辑器是否有可发送内容（有非空文字或任一 chip）。 */
export function editorHasContent(root: HTMLElement): boolean {
  if (root.querySelector(`.${INLINE_CHIP_CLASS}`)) return true
  return getSendText(root).trim().length > 0
}

/**
 * 把编辑器内容序列化为发送文本：
 * - 文本节点 → 原文
 * - chip → data-send（「名称(代码)」）
 * - <br> / 块级边界 → 换行
 */
export function getSendText(root: HTMLElement): string {
  let out = ''
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? ''
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const el = child as HTMLElement
      if (el.classList.contains(INLINE_CHIP_CLASS)) {
        out += el.getAttribute(CHIP_SEND_ATTR) ?? ''
        continue
      }
      if (el.tagName === 'BR') {
        out += '\n'
        continue
      }
      // 块级元素（Chromium 换行会生成 <div>）前补换行。
      const isBlock = el.tagName === 'DIV' || el.tagName === 'P'
      if (isBlock && out.length > 0 && !out.endsWith('\n')) out += '\n'
      walk(el)
    }
  }
  walk(root)
  return out
}

/**
 * 空编辑器 DOM 归一：去掉 Chromium 清空后残留的 `<br>` / `<div><br></div>`。
 * 有 chip 或非空发送文本时不改动。返回是否执行了清空。
 */
export function normalizeEmptyEditor(root: HTMLElement): boolean {
  if (root.querySelector(`.${INLINE_CHIP_CLASS}`)) return false
  if (getSendText(root).trim().length > 0) return false
  if (root.innerHTML === '') return false
  root.innerHTML = ''
  return true
}

/** 清空编辑器。 */
export function clearEditor(root: HTMLElement): void {
  root.innerHTML = ''
}

/** 用纯文本重置编辑器内容（丢弃所有 chip，用于草稿同步 / 快捷任务）。 */
export function setEditorText(root: HTMLElement, text: string): void {
  root.textContent = text
}

/** 让编辑器聚焦并把光标移到内容开头。 */
export function focusEditorStart(root: HTMLElement): void {
  root.focus()
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

/** 让编辑器聚焦并把光标移到内容末尾。 */
export function focusEditorEnd(root: HTMLElement): void {
  root.focus()
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

/** 当前 selection 是否落在编辑器内部。 */
function selectionInRoot(root: HTMLElement): Range | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!root.contains(range.startContainer)) return null
  return range
}

/**
 * 快照当前落在编辑器内的光标 Range（克隆，避免后续 selection 变化污染）。
 * 用于「点菜单项插入」这类会短暂扰动实时 selection 的场景：先存后用。
 */
export function captureCaretRange(root: HTMLElement): Range | null {
  return selectionInRoot(root)?.cloneRange() ?? null
}

/**
 * 读取光标所在文本节点的内容与偏移，用于 @ 提及触发检测。
 * 若光标不在文本节点（如在 chip 之间），返回空上下文。
 */
export function getCaretTextContext(root: HTMLElement): { text: string; offset: number } {
  const range = selectionInRoot(root)
  if (!range || !range.collapsed) return { text: '', offset: 0 }
  const node = range.startContainer
  if (node.nodeType === Node.TEXT_NODE) {
    return { text: node.textContent ?? '', offset: range.startOffset }
  }
  return { text: '', offset: 0 }
}

/**
 * 在光标处把触发文本（`@query` / `/query`）替换为 chip。
 * @param triggerChar 触发字符（`@` 标的 / `/` 技能）
 * @param savedRange 预先快照的光标 Range；点菜单项插入时实时 selection 不可靠，须传快照。
 * 返回是否成功插入。
 */
export function insertTriggerChip(
  root: HTMLElement,
  chip: HTMLSpanElement,
  triggerChar: '@' | '/',
  savedRange?: Range | null,
): boolean {
  const range = savedRange ?? selectionInRoot(root)
  if (!range || !range.collapsed) return false
  if (!root.contains(range.startContainer)) return false
  const node = range.startContainer
  if (node.nodeType !== Node.TEXT_NODE) return false

  const textNode = node as Text
  const text = textNode.textContent ?? ''
  const caret = range.startOffset
  const before = text.slice(0, caret)
  const triggerIndex = before.lastIndexOf(triggerChar)
  if (triggerIndex < 0) return false

  // 删除触发段。
  const deleteRange = document.createRange()
  deleteRange.setStart(textNode, triggerIndex)
  deleteRange.setEnd(textNode, caret)
  deleteRange.deleteContents()

  // 在删除点插入 chip，并在其后补一个不换行空格文本节点，方便继续输入与光标定位。
  const insertRange = document.createRange()
  insertRange.setStart(textNode, triggerIndex)
  insertRange.collapse(true)
  const spacer = document.createTextNode('\u00A0')
  insertRange.insertNode(spacer)
  insertRange.insertNode(chip)

  // 光标移到 spacer 之后。
  const sel = window.getSelection()
  if (sel) {
    const after = document.createRange()
    after.setStart(spacer, spacer.length)
    after.collapse(true)
    sel.removeAllRanges()
    sel.addRange(after)
  }
  return true
}

/** 在光标处把 `@query` 触发文本替换为 chip。 */
export function insertMentionChip(
  root: HTMLElement,
  chip: HTMLSpanElement,
  savedRange?: Range | null,
): boolean {
  return insertTriggerChip(root, chip, '@', savedRange)
}

/** 在光标处把 `/query` 触发文本替换为技能 chip。 */
export function insertSlashChip(
  root: HTMLElement,
  chip: HTMLSpanElement,
  savedRange?: Range | null,
): boolean {
  return insertTriggerChip(root, chip, '/', savedRange)
}

/**
 * 在光标处插入 chip（菜单点选等非 @ 触发场景）。
 * 无有效选区时追加到末尾。返回是否成功。
 */
export function insertChipAtCaret(
  root: HTMLElement,
  chip: HTMLSpanElement,
  savedRange?: Range | null,
): boolean {
  root.focus()
  const range = savedRange ?? selectionInRoot(root)
  const spacer = document.createTextNode('\u00A0')
  if (range && root.contains(range.startContainer)) {
    range.deleteContents()
    range.insertNode(spacer)
    range.insertNode(chip)
    const sel = window.getSelection()
    if (sel) {
      const after = document.createRange()
      after.setStart(spacer, spacer.length)
      after.collapse(true)
      sel.removeAllRanges()
      sel.addRange(after)
    }
    return true
  }
  root.appendChild(chip)
  root.appendChild(spacer)
  focusEditorEnd(root)
  return true
}

/** 在光标处插入纯文本（语音识别结果等）；无选区时追加到末尾。 */
export function insertTextAtCaret(root: HTMLElement, text: string): boolean {
  const value = text.trim()
  if (!value) return false
  root.focus()
  const range = selectionInRoot(root)
  if (range) {
    range.deleteContents()
    const node = document.createTextNode(value)
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)
    const sel = window.getSelection()
    if (sel) {
      sel.removeAllRanges()
      sel.addRange(range)
    }
    return true
  }
  // 无有效选区：追加到末尾
  const spacer = root.childNodes.length > 0 ? ' ' : ''
  root.appendChild(document.createTextNode(spacer + value))
  focusEditorEnd(root)
  return true
}

/** 在光标处插入换行（供 Shift+Enter / Ctrl+Enter）。 */
export function insertLineBreakAtCaret(root: HTMLElement): void {
  const range = selectionInRoot(root)
  if (!range) return
  // Chromium/Electron：insertLineBreak 会正确处理行尾占位 <br>。
  document.execCommand('insertLineBreak')
}
