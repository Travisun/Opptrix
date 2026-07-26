/** 去掉 SenseVoice 输出中的 <|...|> 情感/事件/语言等特殊标签，只保留 ASR 正文。 */
export function cleanSenseVoiceTranscript(raw: string): string {
  return String(raw ?? '')
    .replace(/<\|[^|]*\|>/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
}
