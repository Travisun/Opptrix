import { createConnection, type Socket } from 'node:net'
import { crc32, unzipSync } from 'node:zlib'
import {
  ATTRIBUTE_SPLIT,
  BAOSTOCK_CLIENT_VERSION,
  BAOSTOCK_SERVER_HOST,
  BAOSTOCK_SERVER_PORT,
  BSERR_PARSE_DATA_ERR,
  BSERR_RECVSOCK_FAIL,
  COMPRESSED_MESSAGE_TYPES,
  DELIMITER,
  MESSAGE_END_SUFFIX,
  MESSAGE_HEADER_LENGTH,
  MESSAGE_SPLIT,
} from './constants.js'

/**
 * BaoStock TCP 协议解析 — 处理与 BaoStock 服务器的 TCP 通信协议。
 *
 * 用途：封装连接建立、请求构建、响应解析、zlib 解压等底层操作。
 * 协议：自定义 TCP 协议，消息格式为 [header]\x01[body]\x01[crc32]\r\n
 */

export class BaostockProtocolError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message)
    this.name = 'BaostockProtocolError'
  }
}

/**
 * BaoStock 已解析的消息结构 — TCP 响应解析后的结构化数据。
 *
 * 用途：上层 Client 直接读取 bodyParts 数组提取字段，无需重复解析。
 */
export interface ParsedBaostockMessage {
  /** 协议版本号 */
  version: string
  /** 消息类型（如 "login"、"query_history_k_data_plus"） */
  msgType: string
  /** 消息体长度（十进制字符串） */
  bodyLength: string
  /** 消息体按 \x01 分割后的字段数组 */
  bodyParts: string[]
  /** 原始消息体文本（未分割） */
  rawBody: string
}

function padBodyLength(length: number): string {
  return String(length).padStart(10, '0')
}

/** Python 3 zlib.crc32 — unsigned 32-bit integer as decimal string */
export function pythonCrc32(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data
  return String(crc32(buf) >>> 0)
}

export function buildHeader(msgType: string, bodyLength: number): string {
  return `${BAOSTOCK_CLIENT_VERSION}${MESSAGE_SPLIT}${msgType}${MESSAGE_SPLIT}${padBodyLength(bodyLength)}`
}

/** Comma-separated params → \x01-separated message body (organize_msg_body) */
export function organizeMsgBody(param: string): string {
  return param.split(ATTRIBUTE_SPLIT).map(part => part.trim()).join(MESSAGE_SPLIT)
}

export function buildRequest(msgType: string, body: string): string {
  const header = buildHeader(msgType, body.length)
  const headBody = header + body
  return `${headBody}${MESSAGE_SPLIT}${pythonCrc32(headBody)}${DELIMITER}`
}

export function parseFields(fieldsRaw: string): string[] {
  return fieldsRaw.split(ATTRIBUTE_SPLIT).map(f => f.trim()).filter(Boolean)
}

export function parseDataRecords(dataRaw: string): unknown[][] {
  if (!dataRaw.trim()) return []
  const cleaned = dataRaw.split(/\s+/).join('')
  const parsed = JSON.parse(cleaned) as { record?: unknown[][] }
  return Array.isArray(parsed.record) ? parsed.record : []
}

export function parseResponse(raw: string): ParsedBaostockMessage {
  if (raw.length < MESSAGE_HEADER_LENGTH) {
    throw new BaostockProtocolError('响应过短', BSERR_PARSE_DATA_ERR)
  }

  const header = raw.slice(0, MESSAGE_HEADER_LENGTH)
  let body = raw.slice(MESSAGE_HEADER_LENGTH)
  if (body.endsWith(DELIMITER)) body = body.slice(0, -1)

  const [version, msgType, bodyLength] = header.split(MESSAGE_SPLIT)
  return {
    version,
    msgType,
    bodyLength,
    bodyParts: body.split(MESSAGE_SPLIT),
    rawBody: body,
  }
}

export function decompressResponseIfNeeded(rawBuffer: Buffer): string {
  if (rawBuffer.length < MESSAGE_HEADER_LENGTH) {
    throw new BaostockProtocolError('响应过短', BSERR_PARSE_DATA_ERR)
  }

  const headerStr = rawBuffer.subarray(0, MESSAGE_HEADER_LENGTH).toString('utf8')
  const [, msgType, bodyLengthRaw] = headerStr.split(MESSAGE_SPLIT)

  if (COMPRESSED_MESSAGE_TYPES.has(msgType)) {
    const innerLength = Number.parseInt(bodyLengthRaw, 10)
    const compressed = rawBuffer.subarray(MESSAGE_HEADER_LENGTH, MESSAGE_HEADER_LENGTH + innerLength)
    const decompressed = unzipSync(compressed).toString('utf8')
    return headerStr + decompressed
  }

  return rawBuffer.toString('utf8')
}

function readSocketChunk(socket: Socket): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      cleanup()
      resolve(chunk)
    }
    const onError = (err: Error) => {
      cleanup()
      reject(err)
    }
    const onEnd = () => {
      cleanup()
      reject(new BaostockProtocolError('连接已关闭', BSERR_RECVSOCK_FAIL))
    }
    const cleanup = () => {
      socket.off('data', onData)
      socket.off('error', onError)
      socket.off('end', onEnd)
    }
    socket.once('data', onData)
    socket.once('error', onError)
    socket.once('end', onEnd)
  })
}

export async function readMessage(socket: Socket): Promise<Buffer> {
  const suffix = Buffer.from(MESSAGE_END_SUFFIX, 'utf8')
  const chunks: Buffer[] = []

  while (true) {
    const chunk = await readSocketChunk(socket)
    chunks.push(chunk)
    const buf = Buffer.concat(chunks)
    if (buf.length >= suffix.length && buf.subarray(buf.length - suffix.length).equals(suffix)) {
      return buf
    }
  }
}

export function connectSocket(
  host = BAOSTOCK_SERVER_HOST,
  port = BAOSTOCK_SERVER_PORT,
  timeoutMs = 15_000,
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new BaostockProtocolError(`连接超时 (${host}:${port})`))
    }, timeoutMs)

    socket.once('connect', () => {
      clearTimeout(timer)
      socket.setNoDelay(true)
      resolve(socket)
    })
    socket.once('error', err => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

export async function sendRequest(socket: Socket, msgType: string, body: string): Promise<ParsedBaostockMessage> {
  const payload = buildRequest(msgType, body)
  await new Promise<void>((resolve, reject) => {
    socket.write(payload, 'utf8', err => {
      if (err) reject(err)
      else resolve()
    })
  })

  const rawBuffer = await readMessage(socket)
  const rawText = decompressResponseIfNeeded(rawBuffer)
  return parseResponse(rawText)
}
