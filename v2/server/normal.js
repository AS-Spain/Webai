// npm start always launches the private application, regardless of an inherited demo flag.
process.env.DEMO_MODE = 'false'
await import('./index.js')
