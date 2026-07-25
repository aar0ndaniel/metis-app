# metis_micom v3
# Changes vs v2: ADDITIVE ONLY — adds a clear Step 2 permutation admissibility report
#   (out$admissibility data.frame: construct, requested, admissible, dropped, dropped_pct;
#    printed by print.metis_micom). Permutation/decision logic is byte-for-byte identical to v2.
#
# Changes vs v1 (robustness hardening, validated against cSEM::testMICOM):
#  (1) Deterministic sign alignment of composite scores (replaces abs(cor)),
#      removing the composite sign indeterminacy in both observed and
#      permutation c-values -> reproducible Step 2.
#  (2) Admissibility filtering of permutation re-estimations (mirrors cSEM
#      .handle_inadmissibles = "drop"): non-converged / non-finite / Heywood
#      group models are dropped from the permutation null.
#  (3) Step 3 two-tailed permutation p-values use strict inequality to match
#      cSEM exactly.
# Public signatures, return structures, and decision semantics are unchanged.

metis_micom <- function(
  model,
  data,
  group_var,
  group_a = NULL,
  group_b = NULL,
  permutations = 5000,
  alpha = 0.05,
  seed = 123,
  quick = FALSE,
  cores = 1L
) {
  .metis_require_seminr()
  permutations <- .metis_validate_positive_integer(permutations, "permutations")
  alpha <- .metis_validate_alpha(alpha)
  seed <- .metis_validate_seed(seed)
  cores <- .metis_validate_cores(cores)

  selection <- .metis_select_two_groups(data, group_var, group_a, group_b)
  step1 <- metis_micom_step1(model, selection$data, group_var, selection$group_a, selection$group_b)

  settings <- list(
    permutations = permutations,
    alpha = alpha,
    seed = seed,
    quick = isTRUE(quick),
    cores = cores
  )

  if (!.metis_step1_passed(step1)) {
    out <- list(
      method = "MICOM",
      groups = .metis_group_info(selection),
      settings = settings,
      step1 = step1,
      step2 = .metis_empty_step2(),
      step3 = .metis_empty_step3(),
      invariance = list(
        partial = FALSE,
        full = FALSE,
        message = "Configural invariance was not established. MICOM stopped before Step 2."
      )
    )
    class(out) <- c("metis_micom", class(out))
    return(out)
  }

  step2 <- metis_micom_step2(
    model = model,
    data = selection$data,
    group_var = group_var,
    group_a = selection$group_a,
    group_b = selection$group_b,
    permutations = permutations,
    alpha = alpha,
    seed = seed,
    quick = quick,
    cores = cores
  )

  partial <- all(step2$decision == "supported")
  if (partial) {
    step3 <- metis_micom_step3(
      model = model,
      data = selection$data,
      group_var = group_var,
      group_a = selection$group_a,
      group_b = selection$group_b,
      permutations = permutations,
      alpha = alpha,
      seed = seed,
      quick = quick,
      cores = cores
    )
    full <- all(step3$mean_decision == "supported" & step3$variance_decision == "supported")
  } else {
    step3 <- .metis_empty_step3()
    full <- FALSE
  }

  message <- if (full) {
    "Full measurement invariance was established because configural invariance, compositional invariance, and equality of composite means and variances were supported."
  } else if (partial) {
    "Partial measurement invariance was established because configural invariance and compositional invariance were supported. Path coefficient comparisons across groups may be interpreted."
  } else {
    "Compositional invariance was not established for one or more constructs. Group comparisons involving these constructs should not be interpreted strongly."
  }

  out <- list(
    method = "MICOM",
    groups = .metis_group_info(selection),
    settings = settings,
    step1 = step1,
    step2 = step2,
    step3 = step3,
    admissibility = attr(step2, "admissibility"),  # v3: Step 2 permutation admissibility report
    invariance = list(
      partial = partial,
      full = full,
      message = message
    )
  )
  class(out) <- c("metis_micom", class(out))
  out
}

metis_micom_step1 <- function(model, data, group_var, group_a = NULL, group_b = NULL) {
  .metis_require_model(model)
  selection <- .metis_select_two_groups(data, group_var, group_a, group_b)
  indicators <- .metis_model_indicators(model)
  construct_names <- .metis_construct_names(model)
  available_inputs <- .metis_micom_score_source_names(selection$data, model)
  missing_indicators <- setdiff(indicators, available_inputs)

  rows <- list(
    .metis_step1_row("same model object", TRUE, "The same fitted seminr model object is rerun for both selected groups."),
    .metis_step1_row(
      "group selection",
      selection$n_a >= 2L && selection$n_b >= 2L,
      sprintf("Selected groups are %s (n = %d) and %s (n = %d).", selection$group_a, selection$n_a, selection$group_b, selection$n_b)
    ),
    .metis_step1_row(
      "identical indicators",
      length(missing_indicators) == 0L,
      if (length(missing_indicators)) {
        sprintf("Missing model indicator or HOC score input(s): %s.", paste(missing_indicators, collapse = ", "))
      } else {
        sprintf("Model indicators and HOC score inputs checked: %d.", length(indicators))
      }
    ),
    .metis_step1_row(
      "construct specification",
      length(construct_names) > 0L,
      sprintf("Constructs checked: %s.", paste(construct_names, collapse = ", "))
    ),
    .metis_step1_row("algorithm settings", !is.null(model$settings), "The seminr model settings object is reused through seminr::rerun()."),
    .metis_step1_row("data treatment", TRUE, "Coding, missing-value handling, and scaling must match the original model setup; METIS reuses the supplied data and model.")
  )

  do.call(rbind, rows)
}

metis_micom_step2 <- function(
  model,
  data,
  group_var,
  group_a = NULL,
  group_b = NULL,
  permutations = 5000,
  alpha = 0.05,
  seed = 123,
  quick = FALSE,
  cores = 1L
) {
  .metis_require_seminr()
  .metis_require_model(model)
  permutations <- .metis_validate_positive_integer(permutations, "permutations")
  alpha <- .metis_validate_alpha(alpha)
  seed <- .metis_validate_seed(seed)
  cores <- .metis_validate_cores(cores)
  selection <- .metis_select_two_groups(data, group_var, group_a, group_b)
  constructs <- .metis_construct_names(model)
  indicators_by_construct <- .metis_indicators_by_construct(model, constructs)
  pooled_model <- seminr::rerun(model, data = selection$data)
  score_source <- .metis_micom_score_source_data(selection$data, pooled_model)

  if (isTRUE(quick)) {
    message("quick = TRUE does not skip MICOM permutation logic; use a smaller permutations value for exploratory runs.")
  }

  set.seed(seed)

  group_model_a <- seminr::rerun(pooled_model, data = selection$data[selection$condition, , drop = FALSE])
  group_model_b <- seminr::rerun(pooled_model, data = selection$data[!selection$condition, , drop = FALSE])
  observed <- .metis_micom_c_values(
    data = score_source,
    constructs = constructs,
    indicators_by_construct = indicators_by_construct,
    weights_a = group_model_a$outer_weights,
    weights_b = group_model_b$outer_weights
  )

  permutation_conditions <- lapply(seq_len(permutations), function(i) {
    .metis_permute_condition(length(selection$condition), selection$n_a)
  })

  permutation_list <- .metis_micom_parallel_lapply(seq_len(permutations), function(i) {
    perm_condition <- permutation_conditions[[i]]
    tryCatch({
      perm_model_a <- seminr::rerun(pooled_model, data = selection$data[perm_condition, , drop = FALSE])
      perm_model_b <- seminr::rerun(pooled_model, data = selection$data[!perm_condition, , drop = FALSE])
      # v2: drop inadmissible permutation re-estimations (cf. cSEM drop policy)
      if (!.metis_is_admissible(perm_model_a) || !.metis_is_admissible(perm_model_b)) {
        rep(NA_real_, length(constructs))
      } else {
        .metis_micom_c_values(
          data = score_source,
          constructs = constructs,
          indicators_by_construct = indicators_by_construct,
          weights_a = perm_model_a$outer_weights,
          weights_b = perm_model_b$outer_weights
        )
      }
    }, error = function(err) {
      rep(NA_real_, length(constructs))
    })
  }, cores = cores, export = .metis_micom_worker_exports(), packages = "seminr")

  permutation_values <- do.call(rbind, permutation_list)
  if (is.null(dim(permutation_values))) {
    permutation_values <- matrix(permutation_values, ncol = length(constructs))
  }
  colnames(permutation_values) <- constructs

  rows <- lapply(constructs, function(construct) {
    permuted <- permutation_values[, construct]
    ci <- .metis_ci(permuted, c(alpha, 1 - alpha))
    p_value <- .metis_p_value_lower_tail(observed[[construct]], permuted)
    data.frame(
      construct = construct,
      c_value = observed[[construct]],
      ci_lower = ci[[1]],
      ci_upper = ci[[2]],
      p_value = p_value,
      decision = if (!is.na(observed[[construct]]) && !is.na(ci[[1]]) && observed[[construct]] >= ci[[1]]) "supported" else "not supported",
      stringsAsFactors = FALSE
    )
  })

  out <- do.call(rbind, rows)
  rownames(out) <- NULL
  admissible <- colSums(!is.na(permutation_values))
  attr(out, "permutation_values") <- as.data.frame(permutation_values, stringsAsFactors = FALSE)
  attr(out, "admissible_permutations") <- admissible
  # v3: explicit per-construct admissibility report for the Step 2 permutation null
  attr(out, "admissibility") <- data.frame(
    construct = constructs,
    requested = permutations,
    admissible = as.integer(admissible[constructs]),
    dropped = as.integer(permutations - admissible[constructs]),
    dropped_pct = round(100 * (permutations - admissible[constructs]) / permutations, 2),
    stringsAsFactors = FALSE
  )
  out
}

metis_micom_step3 <- function(
  model,
  data,
  group_var,
  group_a = NULL,
  group_b = NULL,
  permutations = 5000,
  alpha = 0.05,
  seed = 123,
  quick = FALSE,
  cores = 1L
) {
  .metis_require_seminr()
  .metis_require_model(model)
  permutations <- .metis_validate_positive_integer(permutations, "permutations")
  alpha <- .metis_validate_alpha(alpha)
  seed <- .metis_validate_seed(seed)
  cores <- .metis_validate_cores(cores)
  selection <- .metis_select_two_groups(data, group_var, group_a, group_b)

  if (isTRUE(quick)) {
    message("quick = TRUE does not skip MICOM permutation logic; use a smaller permutations value for exploratory runs.")
  }

  set.seed(seed)

  pooled_model <- seminr::rerun(model, data = selection$data)
  scores <- .metis_extract_construct_scores(pooled_model)
  if (nrow(scores) != nrow(selection$data)) {
    stop("Construct score row count does not match the selected two-group data.")
  }

  constructs <- colnames(scores)
  observed_mean <- .metis_group_mean_diffs(scores, selection$condition)
  observed_var <- .metis_group_log_variance_diffs(scores, selection$condition)

  permutation_conditions <- lapply(seq_len(permutations), function(i) {
    .metis_permute_condition(length(selection$condition), selection$n_a)
  })

  permutation_rows <- .metis_micom_parallel_lapply(seq_len(permutations), function(i) {
    perm_condition <- permutation_conditions[[i]]
    list(
      mean = .metis_group_mean_diffs(scores, perm_condition),
      variance = .metis_group_log_variance_diffs(scores, perm_condition)
    )
  }, cores = cores, export = c(".metis_group_mean_diffs", ".metis_group_log_variance_diffs"))

  perm_mean <- do.call(rbind, lapply(permutation_rows, `[[`, "mean"))
  perm_var <- do.call(rbind, lapply(permutation_rows, `[[`, "variance"))
  if (is.null(dim(perm_mean))) perm_mean <- matrix(perm_mean, ncol = length(constructs))
  if (is.null(dim(perm_var))) perm_var <- matrix(perm_var, ncol = length(constructs))
  colnames(perm_mean) <- constructs
  colnames(perm_var) <- constructs

  rows <- lapply(constructs, function(construct) {
    mean_ci <- .metis_ci(perm_mean[, construct], c(alpha / 2, 1 - alpha / 2))
    var_ci <- .metis_ci(perm_var[, construct], c(alpha / 2, 1 - alpha / 2))
    mean_p <- .metis_p_value_two_tailed(observed_mean[[construct]], perm_mean[, construct])
    var_p <- .metis_p_value_two_tailed(observed_var[[construct]], perm_var[, construct])
    data.frame(
      construct = construct,
      mean_diff = observed_mean[[construct]],
      mean_ci_lower = mean_ci[[1]],
      mean_ci_upper = mean_ci[[2]],
      mean_p_value = mean_p,
      mean_decision = if (!is.na(mean_p) && mean_p > alpha) "supported" else "not supported",
      variance_diff = observed_var[[construct]],
      variance_ci_lower = var_ci[[1]],
      variance_ci_upper = var_ci[[2]],
      variance_p_value = var_p,
      variance_decision = if (!is.na(var_p) && var_p > alpha) "supported" else "not supported",
      stringsAsFactors = FALSE
    )
  })

  out <- do.call(rbind, rows)
  rownames(out) <- NULL
  attr(out, "mean_permutation_values") <- as.data.frame(perm_mean, stringsAsFactors = FALSE)
  attr(out, "variance_permutation_values") <- as.data.frame(perm_var, stringsAsFactors = FALSE)
  out
}

print.metis_micom <- function(x, ...) {
  cat("MICOM\n")
  cat("Groups:", x$groups$group_var, "=", x$groups$group_a, "vs", x$groups$group_b, "\n")
  cat("Permutations:", x$settings$permutations, " Alpha:", x$settings$alpha, " Seed:", x$settings$seed, "\n\n")
  cat("Step 1 - Configural Invariance\n")
  print(x$step1, row.names = FALSE)
  if (nrow(x$step2)) {
    cat("\nStep 2 - Compositional Invariance\n")
    print(x$step2, row.names = FALSE)
    adm <- x$admissibility
    if (!is.null(adm) && nrow(adm)) {
      cat("\nStep 2 - Permutation admissibility (inadmissible group re-estimations dropped from the null)\n")
      print(adm, row.names = FALSE)
      total_req <- adm$requested[[1]]
      cat(sprintf("Across constructs: %d requested; dropped %d-%d (%.1f%%-%.1f%%) as inadmissible.\n",
                  total_req, min(adm$dropped), max(adm$dropped),
                  min(adm$dropped_pct), max(adm$dropped_pct)))
      cat("(Step 3 permutes fixed pooled-model scores without re-estimation, so no runs are dropped there.)\n")
    }
  }
  if (nrow(x$step3)) {
    cat("\nStep 3 - Equality of Means and Variances\n")
    print(x$step3, row.names = FALSE)
  }
  cat("\nInterpretation\n")
  cat(x$invariance$message, "\n")
  invisible(x)
}

.metis_require_seminr <- function() {
  if (!requireNamespace("seminr", quietly = TRUE)) {
    stop("Package 'seminr' is required for METIS MICOM.")
  }
}

.metis_require_model <- function(model) {
  if (!is.list(model)) {
    stop("model must be a fitted seminr model object.")
  }
  required <- c("outer_weights", "construct_scores", "path_coef")
  missing <- required[vapply(required, function(name) is.null(model[[name]]), logical(1))]
  if (length(missing)) {
    stop(sprintf("model is missing required seminr fields: %s.", paste(missing, collapse = ", ")))
  }
  invisible(TRUE)
}

.metis_validate_positive_integer <- function(value, name) {
  value <- suppressWarnings(as.integer(value))
  if (is.na(value) || value < 1L) {
    stop(sprintf("%s must be a positive integer.", name))
  }
  value
}

.metis_validate_alpha <- function(alpha) {
  alpha <- suppressWarnings(as.numeric(alpha))
  if (is.na(alpha) || alpha <= 0 || alpha >= 1) {
    stop("alpha must be a number greater than 0 and less than 1.")
  }
  alpha
}

.metis_validate_seed <- function(seed) {
  seed <- suppressWarnings(as.integer(seed))
  if (is.na(seed)) {
    stop("seed must be an integer.")
  }
  seed
}

.metis_validate_cores <- function(cores) {
  cores <- suppressWarnings(as.integer(cores))
  if (is.na(cores) || cores < 1L) return(1L)
  cores
}

.metis_micom_worker_exports <- function() {
  c(
    ".metis_micom_c_values",
    ".metis_is_admissible",
    ".metis_scaled_indicator_matrix",
    ".metis_aligned_score",
    ".metis_signed_correlation",
    ".metis_group_mean_diffs",
    ".metis_group_log_variance_diffs"
  )
}

.metis_micom_parallel_lapply <- function(x, fun, cores = 1L, export = character(), packages = character()) {
  cores <- .metis_validate_cores(cores)
  if (cores <= 1L || length(x) <= 1L) return(lapply(x, fun))

  worker_count <- min(cores, length(x))
  cluster <- parallel::makeCluster(worker_count, type = "PSOCK")
  on.exit(parallel::stopCluster(cluster), add = TRUE)

  if (length(packages)) {
    parallel::clusterCall(cluster, function(pkgs) {
      for (pkg in pkgs) {
        if (!requireNamespace(pkg, quietly = TRUE)) {
          stop(sprintf("Required package '%s' is not available on MICOM worker.", pkg))
        }
      }
      invisible(TRUE)
    }, unique(packages))
  }

  export <- unique(export)
  if (length(export)) {
    parallel::clusterExport(cluster, varlist = export, envir = globalenv())
  }

  parallel::parLapply(cluster, x, fun)
}

.metis_select_two_groups <- function(data, group_var, group_a = NULL, group_b = NULL) {
  data <- as.data.frame(data)
  group_var <- as.character(group_var)
  if (length(group_var) != 1L || !nzchar(group_var)) {
    stop("group_var must be a single column name.")
  }
  if (!group_var %in% names(data)) {
    stop(sprintf("group_var '%s' was not found in data.", group_var))
  }

  labels <- as.character(data[[group_var]])
  available <- unique(labels[!is.na(labels) & nzchar(labels)])
  if (length(available) < 2L) {
    stop("group_var must contain at least two non-missing groups.")
  }

  if (is.null(group_a) && is.null(group_b)) {
    if (length(available) > 2L) {
      stop("group_a and group_b are required when group_var has more than two groups.")
    }
    group_a <- available[[1]]
    group_b <- available[[2]]
  } else if (is.null(group_a) || is.null(group_b)) {
    stop("group_a and group_b must be supplied together.")
  }

  group_a <- as.character(group_a)
  group_b <- as.character(group_b)
  if (identical(group_a, group_b)) {
    stop("group_a and group_b must be different.")
  }
  if (!group_a %in% available) {
    stop(sprintf("group_a '%s' was not found in group_var.", group_a))
  }
  if (!group_b %in% available) {
    stop(sprintf("group_b '%s' was not found in group_var.", group_b))
  }

  keep <- labels %in% c(group_a, group_b)
  selected <- data[keep, , drop = FALSE]
  selected_labels <- labels[keep]
  condition <- selected_labels == group_a
  n_a <- sum(condition)
  n_b <- sum(!condition)
  if (n_a < 2L || n_b < 2L) {
    stop("Both selected groups must contain at least two observations.")
  }

  list(
    data = selected,
    condition = condition,
    group_var = group_var,
    group_a = group_a,
    group_b = group_b,
    n_a = n_a,
    n_b = n_b
  )
}

.metis_group_info <- function(selection) {
  list(group_var = selection$group_var, group_a = selection$group_a, group_b = selection$group_b)
}

.metis_step1_row <- function(check, passed, note) {
  data.frame(
    check = check,
    status = if (isTRUE(passed)) "passed" else "failed",
    note = note,
    stringsAsFactors = FALSE
  )
}

.metis_step1_passed <- function(step1) {
  is.data.frame(step1) && nrow(step1) > 0L && all(step1$status == "passed")
}

.metis_construct_names <- function(model) {
  if (!is.null(colnames(model$outer_weights))) return(colnames(model$outer_weights))
  if (!is.null(colnames(model$construct_scores))) return(colnames(model$construct_scores))
  if (!is.null(colnames(model$path_coef))) return(colnames(model$path_coef))
  stop("Could not determine construct names from the seminr model.")
}

.metis_model_indicators <- function(model) {
  indicators <- rownames(model$outer_weights)
  if (is.null(indicators) || !length(indicators)) {
    stop("Could not determine indicator names from model$outer_weights.")
  }
  indicators
}

.metis_micom_score_source_data <- function(data, model) {
  source <- as.data.frame(data, stringsAsFactors = FALSE, check.names = FALSE)
  scores <- model$construct_scores
  if (is.null(scores)) return(source)

  score_df <- as.data.frame(scores, stringsAsFactors = FALSE, check.names = FALSE)
  if (!nrow(score_df) || nrow(score_df) != nrow(source)) return(source)

  for (name in names(score_df)) {
    if (!nzchar(name)) next
    source[[name]] <- score_df[[name]]
  }

  source
}

.metis_micom_score_source_names <- function(data, model) {
  source_names <- names(as.data.frame(data, stringsAsFactors = FALSE, check.names = FALSE))
  scores <- model$construct_scores
  if (is.null(scores)) return(source_names)

  score_df <- as.data.frame(scores, stringsAsFactors = FALSE, check.names = FALSE)
  score_names <- names(score_df)
  score_names <- score_names[nzchar(score_names)]

  unique(c(source_names, score_names))
}

.metis_indicators_by_construct <- function(model, constructs) {
  stats::setNames(lapply(constructs, function(construct) {
    weights <- model$outer_weights[, construct]
    indicators <- names(weights)[!is.na(weights) & weights != 0]
    if (!length(indicators) && !is.null(model$outer_loadings)) {
      loadings <- model$outer_loadings[, construct]
      indicators <- names(loadings)[!is.na(loadings) & loadings != 0]
    }
    if (!length(indicators)) {
      stop(sprintf("Could not determine indicators for construct '%s'.", construct))
    }
    indicators
  }), constructs)
}

.metis_scaled_indicator_matrix <- function(data, indicators) {
  data <- as.data.frame(data)
  missing <- setdiff(indicators, names(data))
  if (length(missing)) {
    stop(sprintf("Data is missing model indicators: %s.", paste(missing, collapse = ", ")))
  }

  x <- data[, indicators, drop = FALSE]
  mat <- matrix(NA_real_, nrow = nrow(x), ncol = ncol(x))
  colnames(mat) <- indicators

  for (i in seq_along(indicators)) {
    values <- x[[i]]
    if (!is.numeric(values)) {
      values <- suppressWarnings(as.numeric(as.character(values)))
    }
    if (all(is.na(values))) {
      stop(sprintf("Indicator '%s' has no numeric values.", indicators[[i]]))
    }
    center <- mean(values, na.rm = TRUE)
    values[is.na(values)] <- center
    spread <- stats::sd(values)
    if (is.na(spread) || spread == 0) spread <- 1
    mat[, i] <- (values - center) / spread
  }

  mat
}

.metis_micom_c_values <- function(data, constructs, indicators_by_construct, weights_a, weights_b) {
  vapply(constructs, function(construct) {
    indicators <- indicators_by_construct[[construct]]
    x <- .metis_scaled_indicator_matrix(data, indicators)  # shared pooled scaled X
    ref <- rowMeans(x)                                     # deterministic sign reference
    scores_a <- .metis_aligned_score(x, weights_a, indicators, construct, ref)
    scores_b <- .metis_aligned_score(x, weights_b, indicators, construct, ref)
    .metis_signed_correlation(scores_a, scores_b)
  }, numeric(1))
}

# v2: composite score with deterministic sign alignment to a group-independent
# reference, removing the composite sign indeterminacy before correlation.
.metis_aligned_score <- function(x, weights, indicators, construct, ref) {
  if (is.null(weights) || is.null(rownames(weights)) || is.null(colnames(weights))) {
    stop("seminr outer_weights must have indicator and construct dimnames.")
  }
  if (!construct %in% colnames(weights)) {
    stop(sprintf("Weights are missing construct '%s'.", construct))
  }
  if (length(setdiff(indicators, rownames(weights)))) {
    stop(sprintf("Weights are missing indicators for construct '%s'.", construct))
  }
  weight_vector <- weights[indicators, construct]
  if (all(is.na(weight_vector)) || sum(abs(weight_vector), na.rm = TRUE) == 0) {
    stop(sprintf("Construct '%s' has no usable outer weights.", construct))
  }
  score <- as.numeric(x %*% weight_vector)
  r <- suppressWarnings(stats::cor(score, ref))
  if (!is.na(r) && r < 0) score <- -score
  score
}

.metis_signed_correlation <- function(x, y) {
  if (length(x) != length(y) || length(x) < 2L) return(NA_real_)
  x_sd <- stats::sd(x); y_sd <- stats::sd(y)
  if (is.na(x_sd) || is.na(y_sd) || x_sd == 0 || y_sd == 0) return(NA_real_)
  suppressWarnings(stats::cor(x, y, use = "complete.obs"))
}

# v2: admissibility check for a re-estimated seminr group model, mirroring the
# spirit of cSEM::verify() (convergence, finite + non-Heywood estimates).
.metis_is_admissible <- function(model) {
  if (is.null(model) || !is.list(model)) return(FALSE)
  w <- model$outer_weights
  if (is.null(w) || any(!is.finite(w))) return(FALSE)
  l <- model$outer_loadings
  if (!is.null(l)) {
    if (any(!is.finite(l))) return(FALSE)
    if (any(abs(l) > 1 + 1e-6, na.rm = TRUE)) return(FALSE)  # Heywood case
  }
  it <- model$iterations; mx <- model$settings$maxIt
  if (length(it) && length(mx) && !is.na(it) && !is.na(mx) && it >= mx) return(FALSE)  # not converged
  cs <- model$construct_scores
  if (is.null(cs) || any(!is.finite(cs))) return(FALSE)
  if (any(apply(as.matrix(cs), 2, stats::sd) == 0)) return(FALSE)
  TRUE
}

.metis_scores_from_weights <- function(data, indicators, weights, construct) {
  if (is.null(weights) || is.null(rownames(weights)) || is.null(colnames(weights))) {
    stop("seminr outer_weights must have indicator and construct dimnames.")
  }
  if (!construct %in% colnames(weights)) {
    stop(sprintf("Weights are missing construct '%s'.", construct))
  }
  missing_indicators <- setdiff(indicators, rownames(weights))
  if (length(missing_indicators)) {
    stop(sprintf("Weights are missing indicators for construct '%s'.", construct))
  }
  x <- .metis_scaled_indicator_matrix(data, indicators)
  weight_vector <- weights[indicators, construct]
  if (all(is.na(weight_vector)) || sum(abs(weight_vector), na.rm = TRUE) == 0) {
    stop(sprintf("Construct '%s' has no usable outer weights.", construct))
  }
  as.numeric(x %*% weight_vector)
}

.metis_abs_correlation <- function(x, y) {
  if (length(x) != length(y) || length(x) < 2L) return(NA_real_)
  x_sd <- stats::sd(x)
  y_sd <- stats::sd(y)
  if (is.na(x_sd) || is.na(y_sd) || x_sd == 0 || y_sd == 0) return(NA_real_)
  abs(suppressWarnings(stats::cor(x, y, use = "complete.obs")))
}

.metis_permute_condition <- function(n, n_a) {
  condition <- rep(FALSE, n)
  condition[sample.int(n, size = n_a, replace = FALSE)] <- TRUE
  condition
}

.metis_extract_construct_scores <- function(model) {
  scores <- as.matrix(model$construct_scores)
  if (is.null(colnames(scores))) {
    colnames(scores) <- .metis_construct_names(model)
  }
  scores
}

.metis_group_mean_diffs <- function(scores, condition) {
  out <- vapply(seq_len(ncol(scores)), function(i) {
    mean(scores[condition, i], na.rm = TRUE) - mean(scores[!condition, i], na.rm = TRUE)
  }, numeric(1), USE.NAMES = FALSE)
  stats::setNames(out, colnames(scores))
}

.metis_group_log_variance_diffs <- function(scores, condition) {
  out <- vapply(seq_len(ncol(scores)), function(i) {
    var_a <- stats::var(scores[condition, i], na.rm = TRUE)
    var_b <- stats::var(scores[!condition, i], na.rm = TRUE)
    if (is.na(var_a) || is.na(var_b) || var_a <= 0 || var_b <= 0) return(NA_real_)
    log(var_a / var_b)
  }, numeric(1), USE.NAMES = FALSE)
  stats::setNames(out, colnames(scores))
}

.metis_ci <- function(values, probs) {
  values <- values[!is.na(values)]
  if (!length(values)) return(c(NA_real_, NA_real_))
  as.numeric(stats::quantile(values, probs = probs, na.rm = TRUE, names = FALSE, type = 7))
}

.metis_p_value_lower_tail <- function(observed, values) {
  values <- values[!is.na(values)]
  if (is.na(observed) || !length(values)) return(NA_real_)
  mean(values <= observed)
}

.metis_p_value_two_tailed <- function(observed, values) {
  values <- values[!is.na(values)]
  if (is.na(observed) || !length(values)) return(NA_real_)
  # v2: strict two-tailed, matching cSEM (mean(perm > |obs|) + mean(perm < -|obs|))
  mean(abs(values) > abs(observed))
}

.metis_empty_step2 <- function() {
  data.frame(
    construct = character(),
    c_value = numeric(),
    ci_lower = numeric(),
    ci_upper = numeric(),
    p_value = numeric(),
    decision = character(),
    stringsAsFactors = FALSE
  )
}

.metis_empty_step3 <- function() {
  data.frame(
    construct = character(),
    mean_diff = numeric(),
    mean_ci_lower = numeric(),
    mean_ci_upper = numeric(),
    mean_p_value = numeric(),
    mean_decision = character(),
    variance_diff = numeric(),
    variance_ci_lower = numeric(),
    variance_ci_upper = numeric(),
    variance_p_value = numeric(),
    variance_decision = character(),
    stringsAsFactors = FALSE
  )
}
