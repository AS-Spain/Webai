import { app } from './app.js'
const port = Number(process.env.PORT || 3002)
app.listen(port, '0.0.0.0', () => console.log(`Northstar v2 API en puerto ${port}`))
