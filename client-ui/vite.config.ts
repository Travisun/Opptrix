import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const brandIconsDir = path.join(repoRoot, 'icons')
const clientPkg = JSON.parse(
  readFileSync(path.join(__dirname, 'package.json'), 'utf8'),
) as { version?: string }

const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8711'
const WEB_PORT = Number(process.env.WEB_PORT ?? 5173)

export default defineConfig({
  plugins: [react()],
  base: '/',
  resolve: {
    alias: {
      /** Repo brand PNGs (`icons/logo@*.png`) — single source for UI chrome marks. */
      '@opptrix-icons': brandIconsDir,
    },
  },
  define: {
    __OPPTRIX_CLIENT_VERSION__: JSON.stringify(clientPkg.version ?? ''),
  },
  optimizeDeps: {
    include: [
      'react-markdown',
      'remark-gfm',
      'remark-math',
      'rehype-katex',
      'rehype-raw',
      'rehype-sanitize',
      'katex',
      'mermaid',
      'pdfjs-dist',
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: WEB_PORT,
    strictPort: true,
    fs: {
      allow: [repoRoot],
    },
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
      '/opptrix-vendor': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: WEB_PORT,
    strictPort: true,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
      '/opptrix-vendor': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
})
