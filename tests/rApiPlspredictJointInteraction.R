Sys.setenv(METIS_ALLOWED_DATA_ROOTS = getwd(), METIS_ANALYSIS_CORES = "1")

exprs <- parse("r-api/plumber.R")
env <- new.env(parent = globalenv())
for (i in seq_len(length(exprs) - 2L)) eval(exprs[[i]], envir = env)

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
    list(from = "ATT", to = "BI"),
    list(from = "PEOU*PU", to = "ATT"),
    list(from = "PEOU*ATT", to = "BI")
  ),
  interactions = list(
    list(iv = "PEOU", moderator = "PU", outcome = "ATT"),
    list(iv = "PEOU", moderator = "ATT", outcome = "BI")
  ),
  algorithm = "standard",
  technique = "DA",
  predictionSeed = 123L,
  folds = 2L,
  repetitions = 1L,
  cvpatEnabled = FALSE,
  algorithmSettings = list()
)

data <- env$read_dataset(payload$datasetPath)
core <- env$get_cached_pls_core(payload, data)
stopifnot(all(c("PEOU*PU", "PEOU*ATT") %in% names(core$model$interaction_params)))

set.seed(payload$predictionSeed)
native <- seminr::predict_pls(
  core$model,
  technique = seminr::predict_DA,
  noFolds = payload$folds,
  reps = payload$repetitions
)
sections <- env$extract_plspredict_sections(payload, data, core, native, payload$folds, payload$repetitions)

native_pls <- as.data.frame(native$items$PLS_out_of_sample)
native_lm <- as.data.frame(native$items$lm_out_of_sample)
native_actuals <- as.data.frame(native$items$item_actuals)
native_pls_errors <- as.data.frame(native$items$PLS_out_of_sample_residuals)
native_lm_errors <- as.data.frame(native$items$lm_out_of_sample_residuals)
rows <- sections$final_results$mv_predictions_and_errors
stopifnot(length(rows) == nrow(native_pls) * ncol(native_pls))

summary_rows <- sections$final_results$plspredict_mv_summary
for (indicator in colnames(native_pls)) {
  summary_index <- which(vapply(summary_rows, function(candidate) identical(candidate$Indicator, indicator), logical(1)))[[1]]
  summary_row <- summary_rows[[summary_index]]
  stopifnot(isTRUE(all.equal(summary_row$`PLS-SEM_RMSE`, sqrt(mean(native_pls_errors[[indicator]]^2)), tolerance = 1e-12)))
  stopifnot(isTRUE(all.equal(summary_row$`PLS-SEM_MAE`, mean(abs(native_pls_errors[[indicator]])), tolerance = 1e-12)))
  stopifnot(isTRUE(all.equal(summary_row$LM_RMSE, sqrt(mean(native_lm_errors[[indicator]]^2)), tolerance = 1e-12)))
  stopifnot(isTRUE(all.equal(summary_row$LM_MAE, mean(abs(native_lm_errors[[indicator]])), tolerance = 1e-12)))
}

for (indicator in colnames(native_pls)) {
  for (case_id in rownames(native_pls)) {
    row_index <- which(vapply(rows, function(candidate) identical(candidate$Case, case_id) && identical(candidate$Indicator, indicator), logical(1)))[[1]]
    row <- rows[[row_index]]
    stopifnot(isTRUE(all.equal(row$Actual, as.numeric(native_actuals[case_id, indicator]), tolerance = 1e-12)))
    stopifnot(isTRUE(all.equal(row$`PLS Prediction`, as.numeric(native_pls[case_id, indicator]), tolerance = 1e-12)))
    stopifnot(isTRUE(all.equal(row$`PLS Error`, as.numeric(native_pls_errors[case_id, indicator]), tolerance = 1e-12)))
    stopifnot(isTRUE(all.equal(row$`LM Prediction`, as.numeric(native_lm[case_id, indicator]), tolerance = 1e-12)))
    stopifnot(isTRUE(all.equal(row$`LM Error`, as.numeric(native_lm_errors[case_id, indicator]), tolerance = 1e-12)))
  }
}

cat("PLSpredict joint-interaction native SEMinR parity passed\n")
