import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')
const portableRscript = path.join(workspaceRoot, 'r-api', 'R-Portable', 'App', 'R-Portable', 'bin', 'Rscript.exe')
const rscript = fs.existsSync(portableRscript) ? portableRscript : 'Rscript'

const rCode = `
setwd("${workspaceRoot.replace(/\\/g, '/').replace(/"/g, '\\"')}")
source("r-api/micom.R")

outer_weights <- matrix(
  0,
  nrow = 3,
  ncol = 2,
  dimnames = list(c("I1", "I2", "LOC1"), c("LOC1", "HOC"))
)
outer_weights["I1", "LOC1"] <- 0.7
outer_weights["I2", "LOC1"] <- 0.8
outer_weights["LOC1", "HOC"] <- 1

construct_scores <- matrix(
  c(1.1, 1.4, 1.7, 1.8, 2.0, 2.3, 1.1, 1.4, 1.7, 1.8, 2.0, 2.3),
  nrow = 6,
  ncol = 2,
  dimnames = list(NULL, c("LOC1", "HOC"))
)
path_coef <- matrix(
  0,
  nrow = 2,
  ncol = 2,
  dimnames = list(c("LOC1", "HOC"), c("LOC1", "HOC"))
)
model <- list(
  outer_weights = outer_weights,
  construct_scores = construct_scores,
  path_coef = path_coef,
  settings = list(maxIt = 300)
)
data <- data.frame(
  I1 = c(1, 2, 3, 4, 5, 6),
  I2 = c(2, 3, 4, 5, 6, 7),
  Group = c("A", "A", "C", "B", "B", "C"),
  check.names = FALSE
)

step1 <- metis_micom_step1(model, data, "Group", "A", "B")
indicator_status <- step1$status[step1$check == "identical indicators"]
if (!identical(indicator_status, "passed")) {
  stop(sprintf("Expected HOC lower-order construct rows to pass indicator checks, got %s.", indicator_status))
}

score_source <- .metis_micom_score_source_data(data, model)
if (!"LOC1" %in% names(score_source)) {
  stop("Expected MICOM score source to include lower-order construct scores for HOC c-values.")
}

indicators_by_construct <- .metis_indicators_by_construct(model, c("LOC1", "HOC"))
c_values <- .metis_micom_c_values(
  data = score_source,
  constructs = c("LOC1", "HOC"),
  indicators_by_construct = indicators_by_construct,
  weights_a = outer_weights,
  weights_b = outer_weights
)
if (!is.finite(c_values[["HOC"]])) {
  stop("Expected HOC c-value calculation to use lower-order construct scores without missing-column errors.")
}
`

const scriptPath = path.join(os.tmpdir(), `metis-micom-hoc-step1-${process.pid}.R`)
fs.writeFileSync(scriptPath, rCode, 'utf8')

let result
try {
  result = spawnSync(rscript, ['--vanilla', scriptPath], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    timeout: 30000,
  })
} finally {
  fs.rmSync(scriptPath, { force: true })
}

assert.equal(
  result.status,
  0,
  `MICOM HOC Step 1 regression failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
)

console.log('PASS MICOM HOC configural invariance regression')
