declare module 'ppt-to-text' {
  export interface PptPresentation {
    slides?: unknown[]
    docs?: unknown[]
  }

  export interface PptToTextUtils {
    to_text(pres: PptPresentation): string[]
    toTextString(pres: PptPresentation, separator?: string): string
  }

  export interface PptToTextModule {
    extractText(input: string | Buffer, options?: { separator?: string }): string
    readBuffer(buffer: Buffer, opts?: Record<string, unknown>): PptPresentation
    utils: PptToTextUtils
  }

  const pptToText: PptToTextModule
  export default pptToText
}
