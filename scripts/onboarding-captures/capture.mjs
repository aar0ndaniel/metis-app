import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(scriptDir, '..', '..')
const outputDir = path.join(workspaceRoot, 'src', 'assets', 'onboarding', '0.3.0')
const debuggerBase = process.env.METIS_CAPTURE_DEBUGGER || 'http://127.0.0.1:9333'
const appBase = process.env.METIS_CAPTURE_APP || 'http://127.0.0.1:4173/scripts/onboarding-captures/'

await fs.mkdir(outputDir, { recursive: true })

const page = await fetch(`${debuggerBase}/json/new?${encodeURIComponent(`${appBase}?capture=analysis`)}`, { method: 'PUT' }).then(response => response.json())
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let messageId = 0
const pending = new Map()
socket.addEventListener('message', event => {
  const message = JSON.parse(String(event.data))
  if (message.method === 'Runtime.exceptionThrown') {
    console.error(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Browser runtime exception')
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
await send('Page.enable')
await send('Runtime.enable')

const allCaptures = [
  ['analysis', 'analysis-titlebar.png'],
  ['languages', 'languages.png'],
  ['micom', 'micom.png'],
  ['mga', 'mga.png'],
  ['tark', 'tark-report.png'],
]
const captureOnly = process.env.METIS_CAPTURE_ONLY
const captures = captureOnly ? allCaptures.filter(([capture]) => capture === captureOnly) : allCaptures

for (const [capture, fileName] of captures) {
  await send('Page.navigate', { url: `${appBase}?capture=${capture}` })
  await wait(1100)
  const moduleStatus = await send('Runtime.evaluate', {
    expression: `import('/scripts/onboarding-captures/capture.tsx').then(() => 'module loaded').catch(error => String(error?.stack || error))`,
    awaitPromise: true,
    returnByValue: true,
  })
  console.log('Module', moduleStatus.result.value)
  await wait(500)
  const rendered = await send('Runtime.evaluate', {
    expression: `({
      text: document.body.innerText.slice(0, 240),
      childCount: document.body.querySelectorAll('*').length,
      root: document.getElementById('root')?.innerHTML.slice(0, 240),
      scripts: Array.from(document.scripts).map(script => script.src),
      resources: performance.getEntriesByType('resource').map(entry => entry.name).slice(-8),
      url: location.href,
    })`,
    returnByValue: true,
  })
  console.log('Rendered', rendered.result.value)
  const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(outputDir, fileName), Buffer.from(screenshot.data, 'base64'))
  console.log(`Captured ${fileName} (1100x760)`)
}

socket.close()
