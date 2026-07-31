import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import JSZip from 'jszip'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const tempDir = path.join(workspaceRoot, '.tmp-tests')

async function bundleModule(relativeEntry, outfileName) {
  const entryPoint = path.join(workspaceRoot, relativeEntry)
  const outfile = path.join(tempDir, outfileName)

  await fs.mkdir(tempDir, { recursive: true })

  try {
    await build({
      entryPoints: [entryPoint],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      sourcemap: 'inline',
      loader: { '.svg': 'dataurl' },
      logLevel: 'silent',
    })
  } catch (error) {
    return { error }
  }

  try {
    const moduleUrl = `${pathToFileURL(outfile).href}?t=${Date.now()}`
    return { module: await import(moduleUrl) }
  } catch (error) {
    return { error }
  }
}


const bundled = await bundleModule('src/utils/tarkReportDocx.ts', 'tarkReportDocx.test.bundle.mjs')
assert.ok(!bundled.error, `Expected Tark docx helper to compile, got: ${bundled.error?.message ?? 'unknown error'}`)

const {
  buildTarkReportDocxBase64,
  sanitizeTarkDocxFilename,
  stripTarkDocxExtension,
} = bundled.module ?? {}

assert.equal(typeof buildTarkReportDocxBase64, 'function', 'Tark docx helper should export a base64 builder.')
assert.equal(typeof sanitizeTarkDocxFilename, 'function', 'Tark docx helper should export filename sanitizing.')

assert.equal(typeof stripTarkDocxExtension, 'function', 'Tark docx helper should expose an extension-free display name helper.')
assert.equal(
  sanitizeTarkDocxFilename('Teaching / Social:Tark Report'),
  'Teaching_Social_Tark_Report.docx',
  'Tark filenames should remove unsupported characters and keep .docx.',
)
assert.equal(
  sanitizeTarkDocxFilename('report.docx'),
  'report.docx',
  'Existing .docx filenames should not receive a duplicate extension.',
)

assert.equal(
  stripTarkDocxExtension('Teaching report.docx'),
  'Teaching report',
  'The Step 3 filename field should omit the system-managed .docx extension.',
)
assert.equal(
  stripTarkDocxExtension(''),
  '',
  'Deleting the whole Step 3 filename should leave the field empty for retyping.',
)
const base64 = await buildTarkReportDocxBase64({
  title: 'Teaching and Social Tark Report',
  sections: [
    {
      title: 'Measurement model assessment',
      headers: ['Construct', 'Indicator', 'Loading', 'VIF', 'Cronbach’s α', 'rho_A', 'CR', 'AVE'],
      rows: [
        ['Teacher presence', 'TP1', '0.812', '1.234', '0.800', '0.820', '0.880', '0.650'],
        ['\u200B', 'TP2', '0.834', '1.345', '\u200B', '\u200B', '\u200B', '\u200B'],
      ],
      note: 'Note. Loading = outer loading; VIF = variance inflation factor; CR = composite reliability; AVE = average variance extracted.',
    },
    {
      title: 'CE-FDH bottleneck table',
      headers: ['Level (%)', 'Teacher presence', 'Social presence', 'Cognitive presence', 'Outcome support', 'Peer support', 'Technology access', 'Facilitation'],
      rows: [
        ['0', 'NN', 'NN', 'NN', 'NN', 'NN', 'NN', 'NN'],
        ['100', '90.000', '85.000', '—', '77.000', 'NN', '61.000', '59.000'],
      ],
      note: 'Note. Values represent the minimum level of each condition required to achieve a given level of the outcome. NN means not necessary.',
    },
  ],
})

assert.doesNotMatch(
  String(buildTarkReportDocxBase64),
  /fetch\(/,
  'The Tark Word document generator should not rely on runtime fetch for the embedded logo.',
)

const buffer = Buffer.from(base64, 'base64')
assert.ok(buffer.length > 1500, 'Generated .docx should have a real zipped package body.')

const zip = await JSZip.loadAsync(buffer)
assert.ok(zip.file('[Content_Types].xml'), 'Generated .docx should include content types.')
assert.ok(zip.file('word/document.xml'), 'Generated .docx should include a Word document part.')
assert.ok(zip.file('word/styles.xml'), 'Generated .docx should include styles.')
assert.ok(zip.file('word/footer1.xml'), 'Generated .docx should include the Metis footer part.')
assert.ok(zip.file('word/media/metis-logo.png'), 'Generated .docx should embed the Metis logo in the footer as PNG.')
assert.ok(zip.file('word/_rels/footer1.xml.rels'), 'Generated .docx should include footer relationships.')
assert.equal(zip.file('word/media/table-1.png'), null, 'Tark tables must not be inserted as screenshots.')

const documentXml = await zip.file('word/document.xml').async('string')
const stylesXml = await zip.file('word/styles.xml').async('string')
const footerXml = await zip.file('word/footer1.xml').async('string')
const footerRelationshipsXml = await zip.file('word/_rels/footer1.xml.rels').async('string')
assert.match(documentXml, /<w:document/, 'Document XML should be WordprocessingML.')
assert.match(documentXml, /<w:pStyle w:val="Title"/, 'Report title should use the Word Title style.')
assert.match(stylesXml, /w:styleId="Title"[\s\S]*w:color w:val="87976B"/, 'Report title should use the Metis olive green.')
assert.match(documentXml, /Teaching and Social Tark Report/, 'Report title should be written into the document.')
assert.match(documentXml, /<w:pStyle w:val="Heading1"/, 'Report sections should use Word heading levels.')
assert.match(documentXml, /Table 1/, 'Tables should be numbered sequentially above titles.')
assert.match(documentXml, /Measurement model assessment/, 'Core Tark table title should be present.')
assert.match(documentXml, /<w:tbl>/, 'Tables should be native editable Word tables.')
assert.match(documentXml, /<w:tcMar><w:left w:w="120" w:type="dxa"\/><w:right w:w="120" w:type="dxa"\/><\/w:tcMar>/, 'Tark table cells should have readable left and right internal margins.')
assert.match(documentXml, /<w:b\/>/, 'Column headings should be bold.')
assert.match(documentXml, /<w:tblHeader\/>/, 'Header rows should repeat when a table spans pages.')
assert.match(documentXml, /<w:cantSplit\/>/, 'Rows should request no page splitting where possible.')
assert.match(documentXml, /w:insideV w:val="nil"/, 'APA tables should not use vertical cell borders.')
assert.match(documentXml, /w:top w:val="single" w:sz="12"/, 'APA tables should use a strong top rule.')
assert.match(documentXml, /w:bottom w:val="single" w:sz="12"/, 'APA tables should use a strong bottom rule.')
assert.match(documentXml, /NN/, 'NN values should be preserved exactly.')
assert.match(documentXml, /w:orient="landscape"/, 'Wide tables should switch to a landscape Word section.')
assert.doesNotMatch(documentXml, /\[object Object\]/, 'Object-shaped values must not leak into Word cells.')
assert.match(stylesXml, /w:rFonts w:ascii="Candara" w:hAnsi="Candara" w:eastAsia="Candara" w:cs="Candara"\/><w:sz w:val="20"\/>/, 'Tark Word reports should use 10-point Candara as their base font.')
assert.match(documentXml, /<w:footerReference w:type="default" r:id="rIdFooter1"\/>/, 'Each report section should reference the shared Metis footer.')
assert.match(footerXml, /r:embed="rIdMetisLogo"/, 'Footer should render the embedded Metis logo.')
assert.match(footerXml, /<w:t xml:space="preserve">\s*metis<\/w:t>/, 'Footer should display the Metis brand name.')
const dummyPngBase64 = 'iVBORw0KGgoAAAANSU5EUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const base64WithDiagram = await buildTarkReportDocxBase64({
  title: 'Teaching and Social Tark Report',
  pathDiagramPngBase64: dummyPngBase64,
  sections: [
    {
      title: 'Measurement model assessment',
      headers: ['Construct', 'Indicator', 'Loading'],
      rows: [['TP', 'TP1', '0.812']],
    },
  ],
})

const bufferWithDiagram = Buffer.from(base64WithDiagram, 'base64')
const zipWithDiagram = await JSZip.loadAsync(bufferWithDiagram)
assert.ok(zipWithDiagram.file('word/media/path-diagram.png'), 'Generated .docx should embed path diagram PNG.')

const documentXmlWithDiagram = await zipWithDiagram.file('word/document.xml').async('string')
const docRelsXmlWithDiagram = await zipWithDiagram.file('word/_rels/document.xml.rels').async('string')
assert.match(docRelsXmlWithDiagram, /Target="media\/path-diagram\.png"/, 'document.xml.rels should reference path-diagram.png.')
assert.match(docRelsXmlWithDiagram, /Id="rIdPathDiagram"/, 'document.xml.rels should contain rIdPathDiagram.')
assert.match(documentXmlWithDiagram, /r:embed="rIdPathDiagram"/, 'document.xml should embed rIdPathDiagram on page 1.')
assert.match(documentXmlWithDiagram, /Path diagram|Model path diagram/, 'document.xml should include heading for path diagram.')

console.log('PASS Tark Word document generator contract')
