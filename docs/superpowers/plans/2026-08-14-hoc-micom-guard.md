# HOC MICOM Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent MICOM from opening or running for any model containing a higher-order construct, while leaving ordinary MICOM and `r-api/micom.R` unchanged.

**Architecture:** A small shared TypeScript utility owns the exact message and HOC detection. Model Canvas and Results View guard both the menu action and callable handlers, while a matching R helper guards both Plumber MICOM routes after payload normalization and before model fitting.

**Tech Stack:** React 18, TypeScript, Node static/behavioral tests, R, Plumber, existing toast infrastructure.

---

**Design reference:** `docs/superpowers/specs/2026-08-14-hoc-micom-mga-design.md`

**Repository constraint:** The working tree already contains user changes. Preserve them. Do not stage or commit unless the user separately authorizes it. The repository's approval rule overrides the normal frequent-commit cadence; pause after every task and request approval before continuing.

## File Map

- Create `src/utils/micomAvailability.ts`: shared exact message and construct-level HOC detection.
- Create `tests/micomHocAvailability.test.mjs`: behavioral test for the shared utility.
- Create `tests/micomHocUnavailableStatic.test.mjs`: static guards for both UI entry points and handlers.
- Create `tests/rApiMicomHocGuard.R`: R behavioral regression for exact backend rejection and ordinary-model acceptance.
- Modify `src/pages/ModelCanvas.tsx`: block MICOM menu, precheck, and full-run entry points before calculation starts.
- Modify `src/pages/ResultsView.tsx`: apply the same guard to follow-up MICOM entry points.
- Modify `r-api/plumber.R`: add one guard helper and call it from both MICOM routes.
- Modify `tests/permutationAnalysisPlumberContract.test.mjs`: require the guard in both backend routes before core estimation.
- Do not modify `r-api/micom.R`.

### Task 1: Shared MICOM Availability Contract

**Files:**
- Create: `tests/micomHocAvailability.test.mjs`
- Create: `src/utils/micomAvailability.ts`

- [ ] **Step 1: Write the failing utility test**

Create `tests/micomHocAvailability.test.mjs`:

```js
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const tempDir = path.join(workspaceRoot, '.tmp-tests')
const outfile = path.join(tempDir, 'micomAvailability.bundle.mjs')

await fs.mkdir(tempDir, { recursive: true })
await build({
  entryPoints: [path.join(workspaceRoot, 'src/utils/micomAvailability.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  logLevel: 'silent',
})

const availability = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)
const expectedMessage = 'MICOM is currently not available for models containing higher-order constructs. Run MICOM on a model without higher-order constructs.'

assert.equal(availability.MICOM_HOC_UNAVAILABLE_MESSAGE, expectedMessage)
assert.equal(availability.containsHigherOrderConstruct([{ isHigherOrder: true }]), true)
assert.equal(availability.containsHigherOrderConstruct([{ is_higher_order: true }]), true)
assert.equal(availability.containsHigherOrderConstruct([{ isHigherOrder: false }, {}]), false)
assert.equal(availability.containsHigherOrderConstruct(undefined), false)

console.log('PASS MICOM HOC availability contract')
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node tests\micomHocAvailability.test.mjs
```

Expected: FAIL because `src/utils/micomAvailability.ts` does not exist. Confirm the failure is specifically the missing implementation, not a syntax or dependency error.

- [ ] **Step 3: Add the minimal utility**

Create `src/utils/micomAvailability.ts`:

```ts
export const MICOM_HOC_UNAVAILABLE_MESSAGE =
  'MICOM is currently not available for models containing higher-order constructs. Run MICOM on a model without higher-order constructs.'

export interface HigherOrderConstructLike {
  isHigherOrder?: boolean
  is_higher_order?: boolean
}

export function containsHigherOrderConstruct(
  constructs: readonly HigherOrderConstructLike[] | null | undefined,
): boolean {
  return Array.isArray(constructs) && constructs.some((construct) => (
    construct?.isHigherOrder === true || construct?.is_higher_order === true
  ))
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run:

```powershell
node tests\micomHocAvailability.test.mjs
```

Expected: `PASS MICOM HOC availability contract`.

- [ ] **Step 5: Pause for repository approval**

Report the two created files and the RED/GREEN outputs. Do not stage or commit. Ask permission before Task 2.

### Task 2: Block Both Frontend MICOM Entry Points

**Files:**
- Create: `tests/micomHocUnavailableStatic.test.mjs`
- Modify: `src/pages/ModelCanvas.tsx`
- Modify: `src/pages/ResultsView.tsx`

- [ ] **Step 1: Write the failing UI contract**

Create `tests/micomHocUnavailableStatic.test.mjs`:

```js
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const read = (relativePath) => fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')

const [modelCanvas, resultsView] = await Promise.all([
  read('src/pages/ModelCanvas.tsx'),
  read('src/pages/ResultsView.tsx'),
])

for (const [label, source] of [['ModelCanvas', modelCanvas], ['ResultsView', resultsView]]) {
  assert.match(source, /MICOM_HOC_UNAVAILABLE_MESSAGE/, `${label} should import the shared MICOM HOC message.`)
  assert.match(
    source,
    /run-permutation-analysis[\s\S]*MICOM_HOC_UNAVAILABLE_MESSAGE[\s\S]*(?:setShowPermutationAnalysisModal|setPermutationOpen)/,
    `${label} should guard the MICOM menu action before opening its modal.`,
  )
}

assert.match(
  modelCanvas,
  /handlePermutationConfiguralPrecheck[\s\S]*hasHigherOrderConstructs[\s\S]*MICOM_HOC_UNAVAILABLE_MESSAGE[\s\S]*buildAnalysisPayload/,
  'ModelCanvas should guard a stale configural-precheck callback before payload work.',
)
assert.match(
  modelCanvas,
  /handleRunPermutationAnalysis[\s\S]*hasHigherOrderConstructs[\s\S]*MICOM_HOC_UNAVAILABLE_MESSAGE[\s\S]*setCalculatingType\('permutation'\)/,
  'ModelCanvas should guard a stale MICOM run callback before calculation starts.',
)
assert.match(
  resultsView,
  /handlePermutationConfiguralPrecheckFromResults[\s\S]*hasHigherOrderConstructs[\s\S]*MICOM_HOC_UNAVAILABLE_MESSAGE[\s\S]*resolveRunPayload/,
  'ResultsView should guard a stale configural-precheck callback before resolving a run payload.',
)
assert.match(
  resultsView,
  /handleRunPermutationFromResults[\s\S]*hasHigherOrderConstructs[\s\S]*MICOM_HOC_UNAVAILABLE_MESSAGE[\s\S]*resolveRunPayload/,
  'ResultsView should guard a stale MICOM run callback before calculation starts.',
)

console.log('PASS MICOM HOC frontend guard contract')
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node tests\micomHocUnavailableStatic.test.mjs
```

Expected: FAIL because neither page imports or applies the shared guard.

- [ ] **Step 3: Implement the Model Canvas guard**

In `src/pages/ModelCanvas.tsx`, import the utility:

```ts
import {
  MICOM_HOC_UNAVAILABLE_MESSAGE,
  containsHigherOrderConstruct,
} from '../utils/micomAvailability'
```

Add a construct-level flag next to `hasHigherOrderLink`:

```ts
const hasHigherOrderConstructs = useMemo(
  () => containsHigherOrderConstruct(constructs),
  [constructs],
)

const showMicomHocUnavailable = useCallback(() => {
  dispatchToast('warning', 'MICOM unavailable', MICOM_HOC_UNAVAILABLE_MESSAGE)
}, [])
```

Guard the precheck before status or payload work:

Insert the following block as the first statements in the existing function, then retain all remaining existing precheck statements unchanged:

```ts
const handlePermutationConfiguralPrecheck = async (settings: PermutationAnalysisSettings) => {
  if (hasHigherOrderConstructs) {
    showMicomHocUnavailable()
    setPermutationConfiguralStatus('failed')
    return { success: false, error: MICOM_HOC_UNAVAILABLE_MESSAGE }
  }
```

Guard the full run before closing the modal or starting calculation state:

Insert the following block before the existing modal-close and calculation-state statements, then retain the rest of the existing run body unchanged:

```ts
const handleRunPermutationAnalysis = async (settings: PermutationAnalysisSettings) => {
  if (isAnyCalculationRunning) return
  if (hasHigherOrderConstructs) {
    showMicomHocUnavailable()
    return
  }
```

Replace the MICOM menu case with:

```ts
case 'run-permutation-analysis':
  if (!isAnyCalculationRunning) {
    if (hasHigherOrderConstructs) showMicomHocUnavailable()
    else setShowPermutationAnalysisModal(true)
  }
  break
```

Add `hasHigherOrderConstructs` and `showMicomHocUnavailable` to the menu effect dependency list.

- [ ] **Step 4: Implement the Results View guard**

In `src/pages/ResultsView.tsx`, import:

```ts
import { MICOM_HOC_UNAVAILABLE_MESSAGE } from '../utils/micomAvailability'
```

After the existing `hasHigherOrderConstructs` memo, add:

```ts
const showMicomHocUnavailable = useCallback(() => {
  dispatchToast('warning', 'MICOM unavailable', MICOM_HOC_UNAVAILABLE_MESSAGE)
}, [])
```

Guard both callbacks before `resolveRunPayload()`:

```ts
if (hasHigherOrderConstructs) {
  showMicomHocUnavailable()
  setPermutationConfiguralStatus('failed')
  return { success: false, error: MICOM_HOC_UNAVAILABLE_MESSAGE }
}
```

Use this full-run variant in `handleRunPermutationFromResults`:

```ts
if (hasHigherOrderConstructs) {
  showMicomHocUnavailable()
  return
}
```

Replace the Results View menu line with:

```ts
if (action === 'run-permutation-analysis' && !isAnalysisRunning) {
  if (hasHigherOrderConstructs) showMicomHocUnavailable()
  else setPermutationOpen(true)
}
```

Update all affected `useCallback` and `useEffect` dependency arrays with `hasHigherOrderConstructs` and `showMicomHocUnavailable`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
node tests\micomHocUnavailableStatic.test.mjs
node tests\permutationAnalysisResultsContract.test.mjs
node tests\permutationAnalysisPlumberContract.test.mjs
```

Expected: all three print `PASS` and exit 0.

- [ ] **Step 6: Run type checking**

Run:

```powershell
npm run typecheck
```

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 7: Pause for repository approval**

Report the frontend files changed and focused results. Do not stage or commit. Ask permission before Task 3.

### Task 3: Enforce the Backend MICOM Guard

**Files:**
- Create: `tests/rApiMicomHocGuard.R`
- Modify: `tests/permutationAnalysisPlumberContract.test.mjs`
- Modify: `r-api/plumber.R`

- [ ] **Step 1: Add the failing static route assertions**

Append to `tests/permutationAnalysisPlumberContract.test.mjs`:

```js
assert.match(
  plumberSource,
  /pr\$handle\("POST", "\/run-permutation-configural-precheck"[\s\S]*prepare_payload\(req\)[\s\S]*assert_micom_payload_supported\(payload\)[\s\S]*get_cached_pls_core\(payload, data\)/,
  'MICOM configural precheck should reject HOCs after validation and before core estimation.',
)

assert.match(
  plumberSource,
  /pr\$handle\("POST", "\/run-permutation-analysis"[\s\S]*prepare_payload\(req\)[\s\S]*assert_micom_payload_supported\(payload\)[\s\S]*get_cached_pls_core\(payload, data\)/,
  'Full MICOM should reject HOCs after validation and before core estimation.',
)
```

- [ ] **Step 2: Add the failing R behavior test**

Create `tests/rApiMicomHocGuard.R`:

```r
Sys.setenv(METIS_ALLOWED_DATA_ROOTS = getwd(), METIS_ANALYSIS_CORES = "1")

exprs <- parse("r-api/plumber.R")
env <- new.env(parent = globalenv())
for (i in seq_len(length(exprs) - 2L)) eval(exprs[[i]], envir = env)

expected <- "MICOM is currently not available for models containing higher-order constructs. Run MICOM on a model without higher-order constructs."
hoc_payload <- list(constructs = list(list(name = "HOC", is_higher_order = TRUE)))
ordinary_payload <- list(constructs = list(list(name = "Image", is_higher_order = FALSE)))

message <- tryCatch({
  env$assert_micom_payload_supported(hoc_payload)
  ""
}, error = function(err) conditionMessage(err))

stopifnot(identical(message, expected))
stopifnot(isTRUE(env$assert_micom_payload_supported(ordinary_payload)))

cat("PASS MICOM HOC backend guard\n")
```

- [ ] **Step 3: Run both tests and verify RED**

Run:

```powershell
node tests\permutationAnalysisPlumberContract.test.mjs
r-api\R-Portable\App\R-Portable\bin\Rscript.exe tests\rApiMicomHocGuard.R
```

Expected: both fail because `assert_micom_payload_supported()` and its route calls do not exist.

- [ ] **Step 4: Add the minimal R guard helper**

In `r-api/plumber.R`, immediately after `has_higher_order_construct()` add:

```r
micom_hoc_unavailable_message <- paste0(
  "MICOM is currently not available for models containing higher-order constructs. ",
  "Run MICOM on a model without higher-order constructs."
)

assert_micom_payload_supported <- function(payload) {
  if (has_higher_order_construct(payload)) {
    stop(micom_hoc_unavailable_message, call. = FALSE)
  }
  TRUE
}
```

- [ ] **Step 5: Guard both routes before model fitting**

In both MICOM routes, normalize the payload before loading MICOM or fitting the core:

```r
prepared <- time_phase(timings, "prepare payload and read dataset", prepare_payload(req))
payload <- prepared$payload
data <- prepared$data
assert_micom_payload_supported(payload)
ensure_micom_loaded()
core <- time_phase(timings, "get cached/base pls model", get_cached_pls_core(payload, data))
```

Apply that exact order to:

- `/run-permutation-configural-precheck`
- `/run-permutation-analysis`

Remove the earlier pre-payload `ensure_micom_loaded()` call from each route. Do not change route error serialization; `format_analysis_error_message()` already preserves this message unchanged.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
node tests\permutationAnalysisPlumberContract.test.mjs
r-api\R-Portable\App\R-Portable\bin\Rscript.exe tests\rApiMicomHocGuard.R
node tests\micomHocAvailability.test.mjs
node tests\micomHocUnavailableStatic.test.mjs
```

Expected: all tests print `PASS` and exit 0.

- [ ] **Step 7: Prove ordinary MICOM and `micom.R` are unchanged**

Run:

```powershell
node tests\micomHocStep1.test.mjs
git status --short -- r-api\micom.R
```

Expected: MICOM HOC Step 1 legacy regression exits 0; `git status` prints no `r-api/micom.R` entry.

- [ ] **Step 8: Pause for repository approval**

Report the backend helper, route order, exact-error test, and ordinary MICOM result. Do not stage or commit.

### Task 4: Final Verification and Review Gate

**Files:**
- Verify only; production edits are allowed only for test-proven findings.

- [ ] **Step 1: Run the complete focused suite**

Run:

```powershell
npm run typecheck
node tests\micomHocAvailability.test.mjs
node tests\micomHocUnavailableStatic.test.mjs
node tests\permutationAnalysisPlumberContract.test.mjs
node tests\permutationAnalysisResultsContract.test.mjs
node tests\micomMGAWorkspaceCache.test.mjs
node tests\micomHocStep1.test.mjs
r-api\R-Portable\App\R-Portable\bin\Rscript.exe tests\rApiMicomHocGuard.R
```

Expected: typecheck exits 0 and every test prints `PASS`.

- [ ] **Step 2: Inspect only the scoped diff**

Run:

```powershell
git diff -- src\utils\micomAvailability.ts src\pages\ModelCanvas.tsx src\pages\ResultsView.tsx r-api\plumber.R tests\micomHocAvailability.test.mjs tests\micomHocUnavailableStatic.test.mjs tests\rApiMicomHocGuard.R tests\permutationAnalysisPlumberContract.test.mjs
git status --short -- r-api\micom.R
```

Expected: only the planned guard work appears in the scoped diff; `r-api/micom.R` remains absent from status.

- [ ] **Step 3: Invoke the requesting-code-review workflow**

Because the repository may remain uncommitted, give the reviewer the design document, plan document, exact scoped diff, and test outputs. If the user later authorizes commits, use the approved base/head SHA template from `requesting-code-review/code-reviewer.md`. Require the reviewer to check:

- Exact message consistency.
- Guard order before calculation/core fitting.
- Both UI entry points and both backend routes.
- Ordinary MICOM preservation.
- No changes to `r-api/micom.R`.

- [ ] **Step 4: Resolve review findings with TDD**

For each Critical or Important issue, add or tighten a failing regression first, verify RED, implement the smallest correction, and verify GREEN. Re-run the complete focused suite after corrections.

- [ ] **Step 5: Hand off the completed MICOM guard**

Report changed files, exact commands and results, any unrun checks, and residual risk. Do not stage, commit, push, or begin the MGA plan without explicit user approval.
