import json

# package.json
with open('package.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
for k in ['concurrently', 'electron', 'esbuild', 'png-to-ico', 'wait-on']:
    if k in data.get('devDependencies', {}):
        del data['devDependencies'][k]
with open('package.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2)
print("Updated package.json")

def repl_literal(path, search, replacement):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    new_content = content.replace(search, replacement)
    if new_content != content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {path}")
    else:
        pass

# DraftNumberInput.tsx
repl_literal(r"src/components/DraftNumberInput.tsx", "export function resolveDraftNumber", "function resolveDraftNumber")

# ResultsCharts.tsx
repl_literal(r"src/components/ResultsCharts.tsx", "export { CHART_SUPPORTED_PANELS, getChartConfig, shouldExportChart } from '../results/chartRegistry'\n", "")
repl_literal(r"src/components/ResultsCharts.tsx", "export function HBarChart", "function HBarChart")
repl_literal(r"src/components/ResultsCharts.tsx", "export function ForestPlot", "function ForestPlot")
repl_literal(r"src/components/ResultsCharts.tsx", "export function GroupedBarChart", "function GroupedBarChart")
for fn in ['buildPathCoefItems', 'buildForestItems', 'buildRSquareItems', 'buildReliabilityGroups', 'buildOuterLoadingItems', 'buildVIFItems', 'buildPlsPredictSummaryItems', 'buildPredictionErrorItems', 'buildGenericBarItems', 'buildChartSvgForPanel']:
    repl_literal(r"src/components/ResultsCharts.tsx", f"export function {fn}", f"function {fn}")

# PathDiagram.tsx
repl_literal(r"src/components/PathDiagram.tsx", "export interface DiagramResults", "interface DiagramResults")

# appBranding.ts
repl_literal(r"src/config/appBranding.ts", "export const APP_VERSION =", "const APP_VERSION =")
repl_literal(r"src/config/appBranding.ts", "export const APP_VERSION_LABEL =", "const APP_VERSION_LABEL =")
repl_literal(r"src/config/appBranding.ts", "export function getEditionReleaseLabel", "function getEditionReleaseLabel")

# chartRegistry.ts
repl_literal(r"src/results/chartRegistry.ts", "export function supportsChart", "function supportsChart")

# panelCatalog.ts
repl_literal(r"src/results/panelCatalog.ts", "export interface PanelDefinition", "interface PanelDefinition")
repl_literal(r"src/results/panelCatalog.ts", "export function getPanelDefinition", "function getPanelDefinition")

# panelData.ts
repl_literal(r"src/results/panelData.ts", "export function getPanelDataPath", "function getPanelDataPath")

# plsApi.ts
repl_literal(r"src/services/plsApi.ts", "export interface RunPlsPathResult", "interface RunPlsPathResult")
repl_literal(r"src/services/plsApi.ts", "export interface RunPlsR2Result", "interface RunPlsR2Result")

# calculationContext.tsx
for t in ['CalcType', 'ProgressMode', 'ActiveCalc', 'CompletedCalc', 'CalculationState', 'CalculationAction']:
    repl_literal(r"src/state/calculationContext.tsx", f"export type {t}", f"type {t}")

# workspace.ts
repl_literal(r"src/types/workspace.ts", "export interface WorkspaceChildBase", "interface WorkspaceChildBase")

# analysisPalette.ts
repl_literal(r"src/utils/analysisPalette.ts", "export const ANALYSIS_TONE_TEXT_CLASS =", "const ANALYSIS_TONE_TEXT_CLASS =")
repl_literal(r"src/utils/analysisPalette.ts", "export const ANALYSIS_TONE_BADGE_CLASS =", "const ANALYSIS_TONE_BADGE_CLASS =")

# datasetColumns.ts
repl_literal(r"src/utils/datasetColumns.ts", "export function ensureUniqueHeaders", "function ensureUniqueHeaders")

# datasetLoading.ts
repl_literal(r"src/utils/datasetLoading.ts", "export interface DatasetFileBridge", "interface DatasetFileBridge")

# datasetParsing.ts
repl_literal(r"src/utils/datasetParsing.ts", "export const HEAD_ROWS", "const HEAD_ROWS")
repl_literal(r"src/utils/datasetParsing.ts", "export function detectDelimiter", "function detectDelimiter")
repl_literal(r"src/utils/datasetParsing.ts", "export function parseCSVText", "function parseCSVText")
repl_literal(r"src/utils/datasetParsing.ts", "export function parseExcelBase64", "function parseExcelBase64")

# datasetPersistence.ts
repl_literal(r"src/utils/datasetPersistence.ts", "export function buildCsvText", "function buildCsvText")
repl_literal(r"src/utils/datasetPersistence.ts", "export function encodeBase64", "function encodeBase64")

# diagnostics.ts
repl_literal(r"src/utils/diagnostics.ts", "export type DiagnosticCategory", "type DiagnosticCategory")
repl_literal(r"src/utils/diagnostics.ts", "export type DiagnosticLevel", "type DiagnosticLevel")
for fn in ['getDiagnostics', 'clearDiagnostics', 'subscribeDiagnostics', 'formatDiagnosticsForCopy', 'formatDiagnosticsAsJson']:
    repl_literal(r"src/utils/diagnostics.ts", f"export function {fn}", f"function {fn}")

# plsModelPayload.ts
repl_literal(r"src/utils/plsModelPayload.ts", "export interface PlsCanvasIndicatorLike", "interface PlsCanvasIndicatorLike")

# tarkReadiness.ts
repl_literal(r"src/utils/tarkReadiness.ts", "export type CoreRequiredMode", "type CoreRequiredMode")
repl_literal(r"src/utils/tarkReadiness.ts", "export type AdvancedRequiredMode", "type AdvancedRequiredMode")
repl_literal(r"src/utils/tarkReadiness.ts", "export const REQUIRED_RESULTS", "const REQUIRED_RESULTS")
repl_literal(r"src/utils/tarkReadiness.ts", "export const ADVANCED_ANALYSIS_RESULT", "const ADVANCED_ANALYSIS_RESULT")
repl_literal(r"src/utils/tarkReadiness.ts", "export function getResultMode", "function getResultMode")

# tarkReportTables.ts
repl_literal(r"src/utils/tarkReportTables.ts", "export const TARK_USER_FILL_CELL", "const TARK_USER_FILL_CELL")

# themeAccent.ts
repl_literal(r"src/utils/themeAccent.ts", "export const DEFAULT_ACCENT_COLOR", "const DEFAULT_ACCENT_COLOR")
repl_literal(r"src/utils/themeAccent.ts", "export const LEGACY_DEFAULT_ACCENT_COLORS", "const LEGACY_DEFAULT_ACCENT_COLORS")
repl_literal(r"src/utils/themeAccent.ts", "export const APP_ACCENT_OPTIONS", "const APP_ACCENT_OPTIONS")

print("Done")
