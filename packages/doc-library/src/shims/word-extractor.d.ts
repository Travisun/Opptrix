declare module 'word-extractor' {
  export interface WordExtractorDocument {
    getBody(): string
    getHeaders(): string
    getFooters(): string
    getFootnotes(): string
    getEndnotes(): string
    getAnnotations(): string
    getTextboxes(): string
  }

  export default class WordExtractor {
    extract(input: string | Buffer): Promise<WordExtractorDocument>
  }
}
