/** 去掉 whisper-cli 文本输出中的时间戳行前缀与噪声行。 */
export function cleanWhisperTranscript(raw: string): string {
  const lines = String(raw ?? '')
    .split(/\r?\n/)
    .map((line) => line
      .replace(/^\[[^\]]*]\s*/, '')
      .replace(/^\(\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*-->\s*[^)]+\)\s*/, '')
      .trim())
    .filter((line) => {
      if (!line) return false
      // 过滤 whisper 系统信息行
      if (/^(whisper_|ggml_|system_info:|main:|output_)/i.test(line)) return false
      return true
    })
  return lines.join('\n').trim()
}

/**
 * Composer / 投研场景默认初始提示：偏向简体中文，并给出股票代码样例。
 * 提示词不会进入最终用户可见文本，只影响解码偏置。
 */
export const COMPOSER_SPEECH_PROMPT = [
  '以下是简体中文的投研问题。',
  '请使用简体中文，不要使用繁体字。',
  '股票代码请写成阿拉伯数字，例如贵州茅台600519、平安银行000001、宁德时代300750、科创板688981。',
  '百分比与金额也用阿拉伯数字，例如涨了3%、市值2000亿。',
].join('')
