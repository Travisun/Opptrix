#!/usr/bin/env node
/**
 * Stage offline web-vendor libs into apps/desktop/resources/web-vendor/
 * Downloads pinned UMD/min builds (build-time only; runtime is offline).
 *
 * Usage: node scripts/stage-web-vendor.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'apps/desktop/resources/web-vendor')

/** @type {Array<{ id: string, version: string, files: Array<{ url: string, dest: string }>, globals?: string[], description?: string, tags?: string[] }>} */
const LIBS = [
  {
    id: 'chart.js',
    version: '4.4.1',
    globals: ['Chart'],
    description: 'Canvas 图表',
    tags: ['chart'],
    files: [
      {
        url: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
        dest: 'chart.js/chart.umd.min.js',
      },
    ],
  },
  {
    id: 'echarts',
    version: '5.5.0',
    globals: ['echarts'],
    description: 'ECharts 可视化',
    tags: ['chart'],
    files: [
      {
        url: 'https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js',
        dest: 'echarts/echarts.min.js',
      },
    ],
  },
  {
    id: 'dayjs',
    version: '1.11.10',
    globals: ['dayjs'],
    description: '轻量日期库',
    tags: ['util'],
    files: [
      {
        url: 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js',
        dest: 'dayjs/dayjs.min.js',
      },
    ],
  },
  {
    id: 'lodash',
    version: '4.17.21',
    globals: ['_'],
    description: '工具函数集',
    tags: ['util'],
    files: [
      {
        url: 'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js',
        dest: 'lodash/lodash.min.js',
      },
    ],
  },
  {
    id: 'd3',
    version: '7.9.0',
    globals: ['d3'],
    description: 'D3 数据可视化',
    tags: ['chart', 'viz'],
    files: [
      {
        url: 'https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js',
        dest: 'd3/d3.min.js',
      },
    ],
  },
  {
    id: 'papaparse',
    version: '5.4.1',
    globals: ['Papa'],
    description: 'CSV 解析',
    tags: ['data'],
    files: [
      {
        url: 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js',
        dest: 'papaparse/papaparse.min.js',
      },
    ],
  },
  {
    id: 'xlsx',
    version: '0.18.5',
    globals: ['XLSX'],
    description: 'SheetJS Community Excel 读写',
    tags: ['data'],
    files: [
      {
        url: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
        dest: 'xlsx/xlsx.full.min.js',
      },
    ],
  },
  {
    id: 'marked',
    version: '12.0.1',
    globals: ['marked'],
    description: 'Markdown 渲染',
    tags: ['text'],
    files: [
      {
        url: 'https://cdn.jsdelivr.net/npm/marked@12.0.1/marked.min.js',
        dest: 'marked/marked.min.js',
      },
    ],
  },
  {
    id: 'highlight.js',
    version: '11.9.0',
    globals: ['hljs'],
    description: '代码高亮',
    tags: ['text'],
    files: [
      {
        url: 'https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/lib/common.min.js',
        dest: 'highlight.js/highlight.min.js',
      },
      {
        url: 'https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github.min.css',
        dest: 'highlight.js/github.min.css',
      },
    ],
  },
  {
    id: 'alpinejs',
    version: '3.13.5',
    globals: ['Alpine'],
    description: '轻量交互框架',
    tags: ['ui'],
    files: [
      {
        url: 'https://cdn.jsdelivr.net/npm/alpinejs@3.13.5/dist/cdn.min.js',
        dest: 'alpinejs/cdn.min.js',
      },
    ],
  },
  {
    id: 'lucide',
    version: '0.363.0',
    globals: ['lucide'],
    description: '图标（UMD createIcons）',
    tags: ['icon'],
    files: [
      {
        url: 'https://cdn.jsdelivr.net/npm/lucide@0.363.0/dist/umd/lucide.min.js',
        dest: 'lucide/lucide.min.js',
      },
    ],
  },
  {
    id: 'tailwindcss',
    version: '3.4.1-browser',
    globals: ['tailwind'],
    description: 'Tailwind Play CDN 浏览器脚本（离线拷贝；运行时不访问外网）',
    tags: ['css'],
    files: [
      {
        url: 'https://cdn.tailwindcss.com/3.4.1',
        dest: 'tailwindcss/tailwindcss.min.js',
      },
    ],
  },
  {
    id: 'plotly',
    version: '2.29.1',
    globals: ['Plotly'],
    description: 'Plotly.js 交互图',
    tags: ['chart'],
    files: [
      {
        url: 'https://cdn.jsdelivr.net/npm/plotly.js-dist-min@2.29.1/plotly.min.js',
        dest: 'plotly/plotly.min.js',
      },
    ],
  },
  {
    id: 'three',
    version: '0.149.0',
    globals: ['THREE'],
    description: 'Three.js 3D（UMD min；新版无 browser UMD）',
    tags: ['3d'],
    files: [
      {
        url: 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js',
        dest: 'three/three.min.js',
      },
    ],
  },
  {
    id: 'katex',
    version: '0.16.9',
    globals: ['katex'],
    description: 'KaTeX 公式',
    tags: ['math'],
    files: [
      {
        url: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js',
        dest: 'katex/katex.min.js',
      },
      {
        url: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css',
        dest: 'katex/katex.min.css',
      },
    ],
  },
  {
    id: 'animejs',
    version: '3.2.2',
    globals: ['anime'],
    description: 'Anime.js 动画',
    tags: ['motion'],
    files: [
      {
        url: 'https://cdn.jsdelivr.net/npm/animejs@3.2.2/lib/anime.min.js',
        dest: 'animejs/anime.min.js',
      },
    ],
  },
  {
    id: 'zod',
    version: '3.22.4',
    globals: ['Zod'],
    description: 'Zod 校验（UMD）',
    tags: ['util'],
    files: [
      {
        url: 'https://cdn.jsdelivr.net/npm/zod@3.22.4/lib/index.umd.js',
        dest: 'zod/zod.umd.js',
      },
    ],
  },
]

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    const req = mod.get(url, { headers: { 'User-Agent': 'Opptrix-web-vendor-stage/1.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchBuffer(res.headers.location).then(resolve, reject)
        res.resume()
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        res.resume()
        return
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    })
    req.on('error', reject)
    req.setTimeout(120_000, () => {
      req.destroy(new Error(`timeout ${url}`))
    })
  })
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const skipped = []
  const libs = []

  for (const lib of LIBS) {
    const written = []
    let ok = true
    for (const file of lib.files) {
      const destAbs = path.join(OUT, file.dest)
      fs.mkdirSync(path.dirname(destAbs), { recursive: true })
      try {
        if (fs.existsSync(destAbs) && fs.statSync(destAbs).size > 100) {
          console.log(`skip (exists) ${file.dest}`)
          written.push(file.dest.replace(`${lib.id}/`, '').replace(/^/, path.basename(path.dirname(file.dest)) === lib.id ? path.basename(file.dest) : file.dest.split('/').slice(1).join('/')))
          // Prefer relative path within lib folder
          written[written.length - 1] = file.dest.slice(lib.id.length + 1)
          continue
        }
        console.log(`fetch ${lib.id}@${lib.version} → ${file.dest}`)
        const buf = await fetchBuffer(file.url)
        if (buf.length < 50) throw new Error('file too small')
        fs.writeFileSync(destAbs, buf)
        written.push(file.dest.slice(lib.id.length + 1))
      } catch (e) {
        ok = false
        skipped.push(`${lib.id}: ${e instanceof Error ? e.message : String(e)}`)
        console.warn(`FAIL ${lib.id}:`, e instanceof Error ? e.message : e)
        break
      }
    }
    if (ok && written.length) {
      libs.push({
        id: lib.id,
        version: lib.version,
        files: written,
        globals: lib.globals,
        description: lib.description,
        tags: lib.tags,
      })
    }
  }

  const manifest = {
    version: '1',
    generatedAt: new Date().toISOString(),
    libs,
    skipped,
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`\nWrote ${libs.length} libs → ${OUT}`)
  if (skipped.length) {
    console.log('Skipped:', skipped.join('\n  '))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
