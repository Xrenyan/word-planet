// Run with Node --experimental-transform-types. Uses disposable synthetic data only.
import assert from 'node:assert/strict'
import { createVault, readVault, updateVault, deleteVault, generatePairingCode } from '../src/features/sync/vaultClient.ts'

const origin = process.argv[2]
if (!origin?.startsWith('https://')) throw new Error('Provide the deployed HTTPS API origin')
const code = generatePairingCode()
const browserOrigin = 'https://xrenyan.github.io'
const options = { fetch: async (url, request) => {
  const response = await fetch(url, { ...request, headers: { ...request.headers, Origin: browserOrigin } })
  assert.equal(response.headers.get('access-control-allow-origin'), browserOrigin, `CORS missing (HTTP ${response.status})`)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  return response
} }
let created = false
try {
  const preflight = await fetch(`${origin}/api/vault/${code.split('.')[0]}`, { method:'OPTIONS', headers:{ Origin:browserOrigin,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization,content-type,if-none-match' } })
  assert.equal(preflight.status,204)
  const first = { version:1, events:[{ id:'synthetic-device-a', profileId:'local-child', wordId:'photo-g4-upper-u1-1', outcome:'correct', source:'spelling', occurredAt:Date.now() }] }
  const started = Date.now()
  const saved = await createVault(origin,code,first,options)
  created = true
  assert.equal(saved.revision,1)
  const secondDevice = await readVault(origin,code,options)
  assert.deepEqual(secondDevice.data,first)
  const merged = { ...first, events:[...first.events,{ ...first.events[0],id:'synthetic-device-b',outcome:'missed' }] }
  const updated = await updateVault(origin,code,merged,secondDevice.revision,options)
  assert.equal(updated.revision,2)
  await assert.rejects(updateVault(origin,code,first,1,options),error=>error.status===409)
  assert.deepEqual((await readVault(origin,code,options)).data,merged)
  const other = generatePairingCode()
  const wrong = `${code.split('.')[0]}.${other.split('.')[1]}`
  await assert.rejects(readVault(origin,wrong,options),error=>error.status===404)
  console.log(JSON.stringify({preflight:'passed',crossDeviceRoundtrip:'passed',staleWriteRejected:true,wrongSecretRejected:true,elapsedMs:Date.now()-started}))
} finally {
  if (created) {
    await deleteVault(origin,code,options)
    await assert.rejects(readVault(origin,code,options),error=>error.status===404)
    console.log('Disposable encrypted test backup deleted and absence verified.')
  }
}
