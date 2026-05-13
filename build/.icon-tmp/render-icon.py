import os
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
