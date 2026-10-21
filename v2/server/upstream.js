// Count decoded response bytes as they arrive, including chunked/compressed bodies.
// Never trust Content-Length alone and never buffer an unbounded vendor response.
export async function readJsonBounded(response, maxBytes) {
  const tooLarge = () => Object.assign(new Error('Upstream response exceeds budget'), { code: 'UPSTREAM_BODY_LIMIT' })
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel().catch(() => {})
    throw tooLarge()
  }
  if (!response.body) throw new Error('Empty upstream response')
  const reader = response.body.getReader(), parts = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) { await reader.cancel().catch(() => {}); throw tooLarge() }
      parts.push(Buffer.from(value))
    }
  } finally { reader.releaseLock() }
  const payload = JSON.parse(Buffer.concat(parts, size).toString('utf8'))
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid upstream object')
  return payload
}
