import * as esbuild from 'esbuild'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.join(__dirname, 'src')
const outDir = path.join(__dirname, 'dist')

const isWatch = process.argv.includes('--watch')

async function build() {
  const ctx = await esbuild.context({
    entryPoints: [path.join(srcDir, 'main.tsx')],
    outdir: outDir,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    jsx: 'automatic',
    loader: { '.tsx': 'tsx', '.ts': 'ts', '.js': 'js', '.css': 'css' },
    sourcemap: true,
    minify: !isWatch,
  })

  if (isWatch) {
    await ctx.watch()
    console.log('Watching... http://localhost:5173')
  } else {
    await ctx.rebuild()
    // Build index.html with correct script src
    let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')
    html = html.replace('/src/main.tsx', 'main.js')
    fs.writeFileSync(path.join(outDir, 'index.html'), html)
    console.log('Build complete \u2192 dist/')
    ctx.dispose()
  }
}

build().catch(e => { console.error(e); process.exit(1) })
