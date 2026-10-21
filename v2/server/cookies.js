// Forwarded metadata can only upgrade security, never remove Secure. Arena's
// HTTPS gateway may replace Host; ordinary first-party deployments stay Strict.
export function cookiePolicy(req, { embeddedPreview = Boolean(process.env.E2B_SANDBOX_ID) } = {}) {
  const hosts = [req.get('host'), req.get('x-forwarded-host')].filter(Boolean).flatMap((value) => value.split(','))
  const preview = hosts.some((host) => /^[a-z0-9-]+\.e2b\.app$/i.test(host.trim().split(':')[0]))
  const https = req.secure || req.get('x-forwarded-proto')?.split(',').some((value) => value.trim().toLowerCase() === 'https')
  const partitioned = Boolean(preview || (embeddedPreview && https))
  const secure = https || process.env.NODE_ENV === 'production'
  return { partitioned, attributes: partitioned ? '; Secure; SameSite=None; Partitioned' : `; SameSite=Strict${secure ? '; Secure' : ''}` }
}
