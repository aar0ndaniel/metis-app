import { app, BrowserWindow } from 'electron'
import fs from 'fs'

const svgPath = process.argv[2]
const outputPath = process.argv[3]
const size = 512

function fail(error) {
  console.error(error)
  process.exit(1)
}

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-crash-reporter')
app.commandLine.appendSwitch('disable-breakpad')

app.whenReady().then(async () => {
  const svg = fs.readFileSync(svgPath, 'utf8')
  const html = '<!doctype html><html><head><meta charset="utf-8"><style>' +
    'html,body{margin:0;width:' + size + 'px;height:' + size + 'px;overflow:hidden;background:transparent;}' +
    'body{display:grid;place-items:center;}' +
    'img{width:92%;height:92%;object-fit:contain;user-select:none;-webkit-user-drag:none;}' +
    '</style></head><body>' +
    '<img src="data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '" alt="" />' +
    '</body></html>'

  const win = new BrowserWindow({
    show: false,
    width: size,
    height: size,
    useContentSize: true,
    backgroundColor: '#00000000',
    webPreferences: {
      offscreen: true,
      contextIsolation: true,
      sandbox: false,
    },
  })

  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    await new Promise((resolve) => setTimeout(resolve, 200))
    const image = await win.webContents.capturePage()
    fs.writeFileSync(outputPath, image.toPNG())
  } catch (error) {
    fail(error)
  } finally {
    win.destroy()
    app.quit()
  }
}).catch(fail)
