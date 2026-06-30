import { defaultSchema } from 'hast-util-sanitize'
import type { Schema } from 'hast-util-sanitize'

const INNO_MD_CLASS = /^inno-md-/

/** Safe HTML subset for assistant markdown (underline, semantic tones, tags). */
export const markdownSanitizeSchema: Schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'u',
    'ins',
    'kbd',
  ],
  attributes: {
    ...defaultSchema.attributes,
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      ['className', INNO_MD_CLASS],
    ],
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      ['className', INNO_MD_CLASS],
    ],
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ['className', /^language-/],
    ],
  },
}
