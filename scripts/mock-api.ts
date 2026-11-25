// Local stand-in for the Supabase function, for testing sync on this machine only: node scripts/mock-api.ts
// Data lives in memory and is gone when this stops. The PINs below are test values, never use them on the real system.
import { createServer } from 'node:http'
import { handle, hashPin, memoryStore } from '../supabase/functions/bonus-workspace/core.ts'

const TEST_PINS = { manager: '11112222', staff: '33334444' }
const store = memoryStore({ manager: await hashPin(TEST_PINS.manager), staff: await hashPin(TEST_PINS.staff) })
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }

createServer(async (req, res) => {
  if (req.method !== 'POST') return void res.writeHead(204, cors).end()
  let text = ''
  for await (const chunk of req) text += chunk
  const r = await handle(JSON.parse(text || '{}'), req.socket.remoteAddress ?? 'local', store)
  res.writeHead(r.status, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify(r.body))
}).listen(5184, () => console.log('mock api on http://localhost:5184'))
