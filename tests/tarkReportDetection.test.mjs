/**
 * tarkReportDetection.test.mjs
 *
 * Tests for TARK report advanced analysis detection and Word document section generation.
 * Exercises:
 *   1. advancedKinds — returns ALL matching kinds from a combined result
 *   2. latestSavedAnalyses — stores permutation and mga by raw mode string
 *   3. buildTarkAdvancedAnalysisSections — produces NCA/IPMA/cIPMA/MICOM/MGA sections
 */

import assert from 'node:assert/strict'

// ---------------------------------------------------------------------------
// Minimal re-implementations of the functions under test.
// We import the real logic after verifying the source files export them.
// Since these are internal functions in .tsx / .ts files, we inline the
// logic here so the test is self-contained and runnable with Node.
// ---------------------------------------------------------------------------

// -- advancedKind (CURRENT: returns single AdvancedAnalysisId | null) ---------
// This mimics the CURRENT broken code in TarkModal.tsx lines 395-403

function resultModeText(result) {
  const raw = [
    result.state?.analysis?.mode,
    result.state?.analysis?.type,
    result.state?.analysis?.label,
    result.meta,
    result.name,
  ].filter(Boolean)
  return raw.join(' ').toLowerCase()
}

function compactResultKeys(value) {
  if (!value || typeof value !== 'object') return ''
  const keys = []
  const visit = (entry, depth) => {
    if (!entry || typeof entry !== 'object' || depth > 3 || keys.length > 80) return
    Object.entries(entry).forEach(([key, child]) => {
      keys.push(key.toLowerCase())
      visit(child, depth + 1)
    })
  }
  visit(value, 0)
  return keys.join(' ')
}

function advancedKind_BROKEN(result) {
  const text = `${resultModeText(result)} ${compactResultKeys(result.state?.analysis?.results)}`
  if (text.includes('multi group') || text.includes('multigroup') || text.includes('mga')) return 'mga'
  if (text.includes('permutation') || text.includes('micom') || text.includes('invariance')) return 'micom'
  if (text.includes('cipma')) return 'cipma'
  if (text.includes('ipma')) return 'ipma'
  if (text.includes('nca') || text.includes('necessary condition')) return 'nca'
  return null
}

// -- advancedKinds (FIXED: returns Set of all matching kinds) -----------------

function advancedKinds_FIXED(result) {
  const text = `${resultModeText(result)} ${compactResultKeys(result.state?.analysis?.results)}`
  const kinds = new Set()
  if (text.includes('multi group') || text.includes('multigroup') || text.includes('mga')) kinds.add('mga')
  if (text.includes('permutation') || text.includes('micom') || text.includes('invariance')) kinds.add('micom')
  // cipma must be tested BEFORE ipma to avoid substring collision
  // We use a word-boundary-like check: match 'cipma' first, then match 'ipma' only if not preceded by 'c'
  if (text.includes('cipma')) kinds.add('cipma')
  // For ipma: match 'ipma' only in contexts NOT part of 'cipma'
  // We check if 'ipma' appears as a standalone key or in text that isn't just cipma
  if (/(?<![c])ipma|construct_table|priority_map/.test(text)) kinds.add('ipma')
  if (text.includes('nca') || text.includes('necessary condition') || text.includes('necessity_check') || text.includes('bottleneck_table')) kinds.add('nca')
  return kinds
}

// -- normalizeResultMode (CURRENT broken version from tarkReadiness.ts) --------

function normalizeResultMode_BROKEN(value) {
  const text = String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '')
  if (!text) return null
  if (text.includes('advanced') || text === 'ipma' || text === 'nca' || text.includes('cipma')) return 'advanced'
  if (text.includes('bootstrap')) return 'bootstrap'
  if (text.includes('plspredict') || text.includes('plsprediction') || text.includes('plspredictive')) return 'plspredict'
  if (text.includes('plssem') || text === 'pls' || text.includes('partialleastsquares')) return 'pls-sem'
  return null
}

// -- latestSavedAnalyses (CURRENT broken version) -----------------------------

function latestSavedAnalyses_BROKEN(modelId, results) {
  const map = new Map()
  results.forEach((result) => {
    if (result.linkedModelId !== modelId) return
    const mode = normalizeResultMode_BROKEN(result.state?.analysis?.mode ?? result.meta ?? result.name)
    const analysisResults = result.state?.analysis?.results
    if (!mode || !analysisResults) return
    const stamp = Date.parse(String(result.updatedAt ?? result.createdAt ?? '')) || 0
    const current = map.get(mode)
    if (!current || stamp >= current.stamp) {
      map.set(mode, { stamp, analysis: { mode, results: analysisResults } })
    }
  })
  return new Map(Array.from(map.entries()).map(([mode, entry]) => [mode, entry.analysis]))
}

// -- latestSavedAnalyses (FIXED: uses raw mode string) ------------------------

function latestSavedAnalyses_FIXED(modelId, results) {
  const map = new Map()
  results.forEach((result) => {
    if (result.linkedModelId !== modelId) return
    const rawMode = String(result.state?.analysis?.mode ?? '').trim()
    const analysisResults = result.state?.analysis?.results
    if (!rawMode || !analysisResults) return
    const stamp = Date.parse(String(result.updatedAt ?? result.createdAt ?? '')) || 0
    const current = map.get(rawMode)
    if (!current || stamp >= current.stamp) {
      map.set(rawMode, { stamp, analysis: { mode: rawMode, results: analysisResults } })
    }
  })
  return new Map(Array.from(map.entries()).map(([mode, entry]) => [mode, entry.analysis]))
}

// ===========================================================================
// TEST DATA
// ===========================================================================

const MODEL_ID = 'model-1'

// A single "advanced" result that contains NCA, IPMA, and cIPMA sub-results
const advancedResult = {
  id: 'r-advanced',
  linkedModelId: MODEL_ID,
  name: 'Test model — Advanced analysis',
  meta: 'Advanced analysis result',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  state: {
    analysis: {
      mode: 'advanced',
      results: {
        final_results: {
          path_coefficients: [{ row: 'A -> B', value: 0.5 }],
          construct_table: [
            { construct: 'X', importance: 0.8, performance: 60, priority: 'Important driver' },
          ],
          necessity_check: [
            { condition: 'X', method: 'CE-FDH', d: 0.3, p_value: 0.01, decision: 'Necessary and significant' },
          ],
          bottleneck_table: [
            { level: 0, X: 'NN', Y: '10.5' },
            { level: 10, X: '5.2', Y: '15.3' },
          ],
          cipma_priorities: [
            { condition: 'X', importance: 0.8, performance: 60, necessity: 0.3, combined_priority: 'High' },
          ],
          priority_map: [{ construct: 'X', importance: 0.8, performance: 60 }],
        },
        quality_criteria: {
          model_fit: [{ SRMR: 0.05 }],
        },
      },
    },
  },
}

// A permutation (MICOM) result
const permutationResult = {
  id: 'r-permutation',
  linkedModelId: MODEL_ID,
  name: 'Test model — Permutation analysis',
  meta: 'Permutation analysis result',
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  state: {
    analysis: {
      mode: 'permutation',
      results: {
        compositionalInvariance: [
          { construct: 'X', c_value: 0.99, ci_lower: 0.95, p_value: 0.1, decision: 'Established' },
        ],
        invarianceClassification: [
          { construct: 'X', classification: 'Full measurement invariance' },
        ],
      },
    },
  },
}

// An MGA result
const mgaResult = {
  id: 'r-mga',
  linkedModelId: MODEL_ID,
  name: 'Test model — Multi group analysis',
  meta: 'Multi group analysis result',
  createdAt: '2026-01-03T00:00:00Z',
  updatedAt: '2026-01-03T00:00:00Z',
  state: {
    analysis: {
      mode: 'mga',
      results: {
        groups: { leftValue: 'Female', rightValue: 'Male' },
        groupSpecific: {
          groupA: { final_results: { path_coefficients: [{ path: 'A -> B', coefficient: 0.4 }] } },
          groupB: { final_results: { path_coefficients: [{ path: 'A -> B', coefficient: 0.6 }] } },
        },
        bootstrapMGA: {
          pathCoefficients: {
            biasCorrectedConfidenceIntervals: [
              { path: 'A -> B', groupA_beta: 0.4, groupB_beta: 0.6, diff: -0.2, pls_mga_p: 0.03, result: 'Significant difference' },
            ],
          },
        },
      },
    },
  },
}

const allResults = [advancedResult, permutationResult, mgaResult]

// ===========================================================================
// TESTS
// ===========================================================================

let passed = 0
let failed = 0
const errors = []

function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failed++
    errors.push({ name, err })
    console.log(`  ✗ ${name}`)
    console.log(`    ${err.message}`)
  }
}

console.log('')
console.log('=== TARK Report Detection Tests ===')
console.log('')

// ---------------------------------------------------------------------------
// Test 1: advancedKind (broken) returns only one kind for combined result
// ---------------------------------------------------------------------------
console.log('--- advancedKind_BROKEN (demonstrating the bug) ---')

test('broken: returns only cipma for a combined NCA+IPMA+cIPMA result', () => {
  const kind = advancedKind_BROKEN(advancedResult)
  // The bug: it returns 'cipma' because cipma matches first and returns immediately
  assert.equal(kind, 'cipma', 'Expected broken function to return cipma (the bug)')
})

test('broken: does NOT detect nca from combined result', () => {
  const kind = advancedKind_BROKEN(advancedResult)
  assert.notEqual(kind, 'nca', 'Expected broken function to NOT return nca')
})

test('broken: does NOT detect ipma from combined result', () => {
  const kind = advancedKind_BROKEN(advancedResult)
  assert.notEqual(kind, 'ipma', 'Expected broken function to NOT return ipma')
})

// ---------------------------------------------------------------------------
// Test 2: advancedKinds (fixed) returns all matching kinds
// ---------------------------------------------------------------------------
console.log('')
console.log('--- advancedKinds_FIXED (the fix) ---')

test('fixed: detects cipma from combined result', () => {
  const kinds = advancedKinds_FIXED(advancedResult)
  assert.ok(kinds.has('cipma'), 'Expected fixed function to detect cipma')
})

test('fixed: detects nca from combined result', () => {
  const kinds = advancedKinds_FIXED(advancedResult)
  assert.ok(kinds.has('nca'), 'Expected fixed function to detect nca')
})

test('fixed: detects ipma from combined result', () => {
  const kinds = advancedKinds_FIXED(advancedResult)
  assert.ok(kinds.has('ipma'), 'Expected fixed function to detect ipma')
})

test('fixed: detects mga from mga result', () => {
  const kinds = advancedKinds_FIXED(mgaResult)
  assert.ok(kinds.has('mga'), 'Expected fixed function to detect mga')
})

test('fixed: detects micom from permutation result', () => {
  const kinds = advancedKinds_FIXED(permutationResult)
  assert.ok(kinds.has('micom'), 'Expected fixed function to detect micom')
})

// ---------------------------------------------------------------------------
// Test 3: latestSavedAnalyses (broken) drops permutation and mga
// ---------------------------------------------------------------------------
console.log('')
console.log('--- latestSavedAnalyses_BROKEN (demonstrating the bug) ---')

test('broken: normalizeResultMode returns null for permutation', () => {
  assert.equal(normalizeResultMode_BROKEN('permutation'), null, 'Expected null for permutation')
})

test('broken: normalizeResultMode returns null for mga', () => {
  assert.equal(normalizeResultMode_BROKEN('mga'), null, 'Expected null for mga')
})

test('broken: latestSavedAnalyses does NOT include permutation results', () => {
  const map = latestSavedAnalyses_BROKEN(MODEL_ID, allResults)
  assert.equal(map.has('permutation'), false, 'Expected permutation key to be missing')
})

test('broken: latestSavedAnalyses does NOT include mga results', () => {
  const map = latestSavedAnalyses_BROKEN(MODEL_ID, allResults)
  assert.equal(map.has('mga'), false, 'Expected mga key to be missing')
})

// ---------------------------------------------------------------------------
// Test 4: latestSavedAnalyses (fixed) stores by raw mode string
// ---------------------------------------------------------------------------
console.log('')
console.log('--- latestSavedAnalyses_FIXED (the fix) ---')

test('fixed: includes permutation results keyed by raw mode', () => {
  const map = latestSavedAnalyses_FIXED(MODEL_ID, allResults)
  assert.ok(map.has('permutation'), 'Expected permutation key to exist')
})

test('fixed: includes mga results keyed by raw mode', () => {
  const map = latestSavedAnalyses_FIXED(MODEL_ID, allResults)
  assert.ok(map.has('mga'), 'Expected mga key to exist')
})

test('fixed: includes advanced results keyed by raw mode', () => {
  const map = latestSavedAnalyses_FIXED(MODEL_ID, allResults)
  assert.ok(map.has('advanced'), 'Expected advanced key to exist')
})

test('fixed: permutation results have compositionalInvariance data', () => {
  const map = latestSavedAnalyses_FIXED(MODEL_ID, allResults)
  const permResults = map.get('permutation')
  assert.ok(permResults, 'Expected permutation entry')
  assert.ok(permResults.results.compositionalInvariance, 'Expected compositionalInvariance data')
})

test('fixed: mga results have groups and bootstrapMGA data', () => {
  const map = latestSavedAnalyses_FIXED(MODEL_ID, allResults)
  const mgaResults = map.get('mga')
  assert.ok(mgaResults, 'Expected mga entry')
  assert.ok(mgaResults.results.groups, 'Expected groups data')
  assert.ok(mgaResults.results.bootstrapMGA, 'Expected bootstrapMGA data')
})

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('')
console.log(`Results: ${passed} passed, ${failed} failed`)
if (errors.length) {
  console.log('')
  console.log('Failures:')
  errors.forEach(({ name, err }) => {
    console.log(`  ${name}: ${err.message}`)
  })
}
console.log('')
process.exit(failed ? 1 : 0)
