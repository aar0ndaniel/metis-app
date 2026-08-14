Sys.setenv(METIS_ALLOWED_DATA_ROOTS = getwd(), METIS_ANALYSIS_CORES = "1")

exprs <- parse("r-api/plumber.R")
env <- new.env(parent = globalenv())
for (i in seq_len(length(exprs) - 2L)) eval(exprs[[i]], envir = env)
defaults <- env$validate_algorithm_settings_payload(list())
stopifnot(identical(defaults$hocMethod, "Two-stage"))
stopifnot(identical(defaults$hocTwoStage, "Disjoint two-stage"))

payload <- list(
  datasetPath = file.path(getwd(), "sample dataset.csv"),
  constructs = list(
    list(name = "PEOU", type = "Reflective", indicators = as.list(paste0("PEOU_", 1:4))),
    list(name = "PU", type = "Reflective", indicators = as.list(paste0("PU_", 1:4))),
    list(name = "HOC", is_higher_order = TRUE, higher_order_type = "Reflective", dimensions = list("PEOU", "PU")),
    list(name = "ATT", type = "Reflective", indicators = as.list(paste0("ATT_", 1:4))),
    list(name = "BI", type = "Reflective", indicators = as.list(paste0("BI_", 1:4)))
  ),
  paths = list(
    list(from = "HOC", to = "ATT"),
    list(from = "ATT", to = "BI"),
    list(from = "HOC", to = "BI")
  ),
  interactions = list(),
  algorithm = "standard",
  algorithmSettings = list(hocMethod = "Two-stage", hocTwoStage = "Embedded")
)

data <- env$read_dataset(payload$datasetPath)
core <- env$run_pls_core(payload, data)
stopifnot(identical(core$hoc_method_label, "Embedded Two-stage"))
stopifnot(!is.null(core$stage1_model))
stage1_network <- as.data.frame(core$stage1_model$smMatrix, stringsAsFactors = FALSE)
stopifnot(any(stage1_network$source == "HOC" & stage1_network$target == "BI"))
stopifnot(any(stage1_network$source == "HOC" & stage1_network$target == "PEOU"))
stopifnot(any(stage1_network$source == "HOC" & stage1_network$target == "PU"))
stopifnot(!any(stage1_network$source == "PEOU" & stage1_network$target == "BI"))
stage1_score_names <- colnames(core$stage1_model$construct_scores)
stopifnot(all(c("PEOU", "PU", "HOC", "ATT", "BI") %in% stage1_score_names))
stage1_scores <- env$extract_embedded_stage1_scores(core$stage1_model, payload$constructs)
stopifnot(isTRUE(all.equal(
  stage1_scores[, stage1_score_names, drop = FALSE],
  as.data.frame(core$stage1_model$construct_scores, check.names = FALSE),
  check.attributes = FALSE
)))

stage2_payload <- env$build_embedded_stage2_payload(payload)
stage2_construct_names <- vapply(stage2_payload$constructs, function(con) con$name, character(1))
stopifnot(identical(stage2_construct_names, c("HOC", "ATT", "BI")))

independent_loc_payload <- payload
independent_loc_payload$paths <- c(
  independent_loc_payload$paths,
  list(list(from = "PEOU", to = "BI"))
)
independent_stage2 <- env$build_embedded_stage2_payload(independent_loc_payload)
independent_stage2_names <- vapply(independent_stage2$constructs, function(con) con$name, character(1))
stopifnot(all(c("PEOU", "HOC", "ATT", "BI") %in% independent_stage2_names))
stopifnot(!("PU" %in% independent_stage2_names))

missing_score_error <- tryCatch({
  env$extract_embedded_stage1_scores(
    list(construct_scores = data.frame(HOC = 1:3, BI = 1:3)),
    payload$constructs
  )
  ""
}, error = function(e) conditionMessage(e))
stopifnot(grepl("missing required construct scores.*PEOU.*PU", missing_score_error, ignore.case = TRUE))

formative_payload <- payload
formative_payload$constructs[[3]]$higher_order_type <- "Formative"
formative_core <- env$run_pls_core(formative_payload, data)
formative_stage1_network <- as.data.frame(formative_core$stage1_model$smMatrix, stringsAsFactors = FALSE)
stopifnot(any(formative_stage1_network$source == "PEOU" & formative_stage1_network$target == "HOC"))
stopifnot(any(formative_stage1_network$source == "PU" & formative_stage1_network$target == "HOC"))
stopifnot(any(formative_stage1_network$source == "HOC" & formative_stage1_network$target == "BI"))
stopifnot(!any(formative_stage1_network$source == "HOC" & formative_stage1_network$target == "PEOU"))
sections <- env$extract_pls_sections(payload, data, core)
stopifnot(length(sections$final_results$path_coefficients) > 0)
stopifnot(length(sections$final_results$hoc_results) > 0)

repeated_payload <- payload
repeated_payload$algorithmSettings <- list(hocMethod = "Repeated indicators", hocTwoStage = "Embedded")
repeated_core <- env$run_pls_core(repeated_payload, data)
stopifnot(identical(repeated_core$hoc_method_label, "Repeated Indicators"))
repeated_network <- as.data.frame(repeated_core$model$smMatrix, stringsAsFactors = FALSE)
stopifnot(any(repeated_network$source == "HOC" & repeated_network$target == "PEOU"))
stopifnot(any(repeated_network$source == "HOC" & repeated_network$target == "PU"))
stopifnot(any(repeated_network$source == "HOC" & repeated_network$target == "ATT"))
stopifnot(any(repeated_network$source == "ATT" & repeated_network$target == "BI"))
stopifnot(any(repeated_network$source == "HOC" & repeated_network$target == "BI"))
stopifnot(!any(repeated_network$source == "PEOU" & repeated_network$target == "HOC"))
repeated_hoc_rows <- env$extract_hoc_results(repeated_payload, repeated_core$model, repeated_core$summary)
repeated_indicator_names <- vapply(repeated_hoc_rows, function(row) row$indicator, character(1))
stopifnot(setequal(repeated_indicator_names, c(paste0("PEOU_", 1:4), paste0("PU_", 1:4))))
stopifnot(all(vapply(repeated_hoc_rows, function(row) {
  expected_loc <- if (grepl("^PEOU_", row$indicator)) "PEOU" else "PU"
  identical(row$loc_construct, expected_loc)
}, logical(1))))
stopifnot(all(vapply(repeated_hoc_rows, function(row) is.finite(row$loading), logical(1))))
stopifnot(all(vapply(repeated_hoc_rows, function(row) is.finite(row$weight), logical(1))))
stopifnot(all(vapply(repeated_hoc_rows, function(row) is.finite(row$vif), logical(1))))

repeated_formative_payload <- formative_payload
repeated_formative_payload$algorithmSettings <- list(hocMethod = "Repeated indicators", hocTwoStage = "Embedded")
repeated_formative_core <- env$run_pls_core(repeated_formative_payload, data)
repeated_formative_network <- as.data.frame(repeated_formative_core$model$smMatrix, stringsAsFactors = FALSE)
stopifnot(any(repeated_formative_network$source == "PEOU" & repeated_formative_network$target == "HOC"))
stopifnot(any(repeated_formative_network$source == "PU" & repeated_formative_network$target == "HOC"))
stopifnot(any(repeated_formative_network$source == "HOC" & repeated_formative_network$target == "ATT"))
stopifnot(!any(repeated_formative_network$source == "HOC" & repeated_formative_network$target == "PEOU"))

embedded_hoc_rows <- env$extract_hoc_results(payload, core$model, core$summary)
stopifnot(all(vapply(embedded_hoc_rows, function(row) identical(row$indicator, row$loc_construct), logical(1))))

disjoint_payload <- payload
disjoint_payload$algorithmSettings <- list(hocMethod = "Two-stage", hocTwoStage = "Disjoint two-stage")
stopifnot(identical(env$run_pls_core(disjoint_payload, data)$hoc_method_label, "Disjoint Two-stage"))

normal_payload <- list(
  datasetPath = payload$datasetPath,
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
normal_core <- env$run_pls_core(normal_payload, data)
normal_sections <- env$extract_pls_sections(normal_payload, data, normal_core)
stopifnot(length(normal_sections$final_results$path_coefficients) == 3L)

normal_boot <- seminr::bootstrap_model(normal_core$model, nboot = 10L, cores = 1L)
normal_boot_summary <- summary(normal_boot, alpha = 0.10)
normal_boot_summary$bootstrapped_paths <- env$add_bias_corrected_intervals(
  normal_boot_summary$bootstrapped_paths,
  normal_boot$path_coef,
  normal_boot$boot_paths,
  alpha = 0.10
)
normal_boot_summary$bootstrapped_loadings <- env$add_bias_corrected_intervals(
  normal_boot_summary$bootstrapped_loadings,
  normal_boot$outer_loadings,
  normal_boot$boot_loadings,
  alpha = 0.10
)
normal_boot_summary$bootstrapped_weights <- env$add_bias_corrected_intervals(
  normal_boot_summary$bootstrapped_weights,
  normal_boot$outer_weights,
  normal_boot$boot_weights,
  alpha = 0.10
)
normal_boot_summary$bootstrapped_total_paths <- env$add_bias_corrected_intervals(
  normal_boot_summary$bootstrapped_total_paths,
  seminr:::total_effects(normal_boot$path_coef),
  normal_boot$boot_total_paths,
  alpha = 0.10
)
normal_boot_response <- env$assemble_bootstrap_response(
  normal_payload,
  data,
  normal_core,
  normal_boot,
  normal_boot_summary,
  10L,
  "90%",
  "standard",
  "Standard PLS",
  alpha = 0.10
)
stopifnot(isTRUE(normal_boot_response$success))
stopifnot(length(normal_boot_response$results$final_results$path_coefficients) > 0L)
stopifnot(length(normal_boot_response$results$final_results$total_effects) > 0L)

normal_predict <- seminr::predict_pls(normal_core$model, technique = seminr::predict_DA, noFolds = 2L, reps = 1L)
normal_predict_sections <- env$extract_plspredict_sections(normal_payload, data, normal_core, normal_predict, 2L, 1L)
stopifnot(length(normal_predict_sections$final_results$plspredict_mv_summary) > 0L)

repeated_prediction_core <- env$build_repeated_indicator_prediction_core(repeated_payload, repeated_core)
stopifnot(anyDuplicated(repeated_prediction_core$model$mmVariables) == 0L)
stopifnot(isTRUE(all.equal(
  repeated_core$model$path_coef,
  repeated_prediction_core$model$path_coef,
  tolerance = 1e-10,
  check.attributes = FALSE
)))
stopifnot(isTRUE(all.equal(
  repeated_core$model$construct_scores,
  repeated_prediction_core$model$construct_scores,
  tolerance = 1e-10,
  check.attributes = FALSE
)))
repeated_predict <- seminr::predict_pls(repeated_prediction_core$model, technique = seminr::predict_DA, noFolds = 2L, reps = 1L)
repeated_predict_sections <- env$extract_plspredict_sections(
  repeated_payload,
  data,
  repeated_core,
  repeated_predict,
  2L,
  1L,
  prediction_core = repeated_prediction_core
)
stopifnot(length(repeated_predict_sections$final_results$plspredict_mv_summary) > 0L)
stopifnot(!any(grepl(
  "^METIS_PRED_",
  vapply(repeated_predict_sections$final_results$plspredict_mv_summary, function(row) row$Indicator, character(1))
)))

repeated_formative_prediction_core <- env$build_repeated_indicator_prediction_core(
  repeated_formative_payload,
  repeated_formative_core
)
stopifnot(anyDuplicated(repeated_formative_prediction_core$model$mmVariables) == 0L)
stopifnot(isTRUE(all.equal(
  repeated_formative_core$model$path_coef,
  repeated_formative_prediction_core$model$path_coef,
  tolerance = 1e-10,
  check.attributes = FALSE
)))
stopifnot(isTRUE(all.equal(
  repeated_formative_core$model$construct_scores,
  repeated_formative_prediction_core$model$construct_scores,
  tolerance = 1e-10,
  check.attributes = FALSE
)))
repeated_formative_predict <- seminr::predict_pls(
  repeated_formative_prediction_core$model,
  technique = seminr::predict_DA,
  noFolds = 2L,
  reps = 1L
)
repeated_formative_predict_sections <- env$extract_plspredict_sections(
  repeated_formative_payload,
  data,
  repeated_formative_core,
  repeated_formative_predict,
  2L,
  1L,
  prediction_core = repeated_formative_prediction_core
)
stopifnot(length(repeated_formative_predict_sections$final_results$plspredict_mv_summary) > 0L)
stopifnot(!any(grepl(
  "^METIS_PRED_",
  vapply(repeated_formative_predict_sections$final_results$plspredict_mv_summary, function(row) row$Indicator, character(1))
)))

long_chain_nodes <- LETTERS[1:7]
long_chain_payload <- list(paths = lapply(seq_len(length(long_chain_nodes) - 1L), function(idx) {
  list(from = long_chain_nodes[[idx]], to = long_chain_nodes[[idx + 1L]])
}))
long_specific_paths <- env$embedded_specific_indirect_paths(long_chain_payload)
stopifnot(any(vapply(long_specific_paths, function(path_nodes) {
  identical(path_nodes, long_chain_nodes)
}, logical(1))))

boot <- env$run_embedded_hoc_bootstrap(payload, data, core, 2L, seed = 123L)
stopifnot(dim(boot$boot_paths)[3] == 2L)
stopifnot(dim(boot$boot_loadings)[3] == 2L)
stopifnot(!is.null(boot$boot_total_paths), dim(boot$boot_total_paths)[3] == 2L)
stopifnot(!is.null(boot$boot_total_indirect_paths), dim(boot$boot_total_indirect_paths)[3] == 2L)
bootstrap_response <- env$assemble_embedded_bootstrap_response(payload, data, core, boot, 2L, "90%", "standard", "Standard", alpha = 0.10)
stopifnot(isTRUE(bootstrap_response$success))
stopifnot(identical(bootstrap_response$results$algorithm$settings$hoc_method, "Embedded Two-stage"))
stopifnot(grepl("reran Stage 1 and Stage 2", bootstrap_response$results$algorithm$execution_log[[1]]$message, fixed = TRUE))

embedded_final <- bootstrap_response$results$final_results
stopifnot(length(embedded_final$total_effects) > 0L)
stopifnot(length(embedded_final$total_indirect_effects) > 0L)
stopifnot(length(embedded_final$specific_indirect_effects) > 0L)

required_bootstrap_fields <- c(
  "Original Est.", "Bootstrap Mean", "Bootstrap SD", "T Stat.",
  "5% CI", "95% CI", "Bootstrap P Val", "5% CI (BC)", "95% CI (BC)",
  "Significance"
)
all_bootstrap_rows <- c(
  embedded_final$path_coefficients,
  embedded_final$total_effects,
  embedded_final$total_indirect_effects,
  embedded_final$specific_indirect_effects,
  embedded_final$outer_loadings,
  embedded_final$outer_weights
)
stopifnot(length(all_bootstrap_rows) > 0L)
stopifnot(all(vapply(all_bootstrap_rows, function(row) all(required_bootstrap_fields %in% names(row)), logical(1))))
stopifnot(all(vapply(all_bootstrap_rows, function(row) !any(c("Std. Error", "2.5% CI", "97.5% CI") %in% names(row)), logical(1))))
stopifnot(all(vapply(all_bootstrap_rows, function(row) {
  expected <- if (row[["5% CI"]] > 0 || row[["95% CI"]] < 0) "Significant" else "Not significant"
  identical(row$Significance, expected)
}, logical(1))))

hoc_bi_path <- Filter(function(row) identical(row$row_name, "HOC -> BI"), embedded_final$path_coefficients)[[1]]
hoc_bi_values <- as.numeric(boot$boot_paths["HOC", "BI", ])
expected_sd <- stats::sd(hoc_bi_values)
expected_t <- as.numeric(boot$path_coef["HOC", "BI"]) / expected_sd
expected_p <- 2 * min(mean(hoc_bi_values <= 0), mean(hoc_bi_values > 0))
stopifnot(isTRUE(all.equal(hoc_bi_path[["Bootstrap SD"]], expected_sd)))
stopifnot(isTRUE(all.equal(hoc_bi_path[["T Stat."]], expected_t)))
stopifnot(isTRUE(all.equal(hoc_bi_path[["Bootstrap P Val"]], expected_p)))
stopifnot(any(vapply(embedded_final$specific_indirect_effects, function(row) {
  identical(row$path, "HOC -> ATT -> BI")
}, logical(1))))

cat("PASS embedded HOC runtime\n")
