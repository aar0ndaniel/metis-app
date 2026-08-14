Sys.setenv(METIS_ALLOWED_DATA_ROOTS = getwd(), METIS_ANALYSIS_CORES = "1")

exprs <- parse("r-api/plumber.R")
env <- new.env(parent = globalenv())
for (i in seq_len(length(exprs) - 2L)) eval(exprs[[i]], envir = env)

`%||%` <- function(x, y) if (is.null(x)) y else x

data <- env$read_dataset(file.path(getwd(), "sample dataset.csv"))
data$Group <- c(rep("A", 29L), rep("B", nrow(data) - 29L))
set.seed(900L)
for (index in 1:4) data[[paste0("CTRL_", index)]] <- stats::rnorm(nrow(data))

synthetic_paths <- matrix(
  0,
  nrow = 3L,
  ncol = 3L,
  dimnames = list(c("HOC", "LOC", "BI"), c("HOC", "LOC", "BI"))
)
synthetic_paths["HOC", "LOC"] <- 0.8
synthetic_paths["LOC", "BI"] <- 0.5
synthetic_payload <- list(paths = list(list(from = "LOC", to = "BI")))
masked_paths <- env$mga_nomological_path_matrix(synthetic_payload, synthetic_paths)
stopifnot(masked_paths["HOC", "LOC"] == 0)
stopifnot(masked_paths["LOC", "BI"] == 0.5)
stopifnot(seminr:::total_effects(masked_paths)["HOC", "BI"] == 0)
synthetic_boot_paths <- array(
  rep(synthetic_paths, 2L),
  dim = c(3L, 3L, 2L),
  dimnames = list(rownames(synthetic_paths), colnames(synthetic_paths), NULL)
)
masked_boot_totals <- env$mga_nomological_boot_derived_array(
  synthetic_payload,
  synthetic_boot_paths,
  seminr:::total_effects(masked_paths),
  seminr:::total_effects
)
stopifnot(all(masked_boot_totals["HOC", "BI", ] == 0))

original_get_cached_pls_core <- env$get_cached_pls_core
env$get_cached_pls_core <- function(...) stop("MGA group diagnostics must bypass the shared PLS cache", call. = FALSE)
on.exit({ env$get_cached_pls_core <- original_get_cached_pls_core }, add = TRUE)

make_payload <- function(method, two_stage) list(
  constructs = list(
    list(name = "PEOU", type = "Reflective", indicators = as.list(paste0("PEOU_", 1:4))),
    list(name = "PU", type = "Reflective", indicators = as.list(paste0("PU_", 1:4))),
    list(name = "HOC", is_higher_order = TRUE, higher_order_type = "Reflective", dimensions = list("PEOU", "PU")),
    list(name = "ATT", type = "Reflective", indicators = as.list(paste0("ATT_", 1:4))),
    list(name = "CTRL", type = "Reflective", indicators = as.list(paste0("CTRL_", 1:4))),
    list(name = "BI", type = "Reflective", indicators = as.list(paste0("BI_", 1:4)))
  ),
  paths = list(
    list(from = "HOC", to = "BI"),
    list(from = "ATT", to = "BI"),
    list(from = "CTRL", to = "BI"),
    list(from = "HOC*ATT", to = "BI"),
    list(from = "CTRL*HOC", to = "BI")
  ),
  interactions = list(
    list(iv = "HOC", moderator = "ATT", outcome = "BI"),
    list(iv = "CTRL", moderator = "HOC", outcome = "BI")
  ),
  algorithm = "standard",
  algorithmSettings = list(hocMethod = method, hocTwoStage = two_stage),
  groupingVariable = "Group",
  groupA = "A",
  groupB = "B",
  nboot = 2L,
  alpha = 0.10,
  seed = 123L,
  baseHocMethod = env$hoc_method_label(list(hocMethod = method, hocTwoStage = two_stage), TRUE)
)

assert_hoc_mga <- function(method, two_stage) {
  payload <- make_payload(method, two_stage)
  previous_run_pls_core <- env$run_pls_core
  previous_build_measurement <- env$build_measurement
  captured_cores <- list()
  captured_measurement_methods <- character(0)
  captured_measurement_specs <- list()
  env$run_pls_core <- function(current_payload, fit_data) {
    core <- previous_run_pls_core(current_payload, fit_data)
    captured_cores[[length(captured_cores) + 1L]] <<- core
    core
  }
  env$build_measurement <- function(
    constructs_payload,
    algorithm = "standard",
    interactions_payload = list(),
    hoc_method = "Two-stage"
  ) {
    captured_measurement_methods <<- c(captured_measurement_methods, as.character(hoc_method))
    specification <- previous_build_measurement(
      constructs_payload,
      algorithm = algorithm,
      interactions_payload = interactions_payload,
      hoc_method = hoc_method
    )
    captured_measurement_specs[[length(captured_measurement_specs) + 1L]] <<- specification
    specification
  }
  on.exit({
    env$run_pls_core <- previous_run_pls_core
    env$build_measurement <- previous_build_measurement
  }, add = TRUE)

  set.seed(payload$seed)
  result <- env$run_hoc_mga_bootstrap_tables(data, payload, cores = 1L)
  stopifnot(length(result$groupSpecific$groupA$final_results$path_coefficients) > 0L)
  stopifnot(length(result$groupSpecific$groupB$final_results$path_coefficients) > 0L)

  comparison_paths <- vapply(
    result$pathCoefficients$henselerPlsMga,
    function(row) as.character(row$path %||% ""),
    character(1)
  )
  stopifnot("HOC*ATT -> BI" %in% comparison_paths)
  stopifnot("CTRL*HOC -> BI" %in% comparison_paths)
  expected_comparison_paths <- vapply(
    payload$paths,
    function(path) sprintf("%s -> %s", path$from, path$to),
    character(1)
  )
  stopifnot(setequal(comparison_paths, expected_comparison_paths))

  for (family_name in c("pathCoefficients", "totalIndirectEffects", "totalEffects")) {
    family <- result[[family_name]]
    for (method_name in c("biasCorrectedConfidenceIntervals", "henselerPlsMga", "parametricTest", "welchTest")) {
      rows <- family[[method_name]]
      labels <- vapply(rows, function(row) as.character(row$path %||% ""), character(1))
      stopifnot(!("HOC -> PEOU" %in% labels))
      stopifnot(!("HOC -> PU" %in% labels))
    }
  }
  stopifnot(length(result$pathCoefficients$welchTest) == length(expected_comparison_paths))

  for (group_name in c("groupA", "groupB")) {
    rows <- result$groupSpecific[[group_name]]$final_results$path_coefficients
    labels <- vapply(rows, function(row) {
      label <- as.character(row$path %||% row$row_name %||% "")
      gsub("\\s*->\\s*", " -> ", trimws(label))
    }, character(1))
    required_labels <- c("HOC -> BI", "ATT -> BI", "CTRL -> BI", "HOC*ATT -> BI", "CTRL*HOC -> BI")
    missing_labels <- setdiff(required_labels, labels)
    if (length(missing_labels)) {
      stop(sprintf(
        "%s is missing path labels [%s]; returned labels were [%s].",
        group_name,
        paste(missing_labels, collapse = ", "),
        paste(labels, collapse = ", ")
      ))
    }
  }

  numbers <- vapply(result$descriptives, function(row) as.integer(row$Number), integer(1))
  stopifnot(29L %in% numbers, 35L %in% numbers)

  mapped <- env$map_mga_response(payload, data, result)
  messages <- vapply(mapped$execution_log, function(row) as.character(row$message), character(1))
  selected_method <- env$hoc_method_label(payload$algorithmSettings, TRUE)
  stopifnot(length(captured_cores) >= 2L)
  group_a_core <- captured_cores[[1L]]
  stopifnot(identical(as.character(group_a_core$hoc_method_label), selected_method))

  if (identical(selected_method, "Repeated Indicators")) {
    stopifnot("Repeated indicators" %in% captured_measurement_methods)
    hoc_specs <- Filter(
      function(spec) is.character(spec) && length(spec) >= 3L && identical(spec[[1L]], "HOC"),
      captured_measurement_specs[[1L]]
    )
    stopifnot(length(hoc_specs) == 1L)
    hoc_indicators <- as.character(hoc_specs[[1L]][seq.int(2L, length(hoc_specs[[1L]]), by = 3L)])
    stopifnot(all(c(paste0("PEOU_", 1:4), paste0("PU_", 1:4)) %in% hoc_indicators))
    stopifnot(is.finite(group_a_core$model$path_coef["HOC", "PEOU"]))
    stopifnot(is.finite(group_a_core$model$path_coef["HOC", "PU"]))
  }
  if (identical(selected_method, "Disjoint Two-stage")) {
    stopifnot("Two-stage" %in% captured_measurement_methods)
    stopifnot(!("Repeated indicators" %in% captured_measurement_methods))
    stopifnot(is.null(group_a_core$stage1_model))
  }
  if (identical(selected_method, "Embedded Two-stage")) {
    stopifnot("Repeated indicators" %in% captured_measurement_methods)
    stopifnot(!is.null(group_a_core$stage1_model))
    stopifnot(!is.null(group_a_core$stage2_payload))
  }

  stopifnot(any(grepl(sprintf("estimated independently using %s", selected_method), messages, fixed = TRUE)))
  if (identical(selected_method, "Embedded Two-stage")) {
    stopifnot(identical(as.character(mapped$meta$engine), "Metis Embedded two-stage bootstrap PLS-MGA"))
    stopifnot(any(grepl("reran Stage 1 and Stage 2 within every bootstrap resample", messages, fixed = TRUE)))
  } else {
    stopifnot(grepl(selected_method, mapped$meta$engine, fixed = TRUE))
  }
  invisible(result)
}

assert_hoc_mga("Repeated indicators", "Disjoint two-stage")
assert_hoc_mga("Two-stage", "Disjoint two-stage")

original_run_pls_core <- env$run_pls_core
captured_fit_rows <- integer(0)
env$run_pls_core <- function(payload, fit_data) {
  captured_fit_rows <<- c(captured_fit_rows, nrow(fit_data))
  original_run_pls_core(payload, fit_data)
}

assert_hoc_mga("Two-stage", "Embedded")
stopifnot(sum(captured_fit_rows == 29L) >= 3L)
stopifnot(sum(captured_fit_rows == 35L) >= 3L)
stopifnot(!any(captured_fit_rows == nrow(data)))

capture_error <- function(expr) {
  tryCatch({
    force(expr)
    ""
  }, error = function(err) conditionMessage(err))
}

env$run_pls_core <- function(payload, fit_data) {
  if (nrow(fit_data) == 35L) stop("synthetic fit failure", call. = FALSE)
  original_run_pls_core(payload, fit_data)
}
fit_error <- capture_error(env$run_hoc_mga_bootstrap_tables(
  data,
  make_payload("Repeated indicators", "Disjoint two-stage"),
  cores = 1L
))
stopifnot(grepl(
  "HOC MGA group B 'B' using Repeated Indicators failed during fit: synthetic fit failure",
  fit_error,
  fixed = TRUE
))

env$run_pls_core <- original_run_pls_core
original_embedded_bootstrap <- env$run_embedded_hoc_bootstrap
env$run_embedded_hoc_bootstrap <- function(...) stop("synthetic bootstrap failure", call. = FALSE)
bootstrap_error <- capture_error(env$run_hoc_mga_bootstrap_tables(
  data,
  make_payload("Two-stage", "Embedded"),
  cores = 1L
))
stopifnot(grepl(
  "HOC MGA group A 'A' using Embedded Two-stage failed during bootstrap: synthetic bootstrap failure",
  bootstrap_error,
  fixed = TRUE
))
env$run_embedded_hoc_bootstrap <- original_embedded_bootstrap

cat("PASS HOC MGA group-first runtime\n")
