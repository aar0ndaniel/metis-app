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
  paths = list(list(from = "PEOU", to = "PU"), list(from = "PU", to = "ATT"), list(from = "ATT", to = "BI")),
  interactions = list(), algorithm = "standard", technique = "DA", predictionSeed = 123L,
  folds = 2L, repetitions = 1L, cvpatEnabled = FALSE, algorithmSettings = list()
)

data <- env$read_dataset(payload$datasetPath)
core <- env$get_cached_pls_core(payload, data)
set.seed(payload$predictionSeed)
native <- seminr::predict_pls(core$model, technique = seminr::predict_DA, noFolds = payload$folds, reps = payload$repetitions)
sections <- env$extract_plspredict_sections(payload, data, core, native, payload$folds, payload$repetitions)
loocv_payload <- payload
loocv_payload$validationMode <- "LOOCV"
set.seed(loocv_payload$predictionSeed)
loocv_native <- seminr::predict_pls(core$model, technique = seminr::predict_DA, noFolds = NULL, reps = 1L)
loocv_sections <- env$extract_plspredict_sections(loocv_payload, data, core, loocv_native, nrow(core$model$data), 1L)
stopifnot(identical(loocv_sections$algorithm$settings$cross_validation, "LOOCV"))
stopifnot(length(loocv_sections$final_results$plspredict_mv_summary) == ncol(loocv_native$items$PLS_out_of_sample_residuals))
validated_default <- env$validate_payload_object(payload)
stopifnot(identical(validated_default$validationMode, NULL))
for (mode in c("K-fold", "k-fold", "LOOCV", "loocv")) {
  validation_payload <- payload
  validation_payload$validationMode <- mode
  validated <- env$validate_payload_object(validation_payload)
  stopifnot(tolower(validated$validationMode) == tolower(mode))
}
interaction_payload <- payload
interaction_payload$interactionMethod <- "Product-indicator"
validated_interaction_payload <- env$validate_payload_object(interaction_payload)
stopifnot(is.null(validated_interaction_payload$interactionMethod))

native_pls_errors <- as.data.frame(native$items$PLS_out_of_sample_residuals)
native_lm_errors <- as.data.frame(native$items$lm_out_of_sample_residuals)
summary_rows <- sections$final_results$plspredict_mv_summary
stopifnot(length(summary_rows) == ncol(native_pls_errors))
first_indicator <- colnames(native_pls_errors)[[1]]
first_row <- summary_rows[[which(vapply(summary_rows, function(row) identical(row$Indicator, first_indicator), logical(1)))[[1]]]]
stopifnot(isTRUE(all.equal(first_row$`PLS-SEM_RMSE`, sqrt(mean(native_pls_errors[[first_indicator]]^2)), tolerance = 1e-12)))
stopifnot(isTRUE(all.equal(first_row$`PLS-SEM_MAE`, mean(abs(native_pls_errors[[first_indicator]])), tolerance = 1e-12)))
stopifnot(isTRUE(all.equal(first_row$LM_RMSE, sqrt(mean(native_lm_errors[[first_indicator]]^2)), tolerance = 1e-12)))
stopifnot(length(sections$final_results$mv_predictions_and_errors) == nrow(native$items$PLS_out_of_sample) * ncol(native_pls_errors))
stopifnot(identical(env$plspredict_default_folds(), 10L))
stopifnot(identical(env$plspredict_default_repetitions(), 1L))

manual_q2 <- function(actuals, residuals, model_data, folds, seed, indicator) {
  set.seed(seed)
  order <- sample(nrow(model_data), nrow(model_data), replace = FALSE)
  fold_ids <- cut(seq_len(nrow(model_data)), breaks = folds, labels = FALSE)
  fold_by_row <- setNames(as.integer(fold_ids), rownames(model_data)[order])
  fold_by_row <- fold_by_row[rownames(model_data)]
  actual <- as.numeric(actuals[[indicator]])
  errors <- as.numeric(residuals[[indicator]])
  values <- as.numeric(model_data[[indicator]])
  sse_naive <- 0
  for (i in seq_along(actual)) {
    train <- values[fold_by_row != fold_by_row[[rownames(actuals)[[i]]]]]
    train <- train[is.finite(train)]
    if (length(train)) sse_naive <- sse_naive + (actual[[i]] - mean(train))^2
  }
  1 - sum(errors^2) / sse_naive
}
expected_q2 <- manual_q2(native$items$item_actuals, native_pls_errors, core$model$data, payload$folds, payload$predictionSeed, first_indicator)
stopifnot(isTRUE(all.equal(first_row$Q2predict, expected_q2, tolerance = 1e-12)))

loo_data <- data.frame(x = c(1, 2, 4, 8), row.names = as.character(1:4))
loo_actuals <- loo_data
loo_residuals <- data.frame(x = c(0.1, 0.2, 0.4, 0.8), row.names = rownames(loo_data))
loo_training_means <- vapply(seq_len(nrow(loo_data)), function(i) mean(loo_data$x[-i]), numeric(1))
loo_expected_q2 <- 1 - sum(loo_residuals$x^2) / sum((loo_actuals$x - loo_training_means)^2)
loo_q2 <- env$calculate_plspredict_q2(loo_actuals, loo_residuals, loo_data, folds = 4L, seed = 123L, validation_mode = "LOOCV")[["x"]]
stopifnot(isTRUE(all.equal(loo_q2, loo_expected_q2, tolerance = 1e-12)))

missing_native <- native
missing_native$items <- native$items[setdiff(names(native$items), "PLS_out_of_sample")]
missing_sections <- env$extract_plspredict_sections(payload, data, core, missing_native, payload$folds, payload$repetitions)
stopifnot(length(missing_sections$final_results$mv_predictions_and_errors) == 0L)
stopifnot(any(grepl("native item prediction slots were unavailable", vapply(missing_sections$algorithm$execution_log, function(row) row$message, character(1)), fixed = TRUE)))

for (missing_label in c("Mean replacement", "Listwise deletion", "Median replacement")) {
  settings_payload <- payload
  settings_payload$algorithmSettings <- list(missingData = missing_label, assessSyntax = TRUE)
  resolved <- env$resolve_pls_estimation_settings(settings_payload)
  stopifnot(is.function(resolved$missing), isTRUE(resolved$assess_syntax))
}
centroid_payload <- payload
centroid_payload$algorithmSettings <- list(innerWeighting = "Centroid weighting scheme")
centroid_resolved <- env$resolve_pls_estimation_settings(centroid_payload)
stopifnot(is.function(centroid_resolved$inner_weights), grepl("centroid", env$describe_unsupported_pls_settings(centroid_payload)[[1]], ignore.case = TRUE))

cat("PLSpredict native matrices, residual metrics, fold Q2, and missing-slot behavior passed\n")
