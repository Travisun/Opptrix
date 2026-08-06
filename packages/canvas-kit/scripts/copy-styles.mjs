#!/usr/bin/env node
import { cpSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(root, 'dist')
mkdirSync(distDir, { recursive: true })
cpSync(path.join(root, 'src', 'styles.css'), path.join(distDir, 'styles.css'))
console.log('[copy-styles] wrote dist/styles.css')
