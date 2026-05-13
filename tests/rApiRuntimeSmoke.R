Sys.setenv(
  METIS_ALLOWED_DATA_ROOTS = getwd(),
  METIS_ANALYSIS_CORES = "1",
  METIS_MAX_PLS_CORE_CACHE_ENTRIES = "8"
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
    list(name = "ATT", type = "Reflective", indicators = as.list(paste0("ATT_", 1:4))),
    list(name = "BI", type = "Reflective", indicators = as.list(paste0("BI_", 1:4)))
  ),
  paths = list(
    list(from = "PEOU", to = "PU"),
    list(from = "PU", to = "ATT"),
    list(from = "ATT", to = "BI")
  ),
  interactions = list(),
  algorithm = "standard",
  algorithmSettings = list()
)

data <- env$read_dataset(payload$datasetPath)
core1 <- env$get_cached_pls_core(payload, data)
core2 <- env$get_cached_pls_core(payload, data)
stopifnot(identical(core1, core2))

pls_sections <- env$extract_pls_sections(payload, data, core1)
stopifnot(length(pls_sections$final_results$path_coefficients) > 0)

boot_model <- seminr::bootstrap_model(core1$model, nboot = 50, cores = env$analysis_cores())
boot_summary <- summary(boot_model)
boot_paths <- as.data.frame(boot_summary$bootstrapped_paths)
stopifnot(!is.null(boot_summary$bootstrapped_paths))
stopifnot(nrow(boot_paths) > 0)

predict_model <- seminr::predict_pls(core1$model, technique = seminr::predict_DA, noFolds = 2, reps = 1)
predict_sections <- env$extract_plspredict_sections(payload, data, core1, predict_model, 2, 1)
stopifnot(length(predict_sections$final_results$plspredict_mv_summary) > 0)

advanced_payload <- payload
advanced_payload$targetConstruct <- "BI"
advanced_payload$predecessorScope <- "direct"
advanced_payload$analyses <- list(ipma = TRUE, nca = TRUE, cipma = TRUE)
advanced_payload$runDepth <- 10
advanced_payload$bottleneckStepSize <- 10

advanced_sections <- env$run_advanced_sections(advanced_payload, data, core1)
stopifnot(length(advanced_sections$final_results$priority_map) > 0)
stopifnot(length(advanced_sections$final_results$necessity_check) > 0)
stopifnot(length(advanced_sections$final_results$ceiling_lines) > 0)
stopifnot(length(advanced_sections$final_results$cipma_priorities) > 0)

messages <- vapply(advanced_sections$execution_log, function(entry) entry$message, character(1))
stopifnot(any(grepl("reused cIPMA", messages, fixed = TRUE)))

cat("PLS paths:", length(pls_sections$final_results$path_coefficients), "\n")
cat("Bootstrap rows:", nrow(boot_paths), "\n")
cat("PLSpredict rows:", length(predict_sections$final_results$plspredict_mv_summary), "\n")
cat(
  "Advanced rows:",
  length(advanced_sections$final_results$priority_map),
  length(advanced_sections$final_results$necessity_check),
  length(advanced_sections$final_results$ceiling_lines),
  length(advanced_sections$final_results$cipma_priorities),
  "\n"
)
