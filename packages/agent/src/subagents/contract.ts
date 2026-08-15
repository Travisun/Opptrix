/**
 * 轻量 JSON Schema（object）校验 — 无外部 Ajv 依赖。
 * 覆盖 type / properties / required / enum / items / additionalProperties 常用子集。
 */

export type ContractValidationResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; errors: string[] }

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function typeOf(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

function matchesType(value: unknown, expected: string): boolean {
  if (expected === 'integer') {
    return typeof value === 'number' && Number.isInteger(value)
  }
  if (expected === 'number') {
    return typeof value === 'number' && Number.isFinite(value)
  }
  return typeOf(value) === expected
}

function validateNode(
  value: unknown,
  schema: unknown,
  path: string,
  errors: string[],
): void {
  if (!isRecord(schema)) {
    errors.push(`${path}: schema 无效`)
    return
  }

  const types = schema.type
  if (typeof types === 'string') {
    if (!matchesType(value, types)) {
      errors.push(`${path}: 期望 ${types}，实际 ${typeOf(value)}`)
      return
    }
  } else if (Array.isArray(types)) {
    const ok = types.some(t => typeof t === 'string' && matchesType(value, t))
    if (!ok) {
      errors.push(`${path}: 期望 ${types.join('|')}，实际 ${typeOf(value)}`)
      return
    }
  }

  if (Array.isArray(schema.enum)) {
    const hit = schema.enum.some(e => Object.is(e, value) || (
      typeof e === 'object' && typeof value === 'object'
      && JSON.stringify(e) === JSON.stringify(value)
    ))
    if (!hit) {
      errors.push(`${path}: 不在 enum 范围内`)
      return
    }
  }

  if (matchesType(value, 'object') || (typeof schema.type === 'string' && schema.type === 'object')) {
    if (!isRecord(value)) {
      if (schema.type === 'object') {
        errors.push(`${path}: 期望 object`)
      }
      return
    }
    const required = Array.isArray(schema.required)
      ? schema.required.filter((k): k is string => typeof k === 'string')
      : []
    for (const key of required) {
      if (!(key in value)) {
        errors.push(`${path}.${key}: 缺少必填字段`)
      }
    }
    const props = isRecord(schema.properties) ? schema.properties : {}
    for (const [key, childSchema] of Object.entries(props)) {
      if (key in value) {
        validateNode(value[key], childSchema, `${path}.${key}`, errors)
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in props)) {
          errors.push(`${path}.${key}: 不允许额外字段`)
        }
      }
    } else if (isRecord(schema.additionalProperties)) {
      for (const key of Object.keys(value)) {
        if (!(key in props)) {
          validateNode(value[key], schema.additionalProperties, `${path}.${key}`, errors)
        }
      }
    }
    return
  }

  if (schema.type === 'array' || Array.isArray(value)) {
    if (!Array.isArray(value)) {
      if (schema.type === 'array') errors.push(`${path}: 期望 array`)
      return
    }
    if (schema.items != null) {
      value.forEach((item, i) => {
        validateNode(item, schema.items, `${path}[${i}]`, errors)
      })
    }
  }
}

/**
 * 校验 data 是否符合 result_schema（须为 type:object 根）。
 */
export function validateAgainstSchema(
  data: unknown,
  schema: unknown,
): ContractValidationResult {
  if (!isRecord(schema) || schema.type !== 'object') {
    return { ok: false, errors: ['result_schema 须为 type:"object"'] }
  }
  const errors: string[] = []
  validateNode(data, schema, '$', errors)
  if (errors.length) return { ok: false, errors }
  if (!isRecord(data)) {
    return { ok: false, errors: ['$: 期望 object'] }
  }
  return { ok: true, value: data }
}

/**
 * 从助手回复中提取 JSON 对象（支持 ```json 围栏或全文 JSON）。
 */
export function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)
  const candidate = fence ? fence[1]!.trim() : trimmed

  try {
    const parsed: unknown = JSON.parse(candidate)
    return isRecord(parsed) ? parsed : null
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      const parsed: unknown = JSON.parse(candidate.slice(start, end + 1))
      return isRecord(parsed) ? parsed : null
    } catch {
      return null
    }
  }
}

export function validateSubagentResult(
  replyText: string,
  schema: unknown,
): ContractValidationResult {
  const obj = extractJsonObject(replyText)
  if (!obj) {
    return { ok: false, errors: ['未能从回复中解析出 JSON 对象'] }
  }
  return validateAgainstSchema(obj, schema)
}
