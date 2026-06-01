import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const read = (relativePath) => fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')

const [
  contextSource,
  canvasSource,
  resultsSource,
  plsApiSource,
  preloadSource,
  mainSource,
  plumberSource,
  viteEnvSource,
  titleBarSource,
] = await Promise.all([
  read('src/state/calculationContext.tsx'),
  read('src/pages/ModelCanvas.tsx'),
  read('src/pages/ResultsView.tsx'),
  read('src/services/plsApi.ts'),
  read('electron/preload.ts'),
  read('electron/main.ts'),
  read('r-api/plumber.R'),
  read('src/vite-env.d.ts'),
  read('src/components/TitleBar.tsx'),
])

assert.match(contextSource, /lastTransientDone/, 'CalculationContext should track a transient done chip.')
assert.match(contextSource, /clearTransientDone/, 'CalculationContext should auto-clear transient done state.')
assert.match(contextSource, /__metisIsCalculating/, 'CalculationProvider should expose the busy flag for Electron quit confirmation.')
assert.match(contextSource, /onConfirmQuitDuringCalc/, 'CalculationProvider should listen for Electron quit confirmation requests.')
assert.match(contextSource, /<CalcCancelDialog\s+intent="quit"/, 'CalculationProvider should render the shared quit confirmation dialog.')

assert.doesNotMatch(titleBarSource, /ViewResultsButton/, 'TitleBar should not show a persistent View results CTA.')
assert.doesNotMatch(titleBarSource, /View\s+\{labelFor\(recent\.type\)\}\s+results/, 'TitleBar should not keep a stale View PLS-SEM results label.')

assert.match(canvasSource, /useCalculationDispatch/, 'ModelCanvas should dispatch calculation context actions.')
assert.match(canvasSource, /useIsCalculating/, 'ModelCanvas should disable run entry points while a calculation is active.')
assert.match(canvasSource, /runBootstrapModel/, 'Bootstrap should keep the single SEMinR backend call for default-sized runs.')
assert.doesNotMatch(canvasSource, /runBootstrapChunked|onChunkStart|chunk_n/, 'ModelCanvas should not keep chunked bootstrap flow.')
assert.match(canvasSource, /type: 'pls'[\s\S]*progressMode: 'indeterminate'/, 'PLS-SEM should use indeterminate modal progress while the blocking backend call runs.')
assert.match(canvasSource, /type: 'bootstrap'[\s\S]*progressMode: 'indeterminate'/, 'Bootstrap should use indeterminate modal progress while the blocking backend call runs.')
assert.match(canvasSource, /type: 'plspredict'[\s\S]*progressMode: 'indeterminate'/, 'PLSpredict should use indeterminate modal progress while the blocking backend call runs.')
assert.match(canvasSource, /type: 'advanced'[\s\S]*progressMode: 'indeterminate'/, 'Advanced analysis should use indeterminate modal progress while the blocking backend call runs.')
assert.match(canvasSource, /Backend detail:/, 'Unexpected backend failures should show the real backend detail instead of only the generic model error.')
assert.match(canvasSource, /AbortController/, 'ModelCanvas should keep an AbortController for bootstrap cancellation.')
assert.match(canvasSource, /type: 'start'[\s\S]*type: 'pls'/, 'PLS-SEM should start a context-backed calculation.')
assert.match(canvasSource, /type: 'start'[\s\S]*type: 'bootstrap'/, 'Bootstrap should start a context-backed calculation.')
assert.match(canvasSource, /type: 'start'[\s\S]*type: 'plspredict'/, 'PLSpredict should start a context-backed calculation.')
assert.match(canvasSource, /type: 'start'[\s\S]*type: 'advanced'/, 'Advanced analysis should start a context-backed calculation.')
assert.match(canvasSource, /type: 'complete'[\s\S]*resultsRoute/, 'Completed calculations should update the contextual View results CTA.')
assert.match(canvasSource, /navigationState:[\s\S]*savedAnalysis[\s\S]*savedModelSnapshot/, 'Completed calculations should preserve result navigation state for path diagrams.')
assert.match(canvasSource, /showTransientDone:\s*!shouldAutoOpenResults/, 'Auto-opened results should suppress the click-to-view done chip.')
assert.doesNotMatch(canvasSource, /<ViewResultsButton\b/, 'Analysis setup modals should not render a View results button.')
assert.doesNotMatch(canvasSource, /Open report|openReport|setOpenReport/, 'The old Open report checkbox state should be removed.')
assert.doesNotMatch(titleBarSource, /<ViewResultsButton\b/, 'TitleBar should keep results CTA text cleared from all analysis modes.')

assert.match(resultsSource, /useCalculationDispatch/, 'ResultsView should dispatch calculation context actions for analyses started from results.')
assert.match(resultsSource, /useIsCalculating/, 'ResultsView should respect the global calculation lockout.')
assert.match(resultsSource, /type: 'start'[\s\S]*type: 'bootstrap'/, 'ResultsView bootstrap should start a context-backed calculation.')
assert.doesNotMatch(resultsSource, /runBootstrapChunked|chunk_n/, 'ResultsView should not keep chunked bootstrap flow.')
assert.match(resultsSource, /type: 'start'[\s\S]*type: 'plspredict'/, 'ResultsView PLSpredict should start a context-backed calculation.')
assert.match(resultsSource, /type: 'start'[\s\S]*type: 'advanced'/, 'ResultsView advanced analysis should start a context-backed calculation.')
assert.match(resultsSource, /progressMode: 'indeterminate'/, 'ResultsView blocking analyses should use indeterminate modal progress.')
assert.match(resultsSource, /type: 'complete'[\s\S]*showTransientDone: false/, 'ResultsView should clear the modal immediately because it updates the current results page.')
assert.match(resultsSource, /savedDiagramBaseResults[\s\S]*setPlsResultsForDiagram/, 'ResultsView should use carried base PLS results for bootstrap diagrams.')
assert.doesNotMatch(resultsSource, /bootstrapBlockingScreen|setBootstrapBlockingScreen|Bootstrapping, please wait/, 'ResultsView should not keep its old local bootstrap blocking overlay.')

assert.match(plsApiSource, /export async function runBootstrapModel/, 'plsApi should expose the single bootstrap route.')
assert.doesNotMatch(plsApiSource, /runBootstrapChunked|runBootstrapChunk|finalizeBootstrap|run-bootstrap-chunk|finalize-bootstrap|AccumulatedBootstrap|BootstrapChunk|concatBootstrapArray/, 'plsApi should not expose chunked bootstrap.')

assert.match(preloadSource, /onConfirmQuitDuringCalc/, 'Preload should expose quit-during-calc listener.')
assert.match(preloadSource, /quitConfirmed/, 'Preload should expose quit confirmation reply.')
assert.match(preloadSource, /quitCancelled/, 'Preload should expose quit cancellation reply.')
assert.doesNotMatch(preloadSource, /runBootstrapChunk|finalizeBootstrap/, 'Preload should not expose chunked bootstrap bridge methods.')

assert.match(viteEnvSource, /onConfirmQuitDuringCalc/, 'Window electronAPI types should include quit confirmation listener.')
assert.match(viteEnvSource, /__metisIsCalculating/, 'Window types should include the renderer busy flag.')

assert.match(mainSource, /confirm-quit-during-calc/, 'Electron main should ask the renderer before quitting during a calculation.')
assert.match(mainSource, /quit-confirmed/, 'Electron main should accept the quit confirmed reply.')
assert.match(mainSource, /quit-cancelled/, 'Electron main should accept the quit cancelled reply.')
assert.doesNotMatch(mainSource, /runBootstrapChunk|finalizeBootstrap|run-bootstrap-chunk|finalize-bootstrap/, 'Electron main should not register chunked bootstrap IPC routes.')

assert.match(plumberSource, /analysis_core_plan <- function\(\)[\s\S]*max\(1L, min\(as\.integer\(requested\), as\.integer\(detected\)\)\)[\s\S]*analysis_cores <- function\(\)/, 'R API should keep bounded analysis core planning and compatibility selection.')
assert.match(plumberSource, /reserve <- if \(detected > 16L\) \{\s*4L\s*\} else if \(detected > 10L\) \{\s*2L\s*\} else \{\s*1L\s*\}[\s\S]*requested <- detected - reserve/, 'R API should reserve four cores above 16 detected cores, two cores from 11 to 16 cores, and one core at 10 or fewer detected cores.')
assert.doesNotMatch(plumberSource, /coerce_boot_array|run-bootstrap-chunk|finalize-bootstrap|chunk_n|accumulated|Chunked bootstrap|chunked bootstrap/, 'R API should not expose chunked bootstrap routes or helpers.')
assert.match(plumberSource, /assemble_bootstrap_response <- function/, 'R API should share bootstrap response assembly for the single bootstrap route.')
assert.match(plumberSource, /"\/run-bootstrap"/, 'R API should expose the single /run-bootstrap route.')

assert.match(titleBarSource, /label: 'Feedback'[\s\S]*action: 'open-feedback'/, 'TitleBar should keep Feedback available from Help.')
assert.doesNotMatch(titleBarSource, /id="tour-feedback"|ChatCircleText/, 'TitleBar should not render the old feedback button near the window controls.')

console.log('PASS calculating modal plan static coverage')
