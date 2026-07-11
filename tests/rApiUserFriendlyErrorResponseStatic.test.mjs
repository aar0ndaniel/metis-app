import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const source = await fs.readFile(path.join(workspaceRoot, 'r-api/plumber.R'), 'utf8')
const plsApi = await fs.readFile(path.join(workspaceRoot, 'src/services/plsApi.ts'), 'utf8')

assert.match(
  source,
  /analysis_error_response <- function\(err, analysis_label, timeout_seconds\)/,
  'R API should centralize user-facing analysis failure responses.',
)

assert.match(
  source,
  /errorCode\s*=\s*analysis_error_code\(raw_message\)/,
  'Analysis failure responses should include a stable errorCode for frontend handling.',
)

assert.match(
  source,
  /plspredict could not be computed\|seminr returned no prediction[\s\S]*return\("PLSPREDICT_UNSUPPORTED"\)/,
  'PLSpredict unsupported-shape failures should keep a specific backend error code and action.',
)

assert.match(
  source,
  /userAction\s*=\s*analysis_error_user_action\(error_code, analysis_label, timeout_seconds\)/,
  'Analysis failure responses should include userAction guidance.',
)

assert.match(
  source,
  /backendDetail\s*=\s*raw_message/,
  'Analysis failure responses should preserve raw backend detail for support diagnostics.',
)

assert.match(
  source,
  /analysis_error_response\(err, "PLS-SEM analysis", analysis_timeout_seconds\)/,
  'PLS-SEM failures should use the structured analysis error response.',
)

assert.match(
  source,
  /analysis_error_response\(err, "Bootstrap analysis", bootstrap_timeout_seconds\)/,
  'Bootstrap failures should use the structured analysis error response.',
)

assert.match(
  source,
  /analysis_error_response\(err, "PLSpredict analysis", plspredict_timeout_seconds\)/,
  'PLSpredict failures should use the structured analysis error response.',
)

assert.match(
  source,
  /analysis_error_response\(err, "Advanced analysis", advanced_analysis_timeout_seconds\)/,
  'Advanced analysis failures should use the structured analysis error response.',
)

assert.doesNotMatch(
  source,
  /list\(success = FALSE, error = format_analysis_error_message\(err,/,
  'Routes should not return only a raw formatted error string.',
)

assert.match(
  source,
  /errorCode = "METIS_AUTH_FAILED"[\s\S]*userAction = "Restart Metis/,
  'Local-token failures should include a user-facing auth recovery action.',
)

assert.match(
  plsApi,
  /errorCode\?: string[\s\S]*userAction\?: string[\s\S]*backendDetail\?: string/,
  'Frontend analysis response types should accept structured backend error metadata.',
)

console.log('PASS R API user-friendly error response contract')
