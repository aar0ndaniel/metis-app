import { useEffect } from 'react'
import { getSavedUiLanguage, SUPPORTED_UI_LANGUAGES, translateUiText, type UiLanguage } from './uiLanguage'

const LOCALIZED_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'] as const
const TEXT_SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'PRE', 'CODE', 'SVG'])
const ATTRIBUTE_SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'PRE', 'CODE', 'SVG'])
const ORIGINAL_TEXT = new WeakMap<Text, string>()
const ORIGINAL_ATTRIBUTES = new WeakMap<Element, Map<string, string>>()

function shouldSkipElement(element: Element | null, skipTags: Set<string>): boolean {
  for (let current = element; current; current = current.parentElement) {
    if (skipTags.has(current.tagName)) return true
    if (current.hasAttribute('data-i18n-skip')) return true
    if (current.getAttribute('contenteditable') === 'true') return true
  }
  return false
}

function shouldSkipTextElement(element: Element | null): boolean {
  return shouldSkipElement(element, TEXT_SKIP_TAGS)
}

function shouldSkipAttributeElement(element: Element | null): boolean {
  return shouldSkipElement(element, ATTRIBUTE_SKIP_TAGS)
}

function normalizeRenderedText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function isKnownRenderedText(source: string, current: string): boolean {
  const rendered = normalizeRenderedText(current)
  return SUPPORTED_UI_LANGUAGES.some((language) => (
    normalizeRenderedText(translateUiText(source, language)) === rendered
  ))
}

function getTextSource(node: Text, current: string): string {
  const cached = ORIGINAL_TEXT.get(node)
  if (cached && isKnownRenderedText(cached, current)) return cached
  ORIGINAL_TEXT.set(node, current)
  return current
}

function translateTextNode(node: Text, language: UiLanguage) {
  if (shouldSkipTextElement(node.parentElement)) return
  const current = node.nodeValue ?? ''
  if (!current.trim()) return
  const source = getTextSource(node, current)
  const translated = translateUiText(source, language)
  if (node.nodeValue !== translated) node.nodeValue = translated
}

function getOriginalAttribute(element: Element, attribute: string): string | null {
  const current = element.getAttribute(attribute)
  if (current == null || !current.trim()) return null
  let attributes = ORIGINAL_ATTRIBUTES.get(element)
  if (!attributes) {
    attributes = new Map()
    ORIGINAL_ATTRIBUTES.set(element, attributes)
  }
  const cached = attributes.get(attribute)
  if (cached && isKnownRenderedText(cached, current)) return cached
  attributes.set(attribute, current)
  return current
}

function translateElementAttributes(element: Element, language: UiLanguage) {
  if (shouldSkipAttributeElement(element)) return
  for (const attribute of LOCALIZED_ATTRIBUTES) {
    const source = getOriginalAttribute(element, attribute)
    if (!source) continue
    const translated = translateUiText(source, language)
    if (element.getAttribute(attribute) !== translated) element.setAttribute(attribute, translated)
  }
}

function translateTree(root: Node, language: UiLanguage) {
  if (root instanceof Element) {
    translateElementAttributes(root, language)
    root.querySelectorAll('*').forEach((element) => translateElementAttributes(element, language))
  }

  if (root instanceof Text) {
    translateTextNode(root, language)
    return
  }

  const doc = root.ownerDocument ?? document
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode()
  while (current) {
    translateTextNode(current as Text, language)
    current = walker.nextNode()
  }
}

export default function LocalizationRuntime() {
  useEffect(() => {
    if (typeof document === 'undefined' || !document.body) return undefined
    let language = getSavedUiLanguage()
    const applyLanguage = () => {
      language = getSavedUiLanguage()
      translateTree(document.body, language)
    }

    applyLanguage()

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          translateElementAttributes(mutation.target, language)
        }
        if (mutation.type === 'characterData' && mutation.target instanceof Text) {
          translateTextNode(mutation.target as Text, language)
        }
        mutation.addedNodes.forEach((node) => translateTree(node, language))
      }
    })

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: [...LOCALIZED_ATTRIBUTES],
      childList: true,
      characterData: true,
      subtree: true,
    })

    window.addEventListener('pls:preferences-updated', applyLanguage)
    window.addEventListener('storage', applyLanguage)

    return () => {
      observer.disconnect()
      window.removeEventListener('pls:preferences-updated', applyLanguage)
      window.removeEventListener('storage', applyLanguage)
    }
  }, [])

  return null
}
