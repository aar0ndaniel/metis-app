import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const source = await fs.readFile(path.join(workspaceRoot, 'src/components/DatasetManagerModal.tsx'), 'utf8')

assert.match(
  source,
  /selectedIds\.length >= 1[\s\S]*onClick=\{\(\) => void deleteDatasetIds\(selectedIds\)\}/,
  'Dataset Manager should expose a visible delete button whenever at least one dataset is selected.',
)

assert.match(
  source,
  /selectedIds\.length === 1\s*\?\s*'Delete selected dataset'\s*:\s*`Delete \$\{selectedIds\.length\} selected datasets`/,
  'Dataset Manager delete tooltip should describe single and multiple dataset selections.',
)

assert.match(
  source,
  /const saveResult = await \(window as any\)\.electronAPI\?\.saveWorkspace\?\.\(nextWorkspace\)[\s\S]*saveResult\?\.success === false[\s\S]*throw new Error/,
  'Dataset Manager should stop workspace UI updates when saveWorkspace reports a failure.',
)

assert.match(
  source,
  /const deleteResult = await \(window as any\)\.electronAPI\?\.deleteWorkspaceChild\?\.\([\s\S]*deleteResult\?\.success === false[\s\S]*throw new Error/,
  'Dataset Manager should stop dataset deletion when deleteWorkspaceChild reports a failure.',
)

assert.match(
  source,
  /const nextWorkspace = deleteDatasetsFromWorkspace\(hydratedWorkspace, datasetIds\)[\s\S]*await persistWorkspace\(nextWorkspace\)[\s\S]*for \(const datasetId of datasetIds\)[\s\S]*deleteWorkspaceChild/,
  'Dataset Manager should save workspace metadata before deleting dataset files so a save failure cannot leave stale references.',
)

assert.match(
  source,
  /dispatchToast\(\s*'error',\s*'Dataset update failed'/,
  'Dataset Manager should show a user-facing error toast when dataset updates fail.',
)

assert.match(
  source,
  /catch \(error\)[\s\S]*Dataset update failed[\s\S]*Could not rename this dataset/,
  'Dataset rename failures should keep the user informed instead of silently closing.',
)

assert.match(
  source,
  /catch \(error\)[\s\S]*Dataset update failed[\s\S]*Could not select this dataset/,
  'Dataset selection failures should keep the user informed instead of silently failing.',
)

console.log('PASS dataset manager visible delete contract')
