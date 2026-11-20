import { MAX_INPUT_CHARS, OutputError, parseModelContent, SYSTEM_PROMPT, validateResult } from '../lib/prompt.js'

const MAX_REQUEST_BYTES = 256 * 1024
const MODEL_BUDGET_MS = 100_000

class ServiceError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

function send(res, status, payload) {
  if (res.destroyed || res.writableEnded) return
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(JSON.stringify(payload))
}

function tooLarge() {
  return new ServiceError(413, 'INPUT_TOO_LONG', '会议原文过长，请分段提交，每次最多 20,000 字。')
}

async function readTranscript(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ServiceError(415, 'INVALID_CONTENT_TYPE', '请使用 JSON 格式提交会议原文。')
  }
  if (Number(req.headers['content-length']) > MAX_REQUEST_BYTES) throw tooLarge()
  let body
  try {
    // Vercel may supply a parsed body. Vite dev/preview supplies a Node stream.
    body = req.body
    if (body === undefined) {
      let bytes = 0
      const chunks = []
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        const buffer = Buffer.from(chunk)
        bytes += buffer.length
        if (bytes > MAX_REQUEST_BYTES) {
          req.resume()
          throw tooLarge()
        }
        chunks.push(buffer)
      }
      body = Buffer.concat(chunks).toString('utf8')
    }
    if (Buffer.isBuffer(body)) body = body.toString('utf8')
    if (typeof body === 'string') body = JSON.parse(body)
  } catch (error) {
    if (error instanceof ServiceError) throw error
    throw new ServiceError(400, 'INVALID_JSON', '提交的数据不是完整的 JSON，请重新提交。')
  }

  if (typeof body?.text !== 'string' || !body.text.trim()) {
    throw new ServiceError(400, 'EMPTY_INPUT', '请先粘贴或填入会议原文。')
  }
  if (Array.from(body.text).length > MAX_INPUT_CHARS) throw tooLarge()
  return body.text
}

function settings() {
  const key = process.env.LLM_API_KEY?.trim()
  if (!key) throw new ServiceError(503, 'KEY_NOT_CONFIGURED', '尚未配置模型密钥。请在服务端设置 LLM_API_KEY，然后重启本地服务或重新部署。')
  let url
  try {
    url = new URL(process.env.LLM_BASE_URL?.trim() || 'https://api.openai.com/v1')
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.username || url.password || url.search || url.hash ||
        (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) throw new Error()
    url.pathname = url.pathname.replace(/\/+$/, '') + '/chat/completions'
  } catch {
    throw new ServiceError(503, 'BASE_URL_INVALID', '请检查服务端 LLM_BASE_URL。远程模型使用 HTTPS 基础地址，本机模型可使用 HTTP 回环地址。')
  }
  return { key, url, model: process.env.LLM_MODEL?.trim() || 'gpt-6.2-sol' }
}

function upstreamError(status) {
  if (status === 401 || status === 403) return new ServiceError(502, 'MODEL_AUTH', '模型服务拒绝了凭据，请核对服务端密钥、地址和模型权限。')
  if (status === 402) return new ServiceError(502, 'MODEL_CREDIT', '模型账户余额不足，请检查服务商账户后重试。')
  if (status === 429) return new ServiceError(429, 'MODEL_RATE_LIMIT', '模型服务限流或配额已用尽，请稍后重试或检查账户额度。')
  if (status === 408 || status === 504) return new ServiceError(504, 'MODEL_TIMEOUT', '模型响应超时，请缩短会议原文后重试。')
  if (status === 404) return new ServiceError(502, 'MODEL_NOT_FOUND', '模型或服务端点不存在，请核对 LLM_BASE_URL 和 LLM_MODEL。')
  if (status === 400 || status === 422) return new ServiceError(502, 'MODEL_REQUEST_REJECTED', '模型拒绝了请求。请检查模型支持的接口和采样参数，或缩短原文。')
  return new ServiceError(502, 'MODEL_UNAVAILABLE', '模型服务当前不可用，请稍后重试。')
}

async function complete(config, messages, signal, mode) {
  const payload = { model: config.model, messages }
  // This model accepts only its default sampling temperature.
  if (config.model !== 'gpt-6.2-sol') payload.temperature = 0.1
  if (mode.json) payload.response_format = { type: 'json_object' }
  const response = await fetch(config.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
    redirect: 'error',
    signal,
  })
  if (!response.ok) {
    // Some compatible Chat Completions implementations lack JSON mode. Retry without
    // that parameter only for an explicit format incompatibility; validation stays on.
    if (mode.json && [400, 422].includes(response.status)) {
      const reason = (await response.text()).slice(0, 8192)
      if (/response[_ ]format|json[_ ](?:object|mode|output)/i.test(reason)) {
        mode.json = false
        return complete(config, messages, signal, mode)
      }
    }
    await response.body?.cancel().catch(() => {})
    throw upstreamError(response.status)
  }
  let data
  try {
    data = await response.json()
  } catch (error) {
    if (signal.aborted) throw error
    throw new OutputError('供应商返回了无效的 JSON 响应')
  }
  const choice = data?.choices?.[0]
  if (choice?.finish_reason === 'content_filter' || choice?.message?.refusal) {
    throw new ServiceError(422, 'MODEL_REFUSED', '模型服务未能处理这段内容，请检查原文或更换服务端模型。')
  }
  if (choice?.finish_reason === 'length') throw new OutputError('上次输出超过模型长度限制，请保持引文精简并输出完整 JSON')
  return choice?.message?.content
}

async function organize(text, signal) {
  const config = settings()
  const mode = { json: true }
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify({ transcript: text }) },
  ]
  for (let attempt = 0; attempt < 2; attempt++) {
    let content
    try {
      content = await complete(config, messages, signal, mode)
      return validateResult(parseModelContent(content), text)
    } catch (error) {
      if (!(error instanceof OutputError)) throw error
      if (attempt === 1) throw new ServiceError(502, 'INVALID_MODEL_OUTPUT', '模型结果未通过 JSON 结构或原文依据校验，自动修正后仍未通过。请重试，或分段提交原文。')
      if (typeof content === 'string' && content.length <= 48_000) {
        messages.push({ role: 'assistant', content })
      }
      messages.push({ role: 'user', content: `重新核对最初的会议原文并输出完整 JSON。上次校验反馈：${error.message}。` })
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    send(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '此接口仅支持 POST 请求。' } })
    return
  }

  const controller = new AbortController()
  const onClose = () => controller.abort()
  res.once('close', onClose)
  // Share one deadline across the model request, format negotiation, and any repair.
  const timeout = AbortSignal.timeout(MODEL_BUDGET_MS)
  const signal = AbortSignal.any([controller.signal, timeout])
  try {
    const text = await readTranscript(req)
    send(res, 200, await organize(text, signal))
  } catch (error) {
    const failure = timeout.aborted ? upstreamError(504)
      : error instanceof ServiceError ? error
      : new ServiceError(502, 'MODEL_NETWORK', '无法连接模型服务，请检查服务端网络和 LLM_BASE_URL 后重试。')
    // Raw upstream errors may echo the request. Never send or log raw bodies or headers.
    send(res, failure.status, { error: { code: failure.code, message: failure.message } })
  } finally {
    res.off('close', onClose)
  }
}
