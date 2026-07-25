import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

async function readSource(relativePath) {
  return fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')
}

const uiLanguage = await readSource('src/i18n/uiLanguage.ts')
const localizationRuntime = await readSource('src/i18n/LocalizationRuntime.tsx')
const appSource = await readSource('src/App.tsx')

assert.match(
  uiLanguage,
  /export const SUPPORTED_UI_LANGUAGES = \['English', 'Español', 'Português', 'Français'\] as const/,
  'UI localization should centralize all supported languages.',
)

assert.match(
  uiLanguage,
  /export type UiLanguage = typeof SUPPORTED_UI_LANGUAGES\[number\]/,
  'UI localization should type languages from the central supported list.',
)

for (const [source, expected] of [
  ['es', 'Español'],
  ['spanish', 'Español'],
  ['pt', 'Português'],
  ['portuguese', 'Português'],
  ['fr', 'Français'],
  ['french', 'Français'],
]) {
  assert.match(
    uiLanguage,
    new RegExp(`${source}[\\s\\S]{0,180}return '${expected}'`),
    `normalizeUiLanguage should map ${source} to ${expected}.`,
  )
}

assert.match(
  uiLanguage,
  /function translateWithGlossary\(text: string, language: Exclude<UiLanguage, 'English'>\): string/,
  'UI localization should provide a glossary fallback for hardcoded app text beyond exact phrase matches.',
)

assert.match(
  uiLanguage,
  /export function translateUiText\(text: string, language: UiLanguage\): string[\s\S]*if \(language === 'English'\) return text[\s\S]*EXACT_TRANSLATIONS/,
  'translateUiText should keep English unchanged and translate non-English text through the catalog.',
)

for (const phrase of ['Preferences', 'Workspace', 'Run', 'Cancel', 'Choose an install location.']) {
  assert.match(
    uiLanguage,
    new RegExp(`${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]{0,260}Español[\\s\\S]{0,260}Português[\\s\\S]{0,260}Français`),
    `The exact translation catalog should include "${phrase}" for all non-English languages.`,
  )
}

assert.match(
  localizationRuntime,
  /new MutationObserver/,
  'Localization runtime should translate text added after the initial render.',
)

assert.match(
  localizationRuntime,
  /characterData: true/,
  'Localization runtime should observe text-node updates from React, not only added nodes.',
)

assert.match(
  localizationRuntime,
  /mutation\.type === 'characterData'[\s\S]*translateTextNode\(mutation\.target as Text, language\)/,
  'Localization runtime should translate changed text nodes such as Workspace Home status and relative dates.',
)

assert.match(
  localizationRuntime,
  /function isKnownRenderedText\(source: string, current: string\)[\s\S]*SUPPORTED_UI_LANGUAGES/,
  'Localization runtime should distinguish old rendered translations from new English source text.',
)

for (const attr of ['placeholder', 'title', 'aria-label', 'alt']) {
  assert.match(
    localizationRuntime,
    new RegExp(`LOCALIZED_ATTRIBUTES[\\s\\S]*'${attr}'`),
    `Localization runtime should translate ${attr} attributes.`,
  )
}

for (const tag of ['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'PRE', 'CODE', 'SVG']) {
  assert.match(
    localizationRuntime,
    new RegExp(`TEXT_SKIP_TAGS[\\s\\S]*'${tag}'`),
    `Localization runtime should skip ${tag} content.`,
  )
}

for (const tag of ['INPUT', 'TEXTAREA']) {
  assert.doesNotMatch(
    localizationRuntime,
    new RegExp(`ATTRIBUTE_SKIP_TAGS[\\s\\S]*'${tag}'`),
    `Localization runtime should still translate ${tag} placeholder/title attributes.`,
  )
}

assert.match(
  localizationRuntime,
  /function translateElementAttributes\(element: Element, language: UiLanguage\)[\s\S]*shouldSkipAttributeElement\(element\)/,
  'Localization runtime should use the attribute skip list when translating placeholders and labels.',
)

assert.match(
  localizationRuntime,
  /window\.addEventListener\('pls:preferences-updated'/,
  'Localization runtime should respond when Preferences or setup changes language.',
)

assert.match(
  appSource,
  /import LocalizationRuntime from '\.\/i18n\/LocalizationRuntime'/,
  'App should import the localization runtime.',
)

assert.match(
  appSource,
  /<LocalizationRuntime \/>[\s\S]*<Routes>/,
  'App should mount localization before route content.',
)

console.log('PASS UI localization runtime static coverage')
