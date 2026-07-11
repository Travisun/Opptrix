import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8711'
const WEB_PORT = Number(process.env.WEB_PORT ?? 5173)

export default defineConfig({
  plugins: [react()],
  base: '/',
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
    proxy: {
      '/api': {
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
    },
  },
})
