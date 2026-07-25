import assert from 'node:assert/strict'

const {
  normalizeUiLanguage,
  translateUiText,
} = await import('../src/i18n/uiLanguage.ts')

assert.equal(normalizeUiLanguage('es-MX'), 'Español')
assert.equal(normalizeUiLanguage('pt-BR'), 'Português')
assert.equal(normalizeUiLanguage('fr-CA'), 'Français')
assert.equal(normalizeUiLanguage('de-DE'), 'English')

assert.equal(translateUiText('Preferences', 'English'), 'Preferences')
assert.equal(translateUiText('Preferences', 'Español'), 'Preferencias')
assert.equal(translateUiText('Workspace', 'Português'), 'Área de trabalho')
assert.equal(translateUiText('Choose an install location.', 'Français'), 'Choisissez un emplacement d’installation.')
assert.equal(translateUiText('On startup', 'Español'), 'Al iniciar')
assert.equal(translateUiText('Choose what Metis opens at launch.', 'Español'), 'Elige lo que Metis abre al iniciar.')
assert.equal(translateUiText('Open last workspace', 'Español'), 'Abrir último espacio de trabajo')
assert.equal(translateUiText('Show workspace picker', 'Español'), 'Mostrar selector de espacio de trabajo')
assert.equal(translateUiText('Start blank', 'Español'), 'Iniciar en blanco')
assert.equal(translateUiText('Brief description of this research project...', 'Español'), 'Breve descripción de este proyecto de investigación...')
assert.equal(translateUiText('Calculated', 'Español'), 'Calculado')
assert.equal(translateUiText('1 week ago', 'Español'), 'hace 1 semana')
assert.equal(translateUiText('5 days ago', 'Español'), 'hace 5 días')
assert.equal(translateUiText('just now', 'Português'), 'agora mesmo')
assert.equal(translateUiText('2 hours ago', 'Français'), 'il y a 2 heures')
assert.equal(translateUiText('from this workspace.', 'Español'), 'de este espacio de trabajo.')
assert.equal(translateUiText('Saved analysis output', 'Español'), 'Salida de análisis guardada')
assert.equal(translateUiText('No Workspace Selected', 'Español'), 'No hay ningún espacio de trabajo seleccionado')

for (const phrase of [
  'Interface language used across Metis.',
  'Folder Metis scans for .metisws workspaces.',
  'Default destination for HTML reports and saved results.',
  'Update model calculations automatically when inputs change.',
  'Ask before choosing between lower-order and structural HOC paths.',
  'Save recoverable project snapshots while you work.',
  'How often Metis writes local recovery snapshots.',
  'Show a confirmation before closing work with pending edits.',
  'Check the public release channel and review what changed before restarting.',
  'Look for newer Metis desktop releases.',
  'Open the latest changelog in your browser.',
]) {
  assert.notEqual(translateUiText(phrase, 'Español'), phrase, `"${phrase}" should translate in Preferences.`)
  assert.notEqual(translateUiText(phrase, 'Português'), phrase, `"${phrase}" should translate in Preferences.`)
  assert.notEqual(translateUiText(phrase, 'Français'), phrase, `"${phrase}" should translate in Preferences.`)
}

assert.notEqual(translateUiText('Open dataset', 'Español'), 'Open dataset')
assert.notEqual(translateUiText('Run model calculation', 'Português'), 'Run model calculation')
assert.notEqual(translateUiText('Copy diagnostics table', 'Français'), 'Copy diagnostics table')

assert.equal(translateUiText('Aaron dataset model', 'Español'), 'Aaron dataset model')
assert.equal(translateUiText('custom model name', 'Português'), 'custom model name')

console.log('PASS UI language behavior')
