import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const { translateUiText } = await import('../src/i18n/uiLanguage.ts')

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(target))
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(target)
  }
  return out
}

const propNames = new Set([
  'label', 'title', 'message', 'detail', 'subtitle', 'description', 'desc',
  'text', 'placeholder', 'emptyText', 'heading', 'eyebrow', 'status', 'cta',
  'tooltip', 'ariaLabel', 'name',
])

const allowUntranslated = [
  /^[A-Z0-9²α_.\-/+() &%<>≥]+$/,
  /^https?:/,
  /^\.\.?\//,
  /^\//,
  /^C:\\/,
  /^#/,
  /^var\(/,
  /^png$/,
  /^fill$/,
  /^stroke$/,
  /^top$|^bottom$|^left$|^right$/,
  /^[a-z]+(?:[._-][a-z0-9]+)+$/,
  /^[a-z][a-z0-9]*$/,
  /^0, 1, Low\.\.\.$/,
  /^1 \(uniform\)$/,
  /^p [<≥] /,
  /^p [<≥] \.05 \((?:significant|not significant)\)$/,
  /^1e-\d+$/,
  /^Verifying seminr, plumber, semPower(?:\.\.\.|…)$/,
  /^Copy and run install command in R$/,
  /^Windows-1252$/,
  /^All Files$|^JSON Files$|^PNG Image$|^HTML \(.html\)$/,
  /^R Script$|^Rscript Executable$/,
  /^Q²predict$/,
  /^ρA$/,
  /^cIPMA$/,
  /^[a-z]+[A-Z][A-Za-z]+$/,
  /^NCA/,
  /^BCa$/,
  /^AVE/,
  /^Rho_[AC]$/,
  /^T-Statistic$/,
  /^Welch$/,
  /^K-fold$/,
  /^@keyframes/,
  /^AbortError$/,
  /^Canvas element not found$/,
  /^Audio context error:/,
  /^\[ModelCanvas\]/,
  /^Electron \+ React \+ TypeScript$/,
  /^Desktop interface stack\.$/,
  /^Development desktop shell identifier\.$/,
  /^Desktop bundle for local analysis workflows\.$/,
  /^English$/,
  /^Español$/,
  /^Português$/,
  /^Français$/,
  /^GNU GPL v3$/,
  /^Henseler$/,
  /^Lohmöller$/,
  /^Tark$/,
  /^Metis$/,
]

function parentName(node) {
  const parent = node.parent
  if (ts.isPropertyAssignment(parent) && (ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name))) return parent.name.text
  if (ts.isJsxAttribute(parent)) return parent.name.getText()
  return ''
}

function nearestConfigName(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) return current.name.text
    if (ts.isPropertyAssignment(current) && (ts.isIdentifier(current.name) || ts.isStringLiteral(current.name))) return current.name.text
  }
  return ''
}

function isLikelyUiLiteral(node) {
  const parent = node.parent
  if (propNames.has(parentName(node))) return true
  if (ts.isArrayLiteralExpression(parent)) {
    return /(option|tab|nav|menu|step|action|card|item|section|control|choice|preset|metric|status|mode|toolbar|tour)/i.test(nearestConfigName(node))
  }
  return false
}

function shouldCheck(value) {
  if (!/[A-Za-z]/.test(value)) return false
  if (allowUntranslated.some((pattern) => pattern.test(value))) return false
  return true
}

const phrases = new Set()
for (const file of [
  ...walk(path.join(workspaceRoot, 'src/pages')),
  ...walk(path.join(workspaceRoot, 'src/components')),
]) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  function visit(node) {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && isLikelyUiLiteral(node)) {
      const text = node.text.replace(/\s+/g, ' ').trim()
      if (shouldCheck(text)) phrases.add(text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

const untranslated = []
for (const phrase of phrases) {
  const translated = [
    translateUiText(phrase, 'Español'),
    translateUiText(phrase, 'Português'),
    translateUiText(phrase, 'Français'),
  ]
  if (translated.every((value) => value === phrase)) untranslated.push(phrase)
}

assert.equal(
  untranslated.length,
  0,
  `Every likely hardcoded UI literal should translate or be explicitly allowlisted. Missing:\n${untranslated.slice(0, 120).join('\n')}`,
)

assert.ok(phrases.size > 250, 'The literal coverage test should inspect option arrays and label configs broadly.')

console.log('PASS UI localization literal coverage')
