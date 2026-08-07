/**
 * Compile Agent canvas TSX into a React component (same-window MVP).
 *
 * Security boundary (MVP — not a sandbox):
 * - Only allows imports from `react`, `react-dom` / `react-dom/client`, `@opptrix/canvas`
 * - `@opptrix/canvas` bindings are curated components only (Surface / Stack / Stat / Table / …)
 * - Host must load `@opptrix/canvas/styles.css`; theme via preview-root `data-theme`
 * - Executes via `new Function` in the host window after Sucrase transform
 * - Prefer iframe sandbox in a follow-up; do not load untrusted third-party sources
 */
import * as React from 'react'
import * as Canvas from '@opptrix/canvas'
import { transform } from 'sucrase'
import type { ComponentType } from 'react'

const ALLOWED_MODULES = new Set([
  'react',
  'react-dom',
  'react-dom/client',
  '@opptrix/canvas',
])

const IMPORT_STMT =
  /^\s*import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]\s*;?\s*/gm

export type CompileCanvasResult =
  | { ok: true; Component: ComponentType }
  | { ok: false; error: string }

function stripAndValidateImports(source: string): { stripped: string; error?: string } {
  const modules: string[] = []
  const stripped = source.replace(IMPORT_STMT, (_full, mod: string) => {
    modules.push(mod)
    return '\n'
  })

  for (const mod of modules) {
    if (!ALLOWED_MODULES.has(mod)) {
      return {
        stripped,
        error: `不允许引入「${mod}」，仅支持 react 与画布组件库`,
      }
    }
  }

  // Reject dynamic import / require leftovers that look like module loading
  if (/\bimport\s*\(/.test(stripped) || /\brequire\s*\(/.test(stripped)) {
    return { stripped, error: '不支持动态加载模块' }
  }
  // Bare leftover import keyword (failed multiline / side-effect)
  if (/^\s*import\b/m.test(stripped)) {
    return { stripped, error: '无法解析的 import 语句' }
  }

  return { stripped }
}

function rewriteDefaultExport(code: string): { body: string; defaultName: string } {
  let defaultName = '__CanvasDefault'
  let body = code

  body = body.replace(
    /export\s+default\s+async\s+function\s+(\w+)/g,
    (_m, name: string) => {
      defaultName = name
      return `async function ${name}`
    },
  )
  body = body.replace(
    /export\s+default\s+function\s+(\w+)/g,
    (_m, name: string) => {
      defaultName = name
      return `function ${name}`
    },
  )
  body = body.replace(
    /export\s+default\s+function\s*(?=\()/g,
    () => {
      defaultName = '__CanvasDefault'
      return 'function __CanvasDefault'
    },
  )
  body = body.replace(
    /export\s+default\s+class\s+(\w+)/g,
    (_m, name: string) => {
      defaultName = name
      return `class ${name}`
    },
  )
  body = body.replace(/export\s+default\s+/g, () => {
    defaultName = '__CanvasDefault'
    return 'var __CanvasDefault = '
  })

  // Drop other named exports
  body = body.replace(/export\s+\{[^}]*\}\s*;?/g, '')
  body = body.replace(/export\s+(?:const|let|var|function|class|async\s+function)\s+/g, (m) =>
    m.replace(/^export\s+/, ''),
  )
  return { body, defaultName }
}

function canvasBindingNames(): string[] {
  return Object.keys(Canvas).filter((k) => k !== 'default' && k !== '__esModule')
}

export function compileCanvasSource(source: string): CompileCanvasResult {
  try {
    const { stripped, error } = stripAndValidateImports(source)
    if (error) return { ok: false, error }

    if (!/\bexport\s+default\b/.test(source)) {
      return { ok: false, error: '画布源码需要 export default 组件' }
    }

    const transformed = transform(stripped, {
      transforms: ['typescript', 'jsx'],
      jsxRuntime: 'classic',
      production: true,
    }).code

    const { body, defaultName } = rewriteDefaultExport(transformed)
    const bindings = canvasBindingNames()
    const factory = new Function(
      'React',
      'Canvas',
      `"use strict";
const {
  useState, useEffect, useMemo, useCallback, useRef, useContext,
  useLayoutEffect, useReducer, Fragment, createElement, Children,
  cloneElement, createContext, memo, forwardRef, lazy, Suspense,
} = React;
const { ${bindings.join(', ')} } = Canvas;
${body}
if (typeof ${defaultName} === "undefined") {
  throw new Error("画布源码需要 export default 组件");
}
return ${defaultName};`,
    ) as (R: typeof React, C: typeof Canvas) => unknown

    const Comp = factory(React, Canvas)
    if (typeof Comp !== 'function') {
      return { ok: false, error: '默认导出不是有效组件' }
    }
    return { ok: true, Component: Comp as ComponentType }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg.slice(0, 200) }
  }
}
