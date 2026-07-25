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

const uiFiles = [
  ...walk(path.join(workspaceRoot, 'src/pages')),
  ...walk(path.join(workspaceRoot, 'src/components')),
]

const localizedAttributes = new Set(['aria-label', 'title', 'placeholder', 'alt'])
const allowUntranslated = [
  /^[A-Z0-9²α_./+() &%-]+$/,
  /^R$/,
  /^T$/,
  /^B$/,
  /^I$/,
  /^HOC$/,
  /^LOC$/,
  /^VIF$/,
  /^AVE/,
  /^CR-FDH$/,
  /^CE-FDH/,
  /^PLS-SEM/,
  /^PLSpredict/,
  /^Tark/,
  /^Metis$/,
  /^metis app events$/,
  /^DataView ·$/,
  /^R²=/,
  /^n =$/,
  /^0, 1, Low\.\.\.$/,
  /^~?\d/,
  /^— first$/,
  /^of$/,
  /^or$/,
  /^is$/,
  /^as a lower-order construct/,
  /^to connect a lower-order construct/,
  /^to apply the language change/,
  /^, but this path suggests$/,
]

function normalizeText(value) {
  return value.replace(/\s+/g, ' ').trim()
}

function shouldCheck(value) {
  if (!/[A-Za-z]/.test(value)) return false
  if (allowUntranslated.some((pattern) => pattern.test(value))) return false
  return true
}

function collectFromSource(file) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const values = []
  function add(value) {
    const text = normalizeText(value)
    if (shouldCheck(text)) values.push(text)
  }
  function visit(node) {
    if (ts.isJsxText(node)) add(node.getText())
    if (ts.isJsxAttribute(node) && localizedAttributes.has(node.name.getText())) {
      const init = node.initializer
      if (init && ts.isStringLiteral(init)) add(init.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return values
}

const phrases = new Set()
for (const file of uiFiles) {
  for (const phrase of collectFromSource(file)) phrases.add(phrase)
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
  `Every hardcoded JSX/attribute UI phrase should translate or be explicitly allowlisted. Missing:\n${untranslated.slice(0, 80).join('\n')}`,
)

assert.ok(phrases.size > 250, 'The coverage test should inspect the broad pages/components UI surface.')

console.log('PASS UI localization coverage')
