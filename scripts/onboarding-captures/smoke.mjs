import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const debuggerBase = process.env.METIS_CAPTURE_DEBUGGER || 'http://127.0.0.1:9333'
const appUrl = process.env.METIS_SMOKE_APP || 'http://127.0.0.1:4173/#/'
const page = await fetch(`${debuggerBase}/json/new?${encodeURIComponent(appUrl)}`, { method: 'PUT' }).then(response => response.json())
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let messageId = 0
const pending = new Map()
const browserDiagnostics = []
socket.addEventListener('message', event => {
  const message = JSON.parse(String(event.data))
  if (message.method === 'Runtime.exceptionThrown') {
    browserDiagnostics.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
  }
  if (message.method === 'Log.entryAdded') {
    browserDiagnostics.push(`${message.params.entry.level}: ${message.params.entry.text}`)
  }
  if (!message.id) return
  const request = pending.get(message.id)
  if (!request) return
  pending.delete(message.id)
  if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`))
  else request.resolve(message.result)
})

function send(method, params = {}) {
  const id = ++messageId
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }))
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Page.navigate', { url: appUrl })
await wait(1300)
await evaluate(`(() => {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('metis:onboarding:0.3.0:')) localStorage.removeItem(key)
  }
  location.reload()
  return true
})()`)
await wait(1800)

const initial = await evaluate(`(() => {
  const dialog = document.querySelector('[aria-labelledby="metis-whats-new-title"]')
  const rect = dialog?.getBoundingClientRect()
  return { text: document.body.innerText, width: Math.round(rect?.width || 0), height: Math.round(rect?.height || 0) }
})()`)
if (!initial.text) {
  console.error('Blank-page diagnostics:', browserDiagnostics)
  console.error('Location:', await evaluate('location.href'))
  console.error('Markup:', await evaluate('document.documentElement.outerHTML'))
}
assert.match(initial.text, /What's new in Metis 0\.3\.0/)
assert.match(initial.text, /Analysis menu/)
assert.equal(initial.width, 520)
assert.equal(initial.height, 410)

const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
await fs.writeFile('C:\\tmp\\metis-whats-new-smoke.png', Buffer.from(screenshot.data, 'base64'))

for (const expectedTitle of [
  'Four interface languages',
  'Permutation Analysis (MICOM)',
  'Multi Group Analysis (MGA)',
  'Tark reports',
]) {
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Next update'))?.click()`)
  await wait(220)
  assert.match(await evaluate('document.body.innerText'), new RegExp(expectedTitle.replace(/[()]/g, '\\$&')))
}

await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Start walkthrough'))?.click()`)
await wait(300)
const walkthrough = await evaluate(`({ text: document.body.innerText, viewed: localStorage.getItem('metis:onboarding:0.3.0:whats-new-viewed') })`)
assert.match(walkthrough.text, /Welcome to .*0\.3\.0/)
assert.match(walkthrough.text, /Create my workspace/)
assert.equal(walkthrough.viewed, 'true')

await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Create my workspace'))?.click()`)
await wait(220)
assert.match(await evaluate('document.body.innerText'), /Create your workspace/)
await evaluate(`document.querySelector('button[aria-label="Close walkthrough"]')?.click()`)
await wait(180)
assert.equal(await evaluate(`localStorage.getItem('metis:onboarding:0.3.0:dismissed')`), 'true')

socket.close()
console.log('PASS 0.3.0 onboarding browser smoke')
