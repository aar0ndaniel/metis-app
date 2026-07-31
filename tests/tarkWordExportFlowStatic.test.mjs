import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

async function read(relativePath) {
  return fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')
}

const app = await read('src/App.tsx')
const modal = await read('src/components/TarkModal.tsx')
const docx = await read('src/utils/tarkReportDocx.ts').catch(() => '')
const main = await read('electron/main.ts')
const preload = await read('electron/preload.ts')
const viteEnv = await read('src/vite-env.d.ts')

assert.match(modal, /const TARK_STEPS = \['Report setup', 'Path diagram', 'Word document'\]/, 'Tark modal should define the three requested wizard steps.')
assert.match(modal, /const \[step,\s*setStep\] = useState\(0\)/, 'Tark modal should track the active wizard step.')
assert.match(modal, /className="w-\[520px\][\s\S]*height: 410[\s\S]*maxHeight: 'calc\(100vh - 32px\)'/, 'Tark modal should keep the compact MICOM/MGA shell size.')
assert.match(modal, /minHeight: 65[\s\S]*borderTop: '1px solid var\(--color-border\)'/, 'Tark footer should remain fixed instead of scrolling with body content.')
assert.match(modal, /overflowY: 'auto'/, 'Tark wizard body should own scrolling inside the fixed shell.')

const stepIndicator = modal.match(/function StepIndicator[\s\S]*?(?=function timestamp)/)?.[0] ?? ''
assert.doesNotMatch(stepIndicator, /borderBottom:/, 'The progress-step header should not draw a border underneath it.')
assert.match(modal, /background: 'var\(--color-hover\)'/, 'The advanced-analysis accordion should use the theme-aware filled neutral background.')
assert.doesNotMatch(modal, /actionLabel:|runAction:|handleRunAnalysis|Run NCA|Run IPMA|Run cIPMA|Run MICOM|Run MGA/, 'Advanced-analysis rows should not include run CTAs.')
assert.match(modal, /const \[fileName, setFileName\] = useState\('Tark_report'\)/, 'The Step 3 filename state should be extension-free.')
assert.match(modal, /setFileName\(stripTarkDocxExtension\(value\)\)/, 'Editing the filename should not re-add .docx.')
assert.match(modal, /File name/, 'Step 3 should expose a file-name field.')
assert.match(modal, /Save location/, 'Step 3 should expose a save-location picker.')
assert.match(modal, /Report summary/, 'Step 3 should include a collapsed report summary accordion.')
assert.match(modal, /Create Tark report/, 'Final CTA should read Create Tark report.')
assert.match(modal, /showSaveDialog[\s\S]*filters:\s*\[\{ name: 'Word document', extensions: \['docx'\] \}\]/, 'Browse should use the native save dialog for .docx files.')
assert.match(modal, /buildTarkReportDocxBase64/, 'Tark modal should generate a native Word document package.')
assert.match(modal, /writeFile\(\{[\s\S]*encoding: 'base64'/, 'Tark modal should save the generated .docx through the approved write bridge.')
assert.match(modal, /showItemInFolder/, 'Success actions should include showing the Word document in its folder.')
assert.match(modal, /openPath/, 'Success actions should include opening the Word document.')

for (const removed of [
  /type TableLabelMode/,
  /Full construct names in tables/,
  /Abbreviations everywhere/,
  /Construct labels/,
  /constructLabels/,
  /tableLabelMode/,
  /Tark it/,
]) {
  assert.doesNotMatch(modal, removed, 'Tark modal should remove preview-era construct-label and copy/paste controls.')
}

assert.doesNotMatch(
  app,
  /navigate\(`\/tark-preview\/\$\{request\.workspaceId\}\/\$\{request\.modelId\}`/,
  'Creating a Tark report should no longer navigate to the copy/paste preview surface.',
)
assert.doesNotMatch(app, /type TarkReportRequest/, 'App should not own the old preview request type.')
assert.doesNotMatch(app, /onTarkIt=\{handleTarkIt\}/, 'Tark modal should own Word report generation instead of handing a preview request to App.')

assert.match(docx, /new JSZip\(\)/, 'The Word generator should package a real .docx zip.')
assert.match(docx, /word\/document\.xml/, 'The Word generator should create a document XML part.')
assert.match(docx, /<w:tbl>/, 'The Word generator should create native Word tables.')
assert.match(docx, /w:insideV w:val="nil"/, 'The Word generator should encode APA-style no-vertical-border tables.')

assert.match(main, /allowedRendererWriteExtensions\s*=\s*new Set\(\[[^\]]*'\.docx'/, 'Electron write policy should allow approved .docx exports.')
assert.match(main, /allowedRendererOpenExtensions\s*=\s*new Set\(\[[^\]]*'\.docx'/, 'Electron open policy should allow approved .docx reports.')
assert.match(main, /ipcMain\.handle\('shell:showItemInFolder'/, 'Electron should expose a safe show-in-folder handler.')
assert.match(preload, /showItemInFolder:\s*\(targetPath: string\)\s*=>\s*ipcRenderer\.invoke\('shell:showItemInFolder', targetPath\)/, 'Preload should expose showItemInFolder.')
assert.match(viteEnv, /showItemInFolder: \(targetPath: string\) => Promise<any>/, 'Renderer types should include showItemInFolder.')

const preview = await read('src/pages/TarkPreview.tsx')
assert.match(preview, /buildTarkDiagramResults\(savedAnalyses, savedModel\)/, 'TarkPreview should pass savedAnalyses map to buildTarkDiagramResults.')

console.log('PASS Tark Word export flow static contract')
