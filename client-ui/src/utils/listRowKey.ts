/**
 * React list key helper: combine row fields with a mandatory index so duplicate
 * upstream data (same rank/name/date, etc.) never produces duplicate keys.
 */
export function listRowKey(
  index: number,
  ...parts: Array<string | number | null | undefined>
): string {
  const prefix = parts
    .filter((part) => part != null && part !== '')
    .map(String)
    .join('-')
  return prefix ? `${prefix}-${index}` : String(index)
}
