import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export function runtimeConfig(env = process.env) {
  const demo = env.DEMO_MODE === 'true'
  const normalDb = env.V2_DB_PATH || path.join(root, 'data/webai-live.sqlite')
  const demoDb = env.V2_DEMO_DB_PATH || path.join(root, 'data/webai-demo.sqlite')
  if (demo && path.resolve(demoDb) === path.resolve(normalDb)) throw new Error('La demo y la aplicación normal no pueden compartir el mismo archivo SQLite.')
  return {
    demo,
    port: Number(env.PORT || (demo ? 3003 : 3002)),
    dbPath: demo ? demoDb : normalDb,
    cookie: demo ? 'webai_v2_demo_session' : 'webai_v2_private_session',
    keyPath: path.join(root, demo ? 'data/ai-demo-master.key' : 'data/ai-master.key'),
  }
}
