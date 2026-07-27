import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import pngToIco from 'png-to-ico'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const srcSvg = path.resolve(repoRoot, 'src/assets/logo-icon.svg')
const destResources = path.resolve(repoRoot, 'resources/icon.ico')
const destBuild = path.resolve(repoRoot, 'build/icon.ico')
const tempDir = path.resolve(repoRoot, 'build/.icon-tmp')
const renderScript = path.join(tempDir, 'render-icon.py')
const outputPng = path.join(tempDir, 'icon-render.png')
const iconSize = 512

fs.mkdirSync(tempDir, { recursive: true })

const pythonSource = `import os
import sys

from PyQt5.QtCore import Qt
from PyQt5.QtGui import QGuiApplication, QImage, QPainter
from PyQt5.QtSvg import QSvgRenderer

svg_path = sys.argv[1]
png_path = sys.argv[2]
size = int(sys.argv[3])

app = QGuiApplication([])
with open(svg_path, 'rb') as f:
    svg_bytes = f.read()

renderer = QSvgRenderer(svg_bytes)
if not renderer.isValid():
    raise SystemExit('Invalid SVG source')

image = QImage(size, size, QImage.Format_ARGB32)
image.fill(Qt.transparent)
painter = QPainter(image)
renderer.render(painter)
painter.end()

if not image.save(png_path):
    raise SystemExit('Failed to save PNG')

app.quit()
`

fs.writeFileSync(renderScript, pythonSource, 'utf8')

try {
  execFileSync('cmd.exe', [
    '/d',
    '/s',
    '/c',
    `python "${renderScript}" "${srcSvg}" "${outputPng}" ${iconSize}`,
  ], {
    env: {
      ...process.env,
      QT_QPA_PLATFORM: process.env.QT_QPA_PLATFORM || 'offscreen',
    },
    stdio: 'pipe',
  })
} catch (error) {
  throw new Error(`SVG rasterization failed: ${error.stderr?.toString?.() ?? error.message}`)
}

const buf = await pngToIco(outputPng)
fs.writeFileSync(destResources, buf)
fs.writeFileSync(destBuild, buf)
console.log('icon.ico written to', destResources)
console.log('icon.ico written to', destBuild)
