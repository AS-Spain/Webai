// OpenAI compatibility describes an HTTP protocol, not a requirement to use OpenAI.
export const providers = [
  { id: 'ollama', name: 'Ollama · local', base: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:3b', local: true },
  { id: 'lmstudio', name: 'LM Studio · local', base: 'http://127.0.0.1:1234/v1', model: 'local-model', local: true },
  { id: 'compatible', name: 'Otro servidor compatible con OpenAI', base: 'http://127.0.0.1:1234/v1', model: 'local-model', local: true },
  { id: 'openai', name: 'OpenAI · nube', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'groq', name: 'Groq · nube', base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  { id: 'openrouter', name: 'OpenRouter · nube', base: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
]

const defaults = [11434, 1234].flatMap((port) => ['127.0.0.1', 'localhost', '[::1]'].map((host) => `http://${host}:${port}`))

export function resolveBase(provider, value, additionalOrigins = process.env.V2_AI_ALLOWED_ORIGINS || '') {
  if (!provider.local) return provider.base
  let url
  try { url = new URL(value || provider.base) } catch { throw new Error('La dirección del servidor de modelos no es válida.') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !/^\/v1\/?$/.test(url.pathname) || url.href.length > 300) {
    throw new Error('Usa una URL HTTP(S) sin credenciales que termine en /v1, sin parámetros ni redirecciones.')
  }
  const allowed = new Set(defaults)
  for (const origin of additionalOrigins.split(',').map((part) => part.trim()).filter(Boolean)) {
    try { allowed.add(new URL(origin).origin) } catch { /* Ignore invalid operator configuration. */ }
  }
  if (!allowed.has(url.origin)) throw new Error('Destino no autorizado. Para otra máquina, contenedor o puerto, el operador debe añadir su origen exacto a V2_AI_ALLOWED_ORIGINS y reiniciar el servidor.')
  return `${url.origin}/v1`
}
