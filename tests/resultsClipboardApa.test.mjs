import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

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

const bundled = await bundleModule('src/results/clipboardTables.ts', 'resultsClipboardApa.test.bundle.mjs')
assert.ok(!bundled.error, `Expected clipboard table helpers to compile, got: ${bundled.error?.message ?? 'unknown error'}`)

const { buildClipboardTableHtml, buildClipboardTableText } = bundled.module ?? {}
assert.equal(typeof buildClipboardTableHtml, 'function', 'clipboard helpers should export table HTML builder')
assert.equal(typeof buildClipboardTableText, 'function', 'clipboard helpers should export table text builder')

const html = buildClipboardTableHtml(
  [
    {
      title: 'Path Coefficients',
      headers: ['Path', 'Original sample', 'T statistics', 'P values'],
      rows: [['Image -> Satisfaction', '0.418', '3.21', '<0.001']],
    },
  ],
  'Path Coefficients',
)

assert.match(html, /<strong>Table 1<\/strong>/, 'APA clipboard table should include a table number')
assert.match(html, /<p[^>]*>Path Coefficients<\/p>/, 'APA clipboard table should include a plain title')
assert.doesNotMatch(html, /<em>Path Coefficients<\/em>/, 'APA clipboard table title should not be italicized')
assert.match(html, /font-family:&quot;Times New Roman&quot;, Times, serif|font-family:"Times New Roman", Times, serif/, 'APA clipboard table should use APA-friendly serif typography')
assert.match(html, /border-top:1\.5pt solid #000/, 'APA clipboard table should have a top horizontal rule')
assert.match(html, /border-bottom:1\.5pt solid #000/, 'APA clipboard table should have a bottom horizontal rule')
assert.match(html, /<th[^>]*border-top:1\.5pt solid #000000[^>]*border-bottom:1\.5pt solid #000000/, 'APA clipboard table header cells should carry thick rules above and below headings.')
assert.match(html, /border-bottom:1\.5pt solid #000/, 'APA clipboard table header should have a thick rule under headings')
assert.match(html, /<td[^>]*border-bottom:1\.5pt solid #000000[^>]*>Image -&gt; Satisfaction<\/td>/, 'APA clipboard table should apply the final thick rule to the last body row.')
assert.match(html, /text-align:right;">0\.418/, 'numeric body cells should be right aligned')
assert.match(html, /text-align:right;">3\.210/, 'numeric body cells should use three decimal places when possible')
assert.match(html, /text-align:right;">&lt;0\.001/, 'less-than p-value cells should be right aligned')
assert.match(html, /text-align:left;">Image -&gt; Satisfaction/, 'row-label body cells should stay left aligned')
assert.match(html, /<em>Note\.<\/em>/, 'APA clipboard table should include an APA-style note line')
assert.match(html, /<em>Note\.<\/em>\s*<\/p>/, 'APA clipboard note should be empty for the user to complete in Word.')
assert.doesNotMatch(html, /Values are copied from metis results/, 'APA clipboard note should explain table abbreviations or symbols, not generic copy mechanics')
assert.doesNotMatch(html, /<em>t<\/em> = t statistic|<em>p<\/em> = p value/, 'APA clipboard note should not auto-generate explanatory text.')
assert.match(html, /<em>t<\/em> statistics/, 'statistical symbols in headers should be italicized where supported')
assert.match(html, /<em>p<\/em> values/, 'p symbols in headers should be italicized where supported')
assert.doesNotMatch(html, /background:#f3f4f6/, 'APA clipboard table should not use gray filled headers')
assert.doesNotMatch(html, /border:1px solid #d1d5db/, 'APA clipboard table should not use full grid borders')
assert.doesNotMatch(html, /border-left:/, 'APA clipboard table should not use vertical rules')
assert.doesNotMatch(html, /border-right:/, 'APA clipboard table should not use vertical rules')

const reportHtml = buildClipboardTableHtml(
  [
    {
      title: 'Measurement model assessment',
      headers: ['Construct', 'Indicator', 'Loading'],
      rows: [['Attitude', 'ATT1', '0.812']],
    },
  ],
  'Tark report',
  {
    leadingHtml: '<figure data-tark-path-diagram="true"><svg viewBox="0 0 10 10"></svg></figure>',
  },
)
assert.match(reportHtml, /data-tark-path-diagram="true"/, 'Copy-all HTML should preserve the leading path diagram block before the tables.')
assert.ok(
  reportHtml.indexOf('data-tark-path-diagram="true"') < reportHtml.indexOf('<strong>Table 1</strong>'),
  'Path diagram should be copied before the first report table.',
)

const reportText = buildClipboardTableText(
  [
    {
      title: 'Measurement model assessment',
      headers: ['Construct', 'Indicator', 'Loading'],
      rows: [['Attitude', 'ATT1', '0.812']],
    },
  ],
  'Tark report',
  { leadingText: 'Figure 1\nPath diagram' },
)
assert.match(reportText, /^Figure 1\nPath diagram\n\nTable 1/m, 'Copy-all plain text should include a path diagram placeholder before tables.')

console.log('PASS APA clipboard table contract')
