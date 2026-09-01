import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
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
/** 默认仅本机；设 WEB_HOST=0.0.0.0 可局域网访问 */
const WEB_HOST = process.env.WEB_HOST ?? '127.0.0.1'
/** 开发服务器默认 HTTPS（自签名）；设 WEB_HTTPS=0 可回退 HTTP */
const WEB_HTTPS = process.env.WEB_HTTPS !== '0'

export default defineConfig({
  plugins: [
    react(),
    ...(WEB_HTTPS ? [basicSsl()] : []),
  ],
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
    host: WEB_HOST,
    port: WEB_PORT,
    strictPort: true,
    https: WEB_HTTPS,
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
    host: WEB_HOST,
    port: WEB_PORT,
    strictPort: true,
    https: WEB_HTTPS,
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
