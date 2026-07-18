import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const titleBar = await fs.readFile(path.join(workspaceRoot, 'src/components/TitleBar.tsx'), 'utf8')
const css = await fs.readFile(path.join(workspaceRoot, 'src/index.css'), 'utf8')

assert.doesNotMatch(
  titleBar,
  /hover:bg-\[rgb\(var\(--color-hover-rgb\)\/0\.75\)\]/,
  'TitleBar should not use the old broad Tailwind hover tint.'
)
assert.match(
  titleBar,
  /className=\{`titlebar-menu-row[\s\S]*titlebar-menu-row-disabled/,
  'Dropdown child menu rows should use the shared titlebar-menu-row hover class with a disabled state.'
)
assert.match(
  css,
  /\.titlebar-menu-row:not\(\.titlebar-menu-row-disabled\):hover,\s*\n\.titlebar-menu-row:not\(\.titlebar-menu-row-disabled\):focus-visible/,
  'Dropdown child menu rows should get a hover and keyboard focus treatment.'
)
assert.match(
  css,
  /background:\s*rgb\(var\(--color-hover-rgb\) \/ 0\.64\)/,
  'Dropdown child menu row hover should use the theme hover surface.'
)
const titlebarHoverBlock = css.match(
  /\.titlebar-menu-row:not\(\.titlebar-menu-row-disabled\):hover,\s*\n\.titlebar-menu-row:not\(\.titlebar-menu-row-disabled\):focus-visible\s*\{[\s\S]*?\n\}/,
)?.[0] ?? ''
assert.ok(titlebarHoverBlock, 'Dropdown child menu row hover/focus block should exist.')
assert.doesNotMatch(
  titlebarHoverBlock,
  /box-shadow:/,
  'Dropdown child menu row hover/focus should not draw an inset button border.'
)
assert.match(
  titleBar,
  /const menuItemColor = 'var\(--color-title-menu-text\)'/,
  'TitleBar dropdown item text should use the dedicated title menu token instead of primary text.'
)
assert.match(
  titleBar,
  /const menuDisabledColor = 'var\(--color-title-menu-disabled\)'/,
  'TitleBar dropdown disabled text should use the dedicated disabled menu token.'
)
assert.match(
  css,
  /\[data-theme='light'\][\s\S]*--color-title-menu-text:\s*#3F4651;/,
  'Light theme usable titlebar dropdown text should be dark grey.'
)
assert.match(
  css,
  /\[data-theme='light'\][\s\S]*--color-title-menu-disabled:\s*#A0AABC;/,
  'Light theme disabled titlebar dropdown text should be grey.'
)
assert.match(
  titleBar,
  /color: openMenu === menu\.label \? 'var\(--color-text-secondary-alt\)' : 'var\(--color-title-tab\)'/,
  'Open titlebar tabs should show only a text-color state, not a filled tab.'
)
assert.match(
  titleBar,
  /backgroundColor: 'transparent'/,
  'Open titlebar tabs should remain transparent while their dropdown content previews.'
)

console.log('PASS title bar menu chrome stays transparent')
