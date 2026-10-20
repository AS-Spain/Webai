import { lstatSync, readdirSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { runtimeConfig } from './runtime.js'

export function privateFilePolicy(env = process.env) {
  const databases = ['false', 'true'].map((demo) => runtimeConfig({ V2_DB_PATH: env.V2_DB_PATH, V2_DEMO_DB_PATH: env.V2_DEMO_DB_PATH, DEMO_MODE: demo }).dbPath).map((file) => path.resolve(file).replaceAll('\\', '/'))
  const names = databases.map((file) => path.basename(file))
  const deny = ['.env', '.env.*', '**/.env*', '**/.git/**', '**/.npmrc', '**/.netrc', '**/.git-credentials', '**/*.log', '**/*.{crt,pem,key,p12,pfx,sql,bak,backup}', '**/*.{sqlite,sqlite-*,db,db-*}', '**/*.bootstrap-*.local', '**/data/**', '**/server/**', '**/scripts/**', '**/tests/**', ...databases.flatMap((file) => [file, `${file}-*`, `${file}.bootstrap-*.local`])]
  const sensitive = (value) => {
    const segments = value.replaceAll('\\', '/').split('/'), filename = segments.at(-1) || ''
    return segments.some((part) => ['data', 'server', 'scripts', 'tests', 'backups', '.git', '.ssh', '.aws'].includes(part)) ||
      (/^\.env/i.test(filename) || ['.npmrc', '.netrc', '.git-credentials'].includes(filename)) || /\.(key|pem|crt|p12|pfx|sql|bak|backup|log|sqlite|db)(?:$|[-.])/i.test(filename) || /\.bootstrap-.*\.local$/i.test(filename) ||
      names.some((name) => filename === name || filename.startsWith(`${name}-`) || filename.startsWith(`${name}.bootstrap-`))
  }
  // Also covers public/ and symlink aliases, which fs.deny alone cannot protect.
  const middleware = ({ root, publicDir = false, outDir = false }) => (req, res, next) => {
    let url
    try { url = decodeURIComponent(new URL(req.url, 'http://files.invalid').pathname).replaceAll('\\', '/') }
    catch { res.statusCode = 400; res.end('Bad request'); return }
    if (url === '/api' || url.startsWith('/api/')) return next()
    const candidates = url.startsWith('/@fs/') ? [url.slice(4)] : [path.join(root, url), ...(publicDir ? [path.join(publicDir, url)] : []), ...(outDir ? [path.join(outDir, url)] : [])]
    const forbidden = sensitive(url) || candidates.some((file) => {
      try { return sensitive(path.relative(root, realpathSync(file))) } catch { return false }
    })
    if (forbidden) { res.statusCode = 403; res.setHeader('Cache-Control', 'no-store'); res.end('Forbidden'); return }
    next()
  }
  let buildConfig
  const plugin = {
    name: 'private-workspace-files',
    configResolved(config) { buildConfig = config },
    configureServer(server) { server.middlewares.use(middleware(server.config)) },
    configurePreviewServer(server) { server.middlewares.use(middleware({ ...server.config, outDir: path.resolve(server.config.root, server.config.build.outDir) })) },
    buildStart() {
      if (buildConfig?.command !== 'build') return
      const publicDir = buildConfig.publicDir
      if (!publicDir) return
      const inspect = (dir) => {
        for (const name of readdirSync(dir, { withFileTypes: true })) {
          const file = path.join(dir, name.name)
          // Public assets are copied verbatim to dist. Fail rather than copying
          // a sensitive file or symlink into a supposedly safe production build.
          if (sensitive(path.relative(publicDir, file)) || lstatSync(file).isSymbolicLink()) throw new Error('Hay archivos privados o enlaces simbólicos en public/. Retíralos antes de compilar; nunca incluyas datos ni claves en assets públicos.')
          if (name.isDirectory()) inspect(file)
        }
      }
      try { inspect(publicDir) } catch (error) { if (error.code !== 'ENOENT') throw error }
    },
  }
  return { deny, plugin, middleware }
}
