Sys.setenv(
  METIS_ALLOWED_DATA_ROOTS = getwd(),
  METIS_ANALYSIS_CORES = "1"
)

exprs <- parse("r-api/plumber.R")
env <- new.env(parent = globalenv())
for (i in seq_len(length(exprs) - 2L)) {
  eval(exprs[[i]], envir = env)
}

payload <- list(
  datasetPath = file.path(getwd(), "sample dataset.csv"),
  constructs = list(
    list(name = "PEOU", type = "Reflective", indicators = as.list(paste0("PEOU_", 1:4))),
    list(name = "PU", type = "Reflective", indicators = as.list(paste0("PU_", 1:4))),
    list(name = "BI", type = "Reflective", indicators = as.list(paste0("BI_", 1:4)))
  ),
  paths = list(
    list(from = "PEOU", to = "BI"),
    list(from = "PU", to = "BI"),
    list(from = "PEOU*PU", to = "BI")
  ),
  interactions = list(
    list(iv = "PEOU", moderator = "PU", outcome = "BI")
  ),
  algorithm = "standard",
  algorithmSettings = list(maxIterations = 300, bootstrapped = TRUE, bootstrapSamples = 100)
)

normalized <- env$validate_payload_object(payload)

interaction_paths <- Filter(
  function(path) identical(path$from, "PEOU*PU") && identical(path$to, "BI"),
  normalized$paths
)

stopifnot(length(interaction_paths) == 1L)
stopifnot(length(normalized$interactions) == 1L)
stopifnot(identical(normalized$interactions[[1]]$iv, "PEOU"))
stopifnot(identical(normalized$interactions[[1]]$moderator, "PU"))
stopifnot(identical(normalized$interactions[[1]]$outcome, "BI"))

options(error = traceback)
options(error = traceback)
data <- env$read_dataset(normalized$datasetPath)
core <- env$run_pls_core(normalized, data)

result <- env$extract_pls_sections(normalized, data, core)





cat("PASS moderation interaction path validation\n")

