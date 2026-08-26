import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(scriptDir, '..', '..')
const outputDir = path.join(workspaceRoot, 'src', 'assets', 'onboarding', '0.3.1')
const debuggerBase = process.env.METIS_CAPTURE_DEBUGGER || 'http://127.0.0.1:9333'
const appBase = process.env.METIS_CAPTURE_APP || 'http://127.0.0.1:4173/scripts/onboarding-captures/'
const captureWidth = 1100
const captureHeight = 760

await fs.mkdir(outputDir, { recursive: true })

console.log(`Connecting to capture browser at ${debuggerBase}`)
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
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`${method} timed out after 45 seconds`))
    }, 45000)
    pending.set(id, {
      method,
      resolve: value => {
        clearTimeout(timeout)
        resolve(value)
      },
      reject: error => {
        clearTimeout(timeout)
        reject(error)
      },
    })
  })
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

async function waitForCaptureSurface(capture, expectedText) {
  let rendered = null
  for (let attempt = 0; attempt < 80; attempt += 1) {
    rendered = await send('Runtime.evaluate', {
      expression: `({
        capture: new URLSearchParams(location.search).get('capture'),
        captureSurface: document.documentElement.dataset.captureSurface,
        readyState: document.readyState,
        fontStatus: document.fonts?.status ?? 'loaded',
        text: document.body.innerText.slice(0, 2000),
        childCount: document.body.querySelectorAll('*').length,
        root: document.getElementById('root')?.innerHTML.slice(0, 240),
        scripts: Array.from(document.scripts).map(script => script.src),
        resources: performance.getEntriesByType('resource').map(entry => entry.name).slice(-8),
        url: location.href,
      })`,
      returnByValue: true,
    })
    const value = rendered.result.value
    if (
      value?.capture === capture &&
      value.captureSurface === capture &&
      value.readyState === 'complete' &&
      value.fontStatus === 'loaded' &&
      value.root &&
      value.childCount >= 2 &&
      value.text.includes(expectedText)
    ) return value
    await wait(250)
  }
  throw new Error(`Capture surface did not render for ${capture}: ${JSON.stringify(rendered?.result?.value)}`)
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: captureWidth,
  height: captureHeight,
  deviceScaleFactor: 1,
  mobile: false,
})

const allCaptures = [
  ['algorithm-preferences', 'algorithm-preferences.png', 'Bundle 0.3.1'],
  ['missing-data-highlighting', 'missing-data-highlighting.png', 'Cell 2, column 3'],
  ['missing-data-marker', 'missing-data-marker.png', 'None (all valid)'],
  ['tark', 'tark-report.png', 'Report setup'],
  ['analysis', 'analysis-titlebar.png', 'Permutation Analysis (MICOM)'],
]
const captureOnly = process.env.METIS_CAPTURE_ONLY
const captures = captureOnly ? allCaptures.filter(([capture]) => capture === captureOnly) : allCaptures

for (const [capture, fileName, expectedText] of captures) {
  console.log(`Navigating to ${capture}`)
  await send('Page.navigate', { url: `${appBase}?capture=${capture}` })
  const rendered = await waitForCaptureSurface(capture, expectedText)
  await send('Runtime.evaluate', {
    expression: 'document.fonts?.ready ?? Promise.resolve()',
    awaitPromise: true,
  })
  console.log(`Capture surface ready for ${capture}: ${rendered.text}`)
  await wait(600)
  const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(outputDir, fileName), Buffer.from(screenshot.data, 'base64'))
  console.log(`Captured ${fileName} (${captureWidth}x${captureHeight})`)
}

socket.close()
