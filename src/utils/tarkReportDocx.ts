import JSZip from 'jszip'
import type { TarkReportSection } from './tarkReportTables'

export interface TarkReportDocxRequest {
  title: string
  sections: TarkReportSection[]
  pathDiagramPngBase64?: string
}

const WORD_XMLNS = [
  'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"',
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
  'xmlns:o="urn:schemas-microsoft-com:office:office"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"',
  'xmlns:v="urn:schemas-microsoft-com:vml"',
  'xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:w10="urn:schemas-microsoft-com:office:word"',
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"',
  'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"',
  'xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"',
  'xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"',
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
  'mc:Ignorable="w14 wp14"',
].join(' ')

const METIS_OLIVE_GREEN = '87976B'
const FOOTER_REFERENCE = '<w:footerReference w:type="default" r:id="rIdFooter1"/>'
const PORTRAIT_SECTION = `<w:sectPr>${FOOTER_REFERENCE}<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1080" w:bottom="1440" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`
const LANDSCAPE_SECTION = `<w:sectPr>${FOOTER_REFERENCE}<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="1080" w:right="900" w:bottom="1080" w:left="900" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function cleanCell(value: unknown): string {
  const text = String(value ?? '')
  return text === '\u200B' ? '' : text
}

function isNumericCell(value: string): boolean {
  const text = value.trim()
  if (!text || text === 'NN') return false
  return /^<?-?\d+(?:\.\d+)?%?$/.test(text) || /^\[-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?\]$/.test(text)
}

function paragraph(text = '', style?: string, options: { italic?: boolean; bold?: boolean } = {}): string {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''
  const runProps = options.italic || options.bold
    ? `<w:rPr>${options.bold ? '<w:b/>' : ''}${options.italic ? '<w:i/>' : ''}</w:rPr>`
    : ''
  return `<w:p>${styleXml}<w:r>${runProps}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
}

function sectionBreak(sectionXml: string): string {
  return `<w:p><w:pPr>${sectionXml}</w:pPr></w:p>`
}

function tableCell(value: string, header: boolean, numeric: boolean): string {
  const alignment = numeric ? '<w:jc w:val="right"/>' : ''
  const runProps = header ? '<w:rPr><w:b/></w:rPr>' : ''
  return [
    '<w:tc>',
    '<w:tcPr><w:tcW w:w="0" w:type="auto"/><w:tcMar><w:left w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar></w:tcPr>',
    `<w:p><w:pPr>${alignment}</w:pPr><w:r>${runProps}<w:t xml:space="preserve">${escapeXml(cleanCell(value))}</w:t></w:r></w:p>`,
    '</w:tc>',
  ].join('')
}

function tableRow(cells: string[], header = false): string {
  const rowProps = `<w:trPr><w:cantSplit/>${header ? '<w:tblHeader/>' : ''}</w:trPr>`
  return `<w:tr>${rowProps}${cells.map((cell, index) => tableCell(cell, header, !header && index > 0 && isNumericCell(cleanCell(cell)))).join('')}</w:tr>`
}

function tableXml(section: TarkReportSection): string {
  const rows = [tableRow(section.headers, true), ...section.rows.map((row) => tableRow(row))]
  return [
    '<w:tbl>',
    '<w:tblPr>',
    '<w:tblStyle w:val="TarkApaTable"/>',
    '<w:tblW w:w="0" w:type="auto"/>',
    '<w:tblLook w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/>',
    '<w:tblBorders>',
    `<w:top w:val="single" w:sz="12" w:space="0" w:color="${METIS_OLIVE_GREEN}"/>`,
    '<w:left w:val="nil"/>',
    `<w:bottom w:val="single" w:sz="12" w:space="0" w:color="${METIS_OLIVE_GREEN}"/>`,
    '<w:right w:val="nil"/>',
    '<w:insideH w:val="single" w:sz="6" w:space="0" w:color="808080"/>',
    '<w:insideV w:val="nil"/>',
    '</w:tblBorders>',
    '</w:tblPr>',
    rows.join(''),
    '</w:tbl>',
  ].join('')
}

function needsLandscape(section: TarkReportSection): boolean {
  return section.headers.length >= 7
}

function pathDiagramDrawingXml(rId = 'rIdPathDiagram', cx = 5486400, cy = 3657600): string {
  return [
    '<w:p>',
    '<w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr>',
    '<w:r>',
    '<w:rPr><w:noProof/></w:rPr>',
    '<w:drawing>',
    '<wp:inline distT="0" distB="0" distL="0" distR="0">',
    `<wp:extent cx="${cx}" cy="${cy}"/>`,
    '<wp:effectExtent l="0" t="0" r="0" b="0"/>',
    '<wp:docPr id="2" name="Path Diagram" descr="Path Diagram"/>',
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>',
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">',
    '<pic:pic>',
    '<pic:nvPicPr><pic:cNvPr id="0" name="path-diagram.png"/><pic:cNvPicPr/></pic:nvPicPr>',
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`,
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`,
    '</pic:pic>',
    '</a:graphicData></a:graphic>',
    '</wp:inline>',
    '</w:drawing>',
    '</w:r>',
    '</w:p>',
  ].join('')
}

function documentXml(request: TarkReportDocxRequest): string {
  let tableNumber = 1
  const body: string[] = [
    paragraph(request.title.trim() || 'Tark report', 'Title'),
    paragraph(''),
  ]

  if (request.pathDiagramPngBase64?.trim()) {
    body.push(paragraph('Model path diagram', 'Heading1'))
    body.push(pathDiagramDrawingXml())
    body.push(paragraph('Figure 1. Model path diagram.', 'TarkTableNote', { italic: true }))
    body.push(paragraph(''))
  }

  request.sections.forEach((section) => {
    const headingOnly = section.headers.length === 0 && section.rows.length === 0
    if (headingOnly) {
      body.push(paragraph(section.title, 'Heading1'))
      if (section.note) body.push(paragraph(section.note, 'TarkTableNote'))
      body.push(paragraph(''))
      return
    }

    const landscape = needsLandscape(section)
    if (landscape) body.push(sectionBreak(PORTRAIT_SECTION))

    body.push(paragraph(section.title, 'Heading1'))
    body.push(paragraph(`Table ${tableNumber}`, 'TarkTableNumber', { bold: true }))
    body.push(paragraph(section.title, 'TarkTableTitle', { italic: true }))
    body.push(tableXml(section))
    if (section.note) body.push(paragraph(section.note, 'TarkTableNote'))
    body.push(paragraph(''))

    if (landscape) body.push(sectionBreak(LANDSCAPE_SECTION))
    tableNumber += 1
  })

  body.push(PORTRAIT_SECTION)
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${WORD_XMLNS}><w:body>${body.join('')}</w:body></w:document>`
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr/><w:rPr><w:rFonts w:ascii="Candara" w:hAnsi="Candara" w:eastAsia="Candara" w:cs="Candara"/><w:sz w:val="20"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:color w:val="${METIS_OLIVE_GREEN}"/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="${METIS_OLIVE_GREEN}"/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="TarkTableNumber"><w:name w:val="Tark Table Number"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="120" w:after="0"/></w:pPr><w:rPr><w:b/><w:color w:val="${METIS_OLIVE_GREEN}"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="TarkTableTitle"><w:name w:val="Tark Table Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="TarkTableNote"><w:name w:val="Tark Table Note"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="120" w:after="120"/></w:pPr><w:rPr><w:i/><w:sz w:val="20"/></w:rPr></w:style>
  <w:style w:type="table" w:styleId="TarkApaTable"><w:name w:val="Tark APA Table"/><w:basedOn w:val="TableNormal"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="12" w:color="${METIS_OLIVE_GREEN}"/><w:left w:val="nil"/><w:bottom w:val="single" w:sz="12" w:color="${METIS_OLIVE_GREEN}"/><w:right w:val="nil"/><w:insideH w:val="single" w:sz="6" w:color="808080"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr></w:style>
</w:styles>`
}

function contentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`
}

function packageRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
}

function documentRelationshipsXml(hasPathDiagram = false): string {
  const rels = [
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>',
  ]
  if (hasPathDiagram) {
    rels.push('<Relationship Id="rIdPathDiagram" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/path-diagram.png"/>')
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n  ${rels.join('\n  ')}\n</Relationships>`
}

function footerRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdMetisLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/metis-logo.png"/>
</Relationships>`
}

function footerLogoXml(): string {
  return [
    '<w:r><w:rPr><w:noProof/></w:rPr><w:drawing>',
    '<wp:inline distT="0" distB="0" distL="0" distR="0">',
    '<wp:extent cx="114300" cy="149860"/>',
    '<wp:effectExtent l="0" t="0" r="0" b="0"/>',
    '<wp:docPr id="1" name="Metis logo" descr="Metis logo"/>',
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>',
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">',
    '<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="metis-logo.png"/><pic:cNvPicPr/></pic:nvPicPr>',
    '<pic:blipFill><a:blip r:embed="rIdMetisLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>',
    '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="114300" cy="149860"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>',
    '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>',
  ].join('')
}

function footerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${WORD_XMLNS}><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120"/></w:pPr>${footerLogoXml()}<w:r><w:rPr><w:rFonts w:ascii="Candara" w:hAnsi="Candara"/><w:color w:val="${METIS_OLIVE_GREEN}"/><w:b/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">  metis</w:t></w:r></w:p></w:ftr>`
}

function metisLogoPngBytes(): Uint8Array {
  const base64 = 'iVBORw0KGgoAAAANSU5EUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAA3SURBVFhH7c0xAQAwDASh+zd9pWB0DngwBwAAfLN2c3u8x3N3e4yP+Pj4+Pj4+Pj4+Pj4+PiI7w02yRzJqH21LAAAAABJRU5ErkJggg=='
  const binary = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function sanitizeTarkDocxFilename(value: string): string {
  const base = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 160) || 'Tark_report'

  return /\.docx$/i.test(base) ? base : `${base}.docx`
}

export function stripTarkDocxExtension(value: string): string {
  return String(value ?? '').replace(/\.docx$/i, '')
}

export async function buildTarkReportDocxBase64(request: TarkReportDocxRequest): Promise<string> {
  const zip = new JSZip()
  const logoData = metisLogoPngBytes()
  const hasPathDiagram = Boolean(request.pathDiagramPngBase64?.trim())

  zip.file('[Content_Types].xml', contentTypesXml())
  zip.file('_rels/.rels', packageRelationshipsXml())
  zip.file('word/_rels/document.xml.rels', documentRelationshipsXml(hasPathDiagram))
  zip.file('word/_rels/footer1.xml.rels', footerRelationshipsXml())
  zip.file('word/styles.xml', stylesXml())
  zip.file('word/footer1.xml', footerXml())
  zip.file('word/media/metis-logo.png', logoData)

  if (hasPathDiagram && request.pathDiagramPngBase64) {
    zip.file('word/media/path-diagram.png', request.pathDiagramPngBase64, { base64: true })
  }

  zip.file('word/document.xml', documentXml(request))
  return zip.generateAsync({ type: 'base64', compression: 'DEFLATE' })
}
