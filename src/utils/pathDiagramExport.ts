import { POOR_MEASUREMENT_COLOR } from './analysisPalette'

/**
 * pathDiagramExport — Unified SVG/PNG export pipeline for Path Diagrams.
 *
 * Ensures that downloaded images from ResultsView/PathDiagram and images
 * embedded in the Tark report use the exact same styling, font sizing,
 * contrast colors, and high-resolution 2x canvas rasterization.
 */

export const EXPORT_DIAGRAM_TEXT_COLOR = '#000000'
export const EXPORT_DIAGRAM_BG_COLOR = '#FFFFFF'

export interface PathDiagramExportOptions {
  background?: string
  scale?: number
  textColor?: string
}

/**
 * Prepares a cloned SVGSVGElement with all computed CSS custom properties,
 * paints, strokes, and typography inlined so it renders identically outside the DOM.
 */
export function preparePathDiagramSvgForExport(
  svg: SVGSVGElement,
  options?: PathDiagramExportOptions,
): SVGSVGElement {
  const exportSvg = svg.cloneNode(true) as SVGSVGElement
  exportSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  const bg = options?.background ?? EXPORT_DIAGRAM_BG_COLOR
  exportSvg.style.background = bg

  const vb = svg.viewBox.baseVal
  if (vb?.width && vb?.height) {
    exportSvg.setAttribute('width', String(Math.max(1, vb.width)))
    exportSvg.setAttribute('height', String(Math.max(1, vb.height)))
    exportSvg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.width} ${vb.height}`)
  }

  // Preserve theme custom properties so exported SVG paths that use var(--color-*)
  // resolve correctly in standalone contexts.
  const rootStyles = getComputedStyle(document.documentElement)
  Array.from(rootStyles)
    .filter((name) => name.startsWith('--color-'))
    .forEach((name) => {
      const value = rootStyles.getPropertyValue(name).trim()
      if (value) exportSvg.style.setProperty(name, value)
    })

  const sourceElements = [svg, ...Array.from(svg.querySelectorAll('*'))]
  const exportElements = [exportSvg, ...Array.from(exportSvg.querySelectorAll('*'))]
  const textColor = options?.textColor ?? EXPORT_DIAGRAM_TEXT_COLOR

  sourceElements.forEach((sourceEl, index) => {
    const exportEl = exportElements[index]
    if (!(sourceEl instanceof Element) || !(exportEl instanceof Element)) return

    const computed = getComputedStyle(sourceEl)
    const tagName = sourceEl.tagName.toLowerCase()
    const attrFill = exportEl.getAttribute('fill') ?? ''
    const attrStroke = exportEl.getAttribute('stroke') ?? ''
    const styleAttr = sourceEl.getAttribute('style') ?? ''

    const hasPaintFill =
      attrFill !== 'none' &&
      (attrFill.includes('var(') ||
        styleAttr.includes('fill') ||
        tagName === 'text' ||
        tagName === 'tspan' ||
        tagName === 'rect' ||
        tagName === 'circle' ||
        tagName === 'ellipse' ||
        tagName === 'polygon')

    if (hasPaintFill && computed.fill && computed.fill !== 'none') {
      exportEl.setAttribute('fill', computed.fill)
    }

    if (
      attrStroke &&
      attrStroke !== 'none' &&
      computed.stroke &&
      computed.stroke !== 'none'
    ) {
      exportEl.setAttribute('stroke', computed.stroke)
    }

    if (exportEl.hasAttribute('stroke-width') && computed.strokeWidth) {
      exportEl.setAttribute('stroke-width', computed.strokeWidth)
    }

    if (exportEl.hasAttribute('opacity') && computed.opacity) {
      exportEl.setAttribute('opacity', computed.opacity)
    }

    if (tagName === 'text' || tagName === 'tspan') {
      const isPoorMeasurement = exportEl.getAttribute('data-analysis-tone') === 'poor-measurement'
        || exportEl.closest('[data-analysis-tone="poor-measurement"]') !== null
      const exportTextColor = isPoorMeasurement ? POOR_MEASUREMENT_COLOR : textColor
      exportEl.setAttribute('fill', exportTextColor)
      if (exportEl instanceof SVGElement && exportEl.style) {
        exportEl.style.fill = exportTextColor
        exportEl.style.color = exportTextColor
      }
      exportEl.setAttribute(
        'font-family',
        computed.fontFamily || 'Inter, system-ui, sans-serif',
      )
      exportEl.setAttribute('font-size', computed.fontSize || '11px')
      exportEl.setAttribute('font-weight', computed.fontWeight || '700')
    }
  })

  return exportSvg
}

/**
 * Converts an SVGSVGElement to a clean base64 PNG string (without the data: URL prefix).
 * Uses a default 2x scale for crisp, print-ready document embedding.
 */
export function exportPathDiagramToPngBase64(
  svg: SVGSVGElement,
  options?: PathDiagramExportOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const exportSvg = preparePathDiagramSvgForExport(svg, options)
    const serializer = new XMLSerializer()
    const svgStr = serializer.serializeToString(exportSvg)

    const vbAttr = svg.getAttribute('viewBox')
    let w = 1200
    let h = 800
    if (vbAttr) {
      const parts = vbAttr.split(/[\s,]+/)
      if (parts.length >= 4) {
        w = Math.max(400, parseFloat(parts[2]) || 1200)
        h = Math.max(300, parseFloat(parts[3]) || 800)
      }
    } else {
      const bbox = (svg as any).getBBox?.()
      if (bbox && bbox.width > 0 && bbox.height > 0) {
        w = Math.max(400, bbox.width + 80)
        h = Math.max(300, bbox.height + 80)
      }
    }

    const scale = options?.scale ?? 2
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('Canvas 2D context unavailable'))
      return
    }

    const bg = options?.background ?? EXPORT_DIAGRAM_BG_COLOR
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    const img = new Image()

    img.onload = () => {
      try {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(url)
        const dataUrl = canvas.toDataURL('image/png')
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
        resolve(base64)
      } catch (err) {
        URL.revokeObjectURL(url)
        reject(err)
      }
    }

    img.onerror = (err) => {
      URL.revokeObjectURL(url)
      reject(err instanceof Error ? err : new Error('Failed to render SVG to image'))
    }

    img.src = url
  })
}

/**
 * Triggers a browser/Electron file download for the path diagram as a PNG.
 */
export async function downloadPathDiagramAsPng(
  svg: SVGSVGElement,
  filename = 'path-diagram.png',
  options?: PathDiagramExportOptions,
): Promise<void> {
  const downloadOptions: PathDiagramExportOptions = {
    background: 'transparent',
    ...options,
  }
  const base64 = await exportPathDiagramToPngBase64(svg, downloadOptions)
  const a = document.createElement('a')
  a.download = filename.endsWith('.png') ? filename : `${filename}.png`
  a.href = `data:image/png;base64,${base64}`
  a.click()
}

/**
 * Triggers a browser/Electron file download for the path diagram as an SVG.
 */
export function downloadPathDiagramAsSvg(
  svg: SVGSVGElement,
  filename = 'path-diagram.svg',
  options?: PathDiagramExportOptions,
): void {
  const exportSvg = preparePathDiagramSvgForExport(svg, {
    background: 'transparent',
    ...options,
  })
  const serializer = new XMLSerializer()
  const svgStr = serializer.serializeToString(exportSvg)
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.download = filename.endsWith('.svg') ? filename : `${filename}.svg`
  a.href = url
  a.click()
  URL.revokeObjectURL(url)
}
