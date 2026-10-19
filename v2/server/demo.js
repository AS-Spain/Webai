// Deliberately override only the mode; runtimeConfig ignores the normal database in demo mode.
process.env.DEMO_MODE = 'true'
await import('./index.js')
