declare module 'pdf-parse/lib/pdf-parse.js' {
  export default function pdfParse(buf: Uint8Array): Promise<{ text?: string }>
}
