import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { globalInferenceQueue } from '../runtime/job-queue.js'
import { buildImageOcrPrompt } from '../llama/prompts.js'
import { resolveVisionModelPaths } from '../catalog/installed.js'
import { resolveMtmdCli } from './mtmd-binary.js'

function runMtmdCli(
  binary: string,
  modelPath: string,
  mmprojPath: string,
  imagePath: string,
  prompt: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '-m', modelPath,
      '--mmproj', mmprojPath,
      '--image', imagePath,
      '-p', prompt,
      '-n', '512',
      '--temp', '0.1',
    ]
    const binDir = path.dirname(binary)
    const child = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: binDir,
      env: process.env,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.on('error', reject)
    child.on('close', code => {
      const text = stdout.trim()
      if (code === 0 && text) {
        resolve(text)
        return
      }
      reject(new Error(stderr.trim() || stdout.trim() || `llama-mtmd-cli exited ${code}`))
    })
  })
}

export class VisionRuntime {
  async extractImageText(imagePath: string, repoRoot?: string): Promise<string> {
    return globalInferenceQueue.enqueue(async () => {
      if (!fs.existsSync(imagePath)) {
        throw new Error('图片文件不存在')
      }

      const paths = resolveVisionModelPaths(repoRoot)
      if (!paths) {
        throw new Error('SmolVLM 模型或 mmproj 未安装')
      }

      const cli = await resolveMtmdCli()
      const prompt = buildImageOcrPrompt()
      const raw = await runMtmdCli(cli, paths.modelPath, paths.mmprojPath, imagePath, prompt)
      return raw.replace(/\s+/g, ' ').trim()
    })
  }
}

export const visionRuntime = new VisionRuntime()
