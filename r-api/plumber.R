suppressPackageStartupMessages(library(plumber))

host <- Sys.getenv("METIS_PLUMBER_HOST", "127.0.0.1")
port <- as.integer(Sys.getenv("METIS_PLUMBER_PORT", "8765"))
metis_token <- Sys.getenv("METIS_PLUMBER_TOKEN", "")
trusted_metis_dataset_roots_raw <- Sys.getenv("METIS_ALLOWED_DATA_ROOTS", "")
micom_script_path <- Sys.getenv("METIS_MICOM_R_PATH", "")
max_dataset_bytes <- suppressWarnings(as.numeric(Sys.getenv("METIS_MAX_DATASET_BYTES", "209715200")))
max_dataset_rows <- suppressWarnings(as.integer(Sys.getenv("METIS_MAX_DATASET_ROWS", "100000")))
max_dataset_cols <- suppressWarnings(as.integer(Sys.getenv("METIS_MAX_DATASET_COLS", "500")))
max_constructs <- suppressWarnings(as.integer(Sys.getenv("METIS_MAX_CONSTRUCTS", "200")))
max_paths <- suppressWarnings(as.integer(Sys.getenv("METIS_MAX_PATHS", "1000")))
max_interactions <- suppressWarnings(as.integer(Sys.getenv("METIS_MAX_INTERACTIONS", "200")))
max_indicators_per_construct <- suppressWarnings(as.integer(Sys.getenv("METIS_MAX_INDICATORS_PER_CONSTRUCT", "200")))
max_bootstrap_samples <- suppressWarnings(as.integer(Sys.getenv("METIS_MAX_BOOTSTRAP_SAMPLES", "")))
max_nca_run_depth <- suppressWarnings(as.integer(Sys.getenv("METIS_MAX_NCA_RUN_DEPTH", "")))
max_predict_folds <- suppressWarnings(as.integer(Sys.getenv("METIS_MAX_PREDICT_FOLDS", "20")))
max_predict_repetitions <- suppressWarnings(as.integer(Sys.getenv("METIS_MAX_PREDICT_REPETITIONS", "50")))
max_cvpat_bootstrap_samples <- suppressWarnings(as.integer(Sys.getenv("METIS_MAX_CVPAT_BOOTSTRAP_SAMPLES", "2000")))
max_analysis_cores <- suppressWarnings(as.integer(Sys.getenv("METIS_ANALYSIS_CORES", "")))
max_cached_pls_cores <- suppressWarnings(as.integer(Sys.getenv("METIS_MAX_PLS_CORE_CACHE_ENTRIES", "2")))
 
 read_timeout_seconds <- function(env_name, default_value) {
   value <- suppressWarnings(as.numeric(Sys.getenv(env_name, as.character(default_value))))
   if (is.na(value) || value < 1) default_value else value
 }
 
 analysis_timeout_seconds <- read_timeout_seconds("METIS_ANALYSIS_TIMEOUT_SECONDS", 300)
 bootstrap_timeout_seconds <- read_timeout_seconds("METIS_BOOTSTRAP_TIMEOUT_SECONDS", max(analysis_timeout_seconds, 1800))
 plspredict_timeout_seconds <- read_timeout_seconds("METIS_PLSPREDICT_TIMEOUT_SECONDS", max(analysis_timeout_seconds, 1200))
 advanced_analysis_timeout_seconds <- read_timeout_seconds("METIS_ADVANCED_ANALYSIS_TIMEOUT_SECONDS", max(analysis_timeout_seconds, 1200))
 permutation_analysis_timeout_seconds <- read_timeout_seconds("METIS_PERMUTATION_ANALYSIS_TIMEOUT_SECONDS", max(analysis_timeout_seconds, 1800))
 multi_group_analysis_timeout_seconds <- read_timeout_seconds("METIS_MULTI_GROUP_ANALYSIS_TIMEOUT_SECONDS", max(bootstrap_timeout_seconds, 1800))
 
 if (is.na(max_dataset_bytes) || max_dataset_bytes <= 0) max_dataset_bytes <- 209715200
 if (is.na(max_dataset_rows) || max_dataset_rows < 1L) max_dataset_rows <- 100000L
 if (is.na(max_dataset_cols) || max_dataset_cols < 1L) max_dataset_cols <- 500L
 if (is.na(max_constructs) || max_constructs < 1L) max_constructs <- 200L
 if (is.na(max_paths) || max_paths < 1L) max_paths <- 1000L
 if (is.na(max_interactions) || max_interactions < 0L) max_interactions <- 200L
 if (is.na(max_indicators_per_construct) || max_indicators_per_construct < 1L) max_indicators_per_construct <- 200L
 if (!is.na(max_bootstrap_samples) && max_bootstrap_samples < 50L) max_bootstrap_samples <- NA_integer_
 if (!is.na(max_nca_run_depth) && max_nca_run_depth < 10L) max_nca_run_depth <- NA_integer_
 if (is.na(max_predict_folds) || max_predict_folds < 2L) max_predict_folds <- 20L
 if (is.na(max_predict_repetitions) || max_predict_repetitions < 1L) max_predict_repetitions <- 50L
 if (is.na(max_cvpat_bootstrap_samples) || max_cvpat_bootstrap_samples < 50L) max_cvpat_bootstrap_samples <- 2000L
 if (is.na(max_cached_pls_cores) || max_cached_pls_cores < 0L) max_cached_pls_cores <- 16L

# Redefine fSquared in the seminr namespace safely to avoid subscript out of bounds errors
# during summary calculation for models with interaction terms when main effects are missing/removed.
if (requireNamespace("seminr", quietly = TRUE)) {
  orig_fSquared <- seminr::fSquared
  safe_fSquared <- function(seminr_model, iv, dv) {
    tryCatch({
      orig_fSquared(seminr_model, iv, dv)
    }, error = function(e) {
      NA_real_
    })
  }
  utils::assignInNamespace("fSquared", safe_fSquared, "seminr")
}

pr <- plumber$new()

`%||%` <- function(x, y) if (is.null(x)) y else x

ensure_micom_loaded <- function() {
  if (exists("metis_micom", mode = "function", inherits = TRUE)) {
    return(invisible(TRUE))
  }

  if (nzchar(micom_script_path) && file.exists(micom_script_path)) {
    source(micom_script_path, local = globalenv())
  }

  if (!exists("metis_micom", mode = "function", inherits = TRUE)) {
    fallback_paths <- unique(c(
      file.path(getwd(), "r-api", "micom.R"),
      file.path(getwd(), "..", "micom.R")
    ))
    fallback_paths <- fallback_paths[file.exists(fallback_paths)]
    if (length(fallback_paths)) {
      source(fallback_paths[[1]], local = globalenv())
    }
  }

  if (!exists("metis_micom", mode = "function", inherits = TRUE)) {
    stop("MICOM backend is unavailable because micom.R could not be loaded.")
  }

  invisible(TRUE)
}

new_timing_collector <- function(operation) {
  timings <- new.env(parent = emptyenv())
  timings$operation <- operation
  timings$started_elapsed <- proc.time()[["elapsed"]]
  timings$started_at <- format(Sys.time(), "%Y-%m-%dT%H:%M:%OS3%z")
  timings$items <- list()
  timings$finished <- FALSE
  timings
}

record_timing <- function(timings, phase, seconds, details = list()) {
  if (is.null(timings)) return(invisible(NULL))
  entry <- list(
    phase = phase,
    seconds = round(as.numeric(seconds), 3)
  )
  if (length(details)) entry$details <- details
  timings$items[[length(timings$items) + 1L]] <- entry
  detail_text <- format_timing_details(details)
  message(sprintf(
    "[timing] %s | %s%s: %.3fs",
    timings$operation,
    phase,
    detail_text,
    as.numeric(seconds)
  ))
  invisible(entry)
}

format_timing_details <- function(details) {
  if (!length(details)) return("")
  core_detail_names <- c("cores", "detected_cores", "reserved_cores", "core_policy")
  has_core_plan <- all(vapply(core_detail_names, function(name) !is.null(details[[name]]), logical(1)))
  if (has_core_plan) {
    detail_value <- function(name) {
      value <- details[[name]]
      if (length(value) > 1L) value <- paste(value, collapse = ",")
      as.character(value[[1]])
    }
    parts <- character(0)
    if (!is.null(details$nboot)) {
      parts <- c(parts, sprintf("nboot=%s", detail_value("nboot")))
    }
    parts <- c(parts, sprintf(
      "core plan: using %s of %s logical cores; reserved %s for desktop responsiveness; core_policy=%s",
      detail_value("cores"),
      detail_value("detected_cores"),
      detail_value("reserved_cores"),
      detail_value("core_policy")
    ))
    extra_names <- setdiff(names(details), c("nboot", core_detail_names))
    if (length(extra_names)) {
      parts <- c(parts, vapply(extra_names, function(name) {
        value <- details[[name]]
        if (is.null(value)) return(sprintf("%s=NULL", name))
        if (length(value) > 1L) value <- paste(value, collapse = ",")
        sprintf("%s=%s", name, as.character(value[[1]]))
      }, character(1), USE.NAMES = FALSE))
    }
    return(sprintf(" (%s)", paste(parts, collapse = ", ")))
  }
  parts <- vapply(names(details), function(name) {
    value <- details[[name]]
    if (is.null(value)) return(sprintf("%s=NULL", name))
    if (length(value) > 1L) value <- paste(value, collapse = ",")
    sprintf("%s=%s", name, as.character(value[[1]]))
  }, character(1), USE.NAMES = FALSE)
  sprintf(" (%s)", paste(parts, collapse = ", "))
}

time_phase <- function(timings, phase, expr, details = list()) {
  started <- proc.time()[["elapsed"]]
  tryCatch({
    value <- force(expr)
    record_timing(timings, phase, proc.time()[["elapsed"]] - started, details)
    value
  }, error = function(err) {
    failed_details <- c(details, list(error = conditionMessage(err)))
    record_timing(timings, paste0(phase, " failed"), proc.time()[["elapsed"]] - started, failed_details)
    stop(err)
  })
}

timed_or_direct <- function(timings, phase, expr, details = list()) {
  if (is.null(timings)) return(force(expr))
  time_phase(timings, phase, expr, details)
}

finalize_timings <- function(timings) {
  if (is.null(timings)) return(NULL)
  if (!isTRUE(timings$finished)) {
    timings$total_seconds <- round(as.numeric(proc.time()[["elapsed"]] - timings$started_elapsed), 3)
    message(sprintf("[timing] %s | total backend route before JSON serialization: %.3fs", timings$operation, timings$total_seconds))
    timings$finished <- TRUE
  }
  timings
}

timings_payload <- function(timings) {
  timings <- finalize_timings(timings)
  if (is.null(timings)) return(NULL)
  list(
    operation = timings$operation,
    started_at = timings$started_at,
    total_seconds = timings$total_seconds,
    phases = timings$items
  )
}

timing_execution_log <- function(timings) {
  if (is.null(timings) || !length(timings$items)) return(list())
  lapply(timings$items, function(entry) {
    detail_text <- format_timing_details(entry$details %||% list())
    list(message = sprintf("Timing: %s%s took %.2fs.", entry$phase, detail_text, entry$seconds))
  })
}

attach_timing_metadata <- function(response, timings) {
  if (is.null(timings) || !is.list(response) || is.null(response$results)) return(response)
  payload <- timings_payload(timings)
  if (is.null(payload)) return(response)

  response$results$meta <- response$results$meta %||% list()
  response$results$meta$timings <- payload

  timing_logs <- timing_execution_log(timings)
  if (length(timing_logs)) {
    response$results$execution_log <- c(response$results$execution_log %||% list(), timing_logs)
    if (!is.null(response$results$algorithm) && is.list(response$results$algorithm)) {
      response$results$algorithm$execution_log <- c(response$results$algorithm$execution_log %||% list(), timing_logs)
    }
  }

  response
}

analysis_core_plan <- function() {
  detected <- suppressWarnings(parallel::detectCores(logical = TRUE))
  if (is.na(detected) || detected < 1L) detected <- 1L

  requested <- max_analysis_cores
  policy <- "env-fixed"
  if (is.na(requested) || requested == 0L) {
    requested <- if (detected >= 13L) {
      12L
    } else if (detected >= 11L) {
      10L
    } else if (detected >= 9L) {
      8L
    } else if (detected >= 7L) {
      6L
    } else {
      max(1L, detected - 1L)
    }
    policy <- "dynamic-stepped-cap"
  } else if (requested < 0L) {
    # Negative values specify cores to reserve for UI
    # E.g., -1 means allocate (detected - 1), -2 means allocate (detected - 2)
    requested <- detected + requested  # e.g., 12 + (-2) = 10
    policy <- "env-reserve"
  }

  cores <- max(1L, min(as.integer(requested), as.integer(detected)))
  list(
    cores = cores,
    detected_cores = as.integer(detected),
    reserved_cores = max(0L, as.integer(detected) - cores),
    policy = policy
  )
}

analysis_cores <- function() {
  analysis_core_plan()$cores
}

bootstrap_sample_ceiling <- function() {
  if (is.na(max_bootstrap_samples) || max_bootstrap_samples < 50L) Inf else max_bootstrap_samples
}

nca_run_depth_ceiling <- function() {
  if (is.na(max_nca_run_depth) || max_nca_run_depth < 10L) Inf else max_nca_run_depth
}

normalize_local_path <- function(file_path) {
  normalizePath(path.expand(as.character(file_path %||% "")), winslash = "/", mustWork = FALSE)
}

# Safe default dataset roots used when METIS_ALLOWED_DATA_ROOTS is not configured
# (e.g. a standalone / dev Plumber server started outside the Electron host).
# These cover every legitimate dataset location (user home + system temp) while still
# rejecting arbitrary system paths, so the gate degrades to "scoped" rather than "off".
default_dataset_roots <- function() {
  candidates <- c(
    Sys.getenv("USERPROFILE"),
    {
      hd <- Sys.getenv("HOMEDRIVE"); hp <- Sys.getenv("HOMEPATH")
      if (nzchar(hd) && nzchar(hp)) file.path(hd, hp) else ""
    },
    Sys.getenv("HOME"),
    tryCatch(path.expand("~"), error = function(e) ""),
    tempdir(),
    Sys.getenv("TMPDIR"),
    Sys.getenv("TEMP"),
    Sys.getenv("TMP")
  )
  candidates <- trimws(candidates)
  candidates <- candidates[nzchar(candidates)]
  if (!length(candidates)) return(character(0))
  unique(vapply(candidates, normalize_local_path, character(1), USE.NAMES = FALSE))
}

trusted_metis_dataset_roots <- {
  if (!nzchar(trimws(trusted_metis_dataset_roots_raw))) {
    default_dataset_roots()
  } else {
    roots <- unlist(strsplit(trusted_metis_dataset_roots_raw, .Platform$path.sep, fixed = TRUE), use.names = FALSE)
    roots <- trimws(roots)
    roots <- roots[nzchar(roots)]
    unique(vapply(roots, normalize_local_path, character(1), USE.NAMES = FALSE))
  }
}

path_within_root <- function(target_path, root_path) {
  target <- tolower(normalize_local_path(target_path))
  root <- tolower(normalize_local_path(root_path))
  identical(target, root) || startsWith(paste0(target, "/"), paste0(root, "/"))
}

assert_dataset_path_allowed <- function(file_path) {
  if (!length(trusted_metis_dataset_roots)) {
    stop("Dataset access is disabled until trusted metis workspace roots are configured.")
  }
  if (any(vapply(trusted_metis_dataset_roots, function(root) path_within_root(file_path, root), logical(1)))) {
    return(invisible(TRUE))
  }
  stop("Dataset path is outside trusted metis workspace directories.")
}

require_local_token <- function(req, res) {
  if (!nzchar(metis_token)) {
    res$status <- 503L
    res$setHeader("Content-Type", "application/json")
    return(FALSE)
  }

  provided <- req$HTTP_X_METIS_TOKEN
  if (is.null(provided) || !identical(as.character(provided), metis_token)) {
    res$status <- 403L
    res$setHeader("Content-Type", "application/json")
    return(FALSE)
  }

  TRUE
}

#* @filter require_metis_token
function(req, res) {
  if (!require_local_token(req, res)) {
    message <- if (!nzchar(metis_token)) {
      "metis backend is missing its local authentication token."
    } else {
      "Forbidden"
    }
    return(list(
      success = FALSE,
      error = message,
      errorCode = "METIS_AUTH_FAILED",
      userAction = "Restart Metis and try the analysis again. If this keeps happening, run setup so the local backend token can be refreshed.",
      backendDetail = message
    ))
  }
  plumber::forward()
}

reset_analysis_timeout <- function() {
  try(setTimeLimit(cpu = Inf, elapsed = Inf, transient = FALSE), silent = TRUE)
}

with_analysis_timeout <- function(expr) {
  with_analysis_timeout_for(expr, analysis_timeout_seconds)
}

with_analysis_timeout_for <- function(expr, timeout_seconds = analysis_timeout_seconds) {
  setTimeLimit(
    cpu = timeout_seconds,
    elapsed = timeout_seconds,
    transient = TRUE
  )
  on.exit(reset_analysis_timeout(), add = TRUE)
  force(expr)
}

format_analysis_error_message <- function(err, analysis_label, timeout_seconds) {
  message <- conditionMessage(err)
  if (grepl("elapsed time limit", message, fixed = TRUE)) {
    return(sprintf(
      "%s could not finish within %s seconds. Try fewer bootstrap subsamples or a smaller NCA run depth, close other heavy apps, and run it again.",
      analysis_label,
      timeout_seconds
    ))
  }
  if (grepl("cannot allocate vector|memory exhausted|cannot allocate memory", message, ignore.case = TRUE)) {
    return(sprintf(
      "%s ran out of memory. Try fewer bootstrap subsamples, close other heavy apps, or run the analysis on a machine with more RAM.",
      analysis_label
    ))
  }
  if (grepl("dgesv|exactly singular|singular matrix|computationally singular", message, ignore.case = TRUE)) {
    return(sprintf(
      "%s could not be estimated because the data or predictors are perfectly duplicated or collinear. Check duplicate indicators, constant columns, identical dataset columns, or predictors that move exactly together.",
      analysis_label
    ))
  }
  message
}

analysis_error_code <- function(raw_message) {
  message <- tolower(as.character(raw_message %||% ""))

  if (grepl("elapsed time limit|could not finish within", message)) return("TIMEOUT")
  if (grepl("cannot allocate vector|memory exhausted|cannot allocate memory|ran out of memory", message)) return("MEMORY")
  if (grepl("dgesv|exactly singular|singular matrix|computationally singular", message)) return("SINGULAR_MATRIX")
  if (grepl("plspredict could not be computed|seminr returned no prediction|plspredict is not available", message)) return("PLSPREDICT_UNSUPPORTED")
  if (grepl("dataset access is disabled|outside trusted metis workspace", message)) return("DATASET_ACCESS")
  if (grepl("dataset not found|dataset file exceeds|unsupported dataset extension|dataset must be tabular|dataset must contain|missing indicator columns", message)) {
    return("DATASET_INVALID")
  }
  if (grepl("construct.*has no indicators|duplicate construct name|higher-order construct|paths\\[|interactions\\[|targetconstruct|selected target|select at least one advanced analysis", message)) {
    return("MODEL_SPEC_INVALID")
  }
  if (grepl("seminrextras|readxl|package .*required|package .*not installed", message)) return("R_PACKAGE_MISSING")
  if (grepl("folds must|repetitions must|bootstrap subsamples|must be a whole number|must be at least|must be between|above the current app limit|must be one of", message)) {
    return("SETTINGS_INVALID")
  }
  if (grepl("rscript|plumber|r runtime", message)) return("R_RUNTIME")

  "ANALYSIS_FAILED"
}

analysis_error_user_action <- function(error_code, analysis_label, timeout_seconds) {
  if (identical(error_code, "TIMEOUT")) {
    return(sprintf(
      "%s took longer than %s seconds. Use fewer bootstrap subsamples or a smaller NCA run depth, close heavy apps, and run it again.",
      analysis_label,
      timeout_seconds
    ))
  }
  if (identical(error_code, "MEMORY")) {
    return("Free memory, close other heavy apps, use fewer bootstrap subsamples or prediction repetitions, then run the analysis again.")
  }
  if (identical(error_code, "SINGULAR_MATRIX")) {
    return("Check for duplicate indicators, constant columns, identical dataset columns, or predictors that move exactly together.")
  }
  if (identical(error_code, "PLSPREDICT_UNSUPPORTED")) {
    return("PLSpredict is not available for this model shape. Check the execution log, simplify unsupported model parts, or continue with PLS-SEM and Bootstrap.")
  }
  if (identical(error_code, "DATASET_ACCESS")) {
    return("Re-import the dataset into the current Metis workspace or choose a dataset inside an allowed workspace folder.")
  }
  if (identical(error_code, "DATASET_INVALID")) {
    return("Re-import a CSV, XLS, or XLSX dataset with headers and make sure the model indicators match the dataset columns.")
  }
  if (identical(error_code, "MODEL_SPEC_INVALID")) {
    return("Check the model canvas for missing indicators, deleted constructs, invalid higher-order dimensions, or targets without incoming paths.")
  }
  if (identical(error_code, "R_PACKAGE_MISSING")) {
    return("Run setup again or install the missing R package in the selected R runtime, then retry the analysis.")
  }
  if (identical(error_code, "SETTINGS_INVALID")) {
    return("Reopen the analysis settings, choose values inside the allowed range, and run the analysis again.")
  }
  if (identical(error_code, "R_RUNTIME")) {
    return("Run setup again, verify the selected Rscript path, restart Metis, and retry the analysis.")
  }

  "Review the model and dataset, then run the analysis again. If the issue repeats, send the backend detail to support."
}

analysis_error_response <- function(err, analysis_label, timeout_seconds) {
  raw_message <- conditionMessage(err)
  error_code <- analysis_error_code(raw_message)
  list(
    success = FALSE,
    error = format_analysis_error_message(err, analysis_label, timeout_seconds),
    errorCode = analysis_error_code(raw_message),
    userAction = analysis_error_user_action(error_code, analysis_label, timeout_seconds),
    backendDetail = raw_message
  )
}

format_configured_max_error <- function(field_label, max_value) {
  sprintf(
    "%s is above the current app limit of %s. Lower the value or ask the person who configured this installation to raise the limit.",
    field_label,
    max_value
  )
}

is_scalar_string <- function(x) {
  is.character(x) && length(x) == 1 && !is.na(x)
}

is_scalar_logical <- function(x) {
  is.logical(x) && length(x) == 1 && !is.na(x)
}

is_scalar_number <- function(x) {
  is.numeric(x) && length(x) == 1 && !is.na(x) && is.finite(x)
}

is_json_array <- function(x) {
  is.list(x) && (is.null(names(x)) || !length(names(x)) || all(names(x) == ""))
}

require_scalar_string <- function(x, field_name, allow_empty = FALSE, max_chars = 200) {
  if (!is_scalar_string(x)) {
    stop(sprintf("%s must be a string.", field_name))
  }
  value <- trimws(x)
  if (!allow_empty && !nzchar(value)) {
    stop(sprintf("%s cannot be empty.", field_name))
  }
  if (nchar(value, type = "chars") > max_chars) {
    stop(sprintf("%s is too long.", field_name))
  }
  if (grepl("[[:cntrl:]]", value)) {
    stop(sprintf("%s contains unsupported control characters.", field_name))
  }
  value
}

require_scalar_integer <- function(x, field_name, min_value, max_value, configured_max_label = NULL) {
  if (!is_scalar_number(x) || abs(x - round(x)) > .Machine$double.eps^0.5) {
    stop(sprintf("%s must be a whole number.", field_name))
  }
  rounded <- round(x)
  if (!is.finite(rounded) || rounded > .Machine$integer.max) {
    stop(sprintf("%s is too large to run on this machine.", field_name))
  }
  value <- as.integer(rounded)
  if (value < min_value) {
    stop(sprintf("%s must be at least %s.", field_name, min_value))
  }
  if (is.finite(max_value) && value > max_value) {
    if (!is.null(configured_max_label)) {
      stop(format_configured_max_error(configured_max_label, max_value))
    }
    stop(sprintf("%s must be between %s and %s.", field_name, min_value, max_value))
  }
  value
}

require_optional_choice <- function(x, field_name, allowed, default_value) {
  if (is.null(x)) return(default_value)
  value <- require_scalar_string(x, field_name, allow_empty = FALSE, max_chars = 40)
  match_index <- match(tolower(value), tolower(allowed))
  if (is.na(match_index)) {
    stop(sprintf("%s must be one of: %s.", field_name, paste(allowed, collapse = ", ")))
  }
  allowed[[match_index]]
}

require_object_array <- function(x, field_name, min_len = 0L, max_len = 1000L) {
  if (is.null(x) && min_len == 0L) return(list())
  if (!is_json_array(x)) {
    stop(sprintf("%s must be a JSON array.", field_name))
  }
  if (length(x) < min_len) {
    stop(sprintf("%s must contain at least %s item(s).", field_name, min_len))
  }
  if (length(x) > max_len) {
    stop(sprintf("%s exceeds the maximum of %s item(s).", field_name, max_len))
  }
  x
}

require_string_array <- function(x, field_name, min_len = 0L, max_len = 1000L, max_chars = 200) {
  arr <- require_object_array(x, field_name, min_len = min_len, max_len = max_len)
  vapply(
    seq_along(arr),
    function(idx) {
      require_scalar_string(arr[[idx]], sprintf("%s[%s]", field_name, idx), allow_empty = FALSE, max_chars = max_chars)
    },
    character(1),
    USE.NAMES = FALSE
  )
}

validate_constructs_payload <- function(constructs_payload) {
  constructs <- require_object_array(constructs_payload, "constructs", min_len = 1L, max_len = max_constructs)
  normalized <- vector("list", length(constructs))
  seen_names <- character(0)

  for (idx in seq_along(constructs)) {
    construct <- constructs[[idx]]
    if (!is.list(construct) || is.null(names(construct))) {
      stop(sprintf("constructs[%s] must be an object.", idx))
    }

    con_name <- require_scalar_string(construct$name, sprintf("constructs[%s].name", idx), max_chars = 120)
    con_type <- tolower(require_scalar_string(construct$type, sprintf("constructs[%s].type", idx), max_chars = 40))
    if (!(con_type %in% c("reflective", "formative"))) {
      stop(sprintf("constructs[%s].type must be Reflective or Formative.", idx))
    }

    is_higher_order <- isTRUE(construct$is_higher_order %||% construct$isHigherOrder)
    indicator_min_len <- if (is_higher_order) 0L else 1L
    indicators <- unique(require_string_array(
      construct$indicators %||% list(),
      sprintf("constructs[%s].indicators", idx),
      min_len = indicator_min_len,
      max_len = max_indicators_per_construct,
      max_chars = 120
    ))

    higher_order_type <- tolower(as.character(construct$higher_order_type %||% construct$higherOrderType %||% con_type))
    if (!(higher_order_type %in% c("reflective", "formative"))) {
      stop(sprintf("constructs[%s].higher_order_type must be reflective or formative.", idx))
    }

    dimensions <- character(0)
    if (is_higher_order) {
      dimensions <- unique(require_string_array(
        construct$dimensions %||% construct$lowerOrderConstructs %||% list(),
        sprintf("constructs[%s].dimensions", idx),
        min_len = 1L,
        max_len = max_constructs,
        max_chars = 120
      ))
    }

    if (tolower(con_name) %in% tolower(seen_names)) {
      stop(sprintf("Duplicate construct name: %s", con_name))
    }
    seen_names <- c(seen_names, con_name)

    normalized_construct <- list(
      name = con_name,
      type = if (identical(con_type, "formative")) "Formative" else "Reflective",
      indicators = as.list(indicators)
    )

    if (is_higher_order) {
      normalized_construct$is_higher_order <- TRUE
      normalized_construct$higher_order_type <- higher_order_type
      normalized_construct$dimensions <- as.list(dimensions)
    }

    normalized[[idx]] <- normalized_construct
  }

  normalized
}

validate_higher_order_dimensions <- function(constructs) {
  construct_names <- vapply(constructs, function(con) con$name, character(1), USE.NAMES = FALSE)
  hoc_names <- vapply(constructs, function(con) if (isTRUE(con$is_higher_order)) con$name else "", character(1), USE.NAMES = FALSE)
  hoc_names <- hoc_names[nzchar(hoc_names)]

  for (idx in seq_along(constructs)) {
    construct <- constructs[[idx]]
    if (!isTRUE(construct$is_higher_order)) next

    dimensions <- unlist(construct$dimensions %||% list(), use.names = FALSE)
    for (dimension in dimensions) {
      if (!(dimension %in% construct_names)) {
        stop(sprintf("constructs[%s].dimensions references unknown construct '%s'.", idx, dimension))
      }
      if (identical(dimension, construct$name)) {
        stop(sprintf("constructs[%s].dimensions cannot include the HOC itself.", idx))
      }
      if (dimension %in% hoc_names) {
        stop(sprintf("constructs[%s].dimensions cannot reference another higher-order construct.", idx))
      }
    }
  }

  constructs
}

validate_paths_payload <- function(paths_payload, construct_names) {
  paths <- require_object_array(paths_payload, "paths", min_len = 1L, max_len = max_paths)
  normalized <- vector("list", length(paths))

  for (idx in seq_along(paths)) {
    edge <- paths[[idx]]
    if (!is.list(edge) || is.null(names(edge))) {
      stop(sprintf("paths[%s] must be an object.", idx))
    }

    from_name <- require_scalar_string(edge$from, sprintf("paths[%s].from", idx), max_chars = 120)
    to_name <- require_scalar_string(edge$to, sprintf("paths[%s].to", idx), max_chars = 120)

    if (!(from_name %in% construct_names)) {
      stop(sprintf("paths[%s].from references unknown construct '%s'.", idx, from_name))
    }
    if (!(to_name %in% construct_names)) {
      stop(sprintf("paths[%s].to references unknown construct '%s'.", idx, to_name))
    }

    normalized[[idx]] <- list(from = from_name, to = to_name)
  }

  normalized
}

validate_interactions_payload <- function(interactions_payload, construct_names) {
  interactions <- require_object_array(interactions_payload, "interactions", min_len = 0L, max_len = max_interactions)
  normalized <- list()

  for (idx in seq_along(interactions)) {
    interaction <- interactions[[idx]]
    if (!is.list(interaction) || is.null(names(interaction))) {
      stop(sprintf("interactions[%s] must be an object.", idx))
    }

    iv <- require_scalar_string(interaction$iv %||% interaction$from %||% "", sprintf("interactions[%s].iv", idx), max_chars = 120)
    moderator <- require_scalar_string(interaction$moderator %||% "", sprintf("interactions[%s].moderator", idx), max_chars = 120)
    outcome <- if (is.null(interaction$outcome)) {
      ""
    } else {
      require_scalar_string(interaction$outcome, sprintf("interactions[%s].outcome", idx), allow_empty = TRUE, max_chars = 120)
    }

    if (!(iv %in% construct_names)) {
      stop(sprintf("interactions[%s].iv references unknown construct '%s'.", idx, iv))
    }
    if (!(moderator %in% construct_names)) {
      stop(sprintf("interactions[%s].moderator references unknown construct '%s'.", idx, moderator))
    }
    if (nzchar(outcome) && !(outcome %in% construct_names)) {
      stop(sprintf("interactions[%s].outcome references unknown construct '%s'.", idx, outcome))
    }

    normalized[[length(normalized) + 1]] <- list(iv = iv, moderator = moderator, outcome = outcome)
  }

  normalized
}

normalize_hoc_settings <- function(settings_payload = list()) {
  if (is.null(settings_payload)) settings_payload <- list()
  if (!is.list(settings_payload)) stop("algorithmSettings must be an object.")

  list(
    hocMethod = require_optional_choice(
      settings_payload$hocMethod,
      "algorithmSettings.hocMethod",
      c("Repeated indicators", "Two-stage"),
      "Two-stage"
    ),
    hocTwoStage = require_optional_choice(
      settings_payload$hocTwoStage,
      "algorithmSettings.hocTwoStage",
      c("Embedded", "Disjoint two-stage"),
      "Disjoint two-stage"
    )
  )
}

hoc_method_label <- function(settings_payload = list(), has_hoc = TRUE) {
  if (!isTRUE(has_hoc)) return("Not applicable")
  hoc <- normalize_hoc_settings(settings_payload)
  if (identical(hoc$hocMethod, "Repeated indicators")) return("Repeated Indicators")
  if (identical(hoc$hocTwoStage, "Embedded")) return("Embedded Two-stage")
  "Disjoint Two-stage"
}

validate_algorithm_settings_payload <- function(settings_payload) {
  if (is.null(settings_payload)) settings_payload <- list()
  if (!is.list(settings_payload) || (length(settings_payload) > 0L && (is.null(names(settings_payload)) || any(names(settings_payload) == "")))) {
    stop("algorithmSettings must be an object.")
  }

  has_hoc_settings <- !is.null(settings_payload$hocMethod) || !is.null(settings_payload$hocTwoStage)
  normalized <- if (has_hoc_settings) normalize_hoc_settings(settings_payload) else list()
  if (!is.null(settings_payload$innerWeighting)) {
    normalized$innerWeighting <- require_scalar_string(settings_payload$innerWeighting, "algorithmSettings.innerWeighting", max_chars = 80)
  }
  if (!is.null(settings_payload$initialWeights)) {
    normalized$initialWeights <- require_scalar_string(settings_payload$initialWeights, "algorithmSettings.initialWeights", max_chars = 80)
  }
  if (!is.null(settings_payload$maxIterations)) {
    normalized$maxIterations <- require_scalar_integer(settings_payload$maxIterations, "algorithmSettings.maxIterations", 1L, 100000L)
  }
  if (!is.null(settings_payload$stopCriterion)) {
    normalized$stopCriterion <- require_scalar_string(settings_payload$stopCriterion, "algorithmSettings.stopCriterion", max_chars = 80)
  }
  if (!is.null(settings_payload$missingData)) {
    normalized$missingData <- require_scalar_string(settings_payload$missingData, "algorithmSettings.missingData", max_chars = 80)
    if (!(normalized$missingData %in% c("Mean replacement", "Listwise deletion", "Median replacement"))) {
      stop("algorithmSettings.missingData must be Mean replacement, Listwise deletion, or Median replacement.")
    }
  }
  if (!is.null(settings_payload$missingValue)) {
    normalized$missingValue <- require_scalar_string(settings_payload$missingValue, "algorithmSettings.missingValue", max_chars = 20)
    if (toupper(trimws(normalized$missingValue)) != "NA") stop("algorithmSettings.missingValue currently supports only NA, the SEMinR default sentinel.")
  }
  if (!is.null(settings_payload$assessSyntax)) {
    if (!is_scalar_logical(settings_payload$assessSyntax)) stop("algorithmSettings.assessSyntax must be true or false.")
    normalized$assessSyntax <- isTRUE(settings_payload$assessSyntax)
  }

  normalized
}

validate_advanced_analyses_payload <- function(analyses_payload) {
  if (is.null(analyses_payload)) {
    stop("Select at least one advanced analysis.")
  }
  if (!is.list(analyses_payload) || is.null(names(analyses_payload)) || any(names(analyses_payload) == "")) {
    stop("analyses must be an object.")
  }

  normalize_flag <- function(value, field_name, default_value) {
    if (is.null(value)) return(default_value)
    if (!is_scalar_logical(value)) {
      stop(sprintf("%s must be true or false.", field_name))
    }
    isTRUE(value)
  }

  normalized <- list(
    ipma = normalize_flag(analyses_payload$ipma, "analyses.ipma", FALSE),
    nca = normalize_flag(analyses_payload$nca, "analyses.nca", FALSE),
    cipma = normalize_flag(analyses_payload$cipma, "analyses.cipma", FALSE)
  )

  if (!any(unlist(normalized, use.names = FALSE))) {
    stop("Select at least one advanced analysis.")
  }

  normalized
}

validate_permutation_analysis_payload <- function(payload, construct_names, data_columns) {
  if (!is.list(payload) || is.null(names(payload))) {
    stop("Permutation analysis payload must be a JSON object.")
  }
  if (!length(construct_names)) {
    stop("Permutation analysis requires at least one construct.")
  }

  grouping_variable <- require_scalar_string(payload$groupingVariable, "groupingVariable", max_chars = 200)
  if (!(grouping_variable %in% data_columns)) {
    stop(sprintf("groupingVariable '%s' was not found in the linked dataset.", grouping_variable))
  }

  group_a <- require_scalar_string(payload$groupA, "groupA", max_chars = 200)
  group_b <- require_scalar_string(payload$groupB, "groupB", max_chars = 200)
  if (identical(group_a, group_b)) {
    stop("groupA and groupB must be different grouping-variable values.")
  }

  permutations <- require_scalar_integer(payload$permutations, "Permutations", 1L, Inf)
  if (!is_scalar_number(payload$alpha) || payload$alpha <= 0 || payload$alpha >= 1) {
    stop("alpha must be a number greater than 0 and less than 1.")
  }
  seed <- require_scalar_integer(payload$seed, "seed", -2147483647L, 2147483647L)

  list(
    groupingVariable = grouping_variable,
    groupA = group_a,
    groupB = group_b,
    permutations = permutations,
    alpha = as.numeric(payload$alpha),
    seed = seed
  )
}

validate_multi_group_analysis_payload <- function(payload, construct_names, data_columns, normalized_constructs = NULL) {
  if (!is.list(payload) || is.null(names(payload))) {
    stop("Multi-group analysis payload must be a JSON object.")
  }
  if (!length(construct_names)) {
    stop("Multi-group analysis requires at least one construct.")
  }

  grouping_variable <- require_scalar_string(payload$groupingVariable, "groupingVariable", max_chars = 200)
  if (!(grouping_variable %in% data_columns)) {
    stop(sprintf("groupingVariable '%s' was not found in the linked dataset.", grouping_variable))
  }

  group_a <- require_scalar_string(payload$groupA, "groupA", max_chars = 200)
  group_b <- require_scalar_string(payload$groupB, "groupB", max_chars = 200)
  if (identical(group_a, group_b)) {
    stop("groupA and groupB must be different grouping-variable values.")
  }

  nboot <- require_scalar_integer(
    payload$nboot,
    "Bootstrap subsamples",
    50L,
    bootstrap_sample_ceiling(),
    configured_max_label = "Bootstrap subsamples"
  )
  if (!is_scalar_number(payload$alpha) || payload$alpha <= 0 || payload$alpha >= 1) {
    stop("alpha must be a number greater than 0 and less than 1.")
  }
  seed <- require_scalar_integer(payload$seed, "seed", -2147483647L, 2147483647L)
  hoc_constructs <- normalized_constructs %||% payload$constructs %||% list()
  has_hoc <- any(vapply(
    hoc_constructs,
    function(con) isTRUE(con$is_higher_order) || isTRUE(con$isHigherOrder),
    logical(1)
  ))
  selected_hoc_method <- hoc_method_label(payload$algorithmSettings %||% list(), has_hoc = has_hoc)
  base_hoc_method <- require_optional_choice(
    payload$baseHocMethod,
    "baseHocMethod",
    c("Repeated Indicators", "Embedded Two-stage", "Disjoint Two-stage"),
    selected_hoc_method
  )

  list(
    groupingVariable = grouping_variable,
    groupA = group_a,
    groupB = group_b,
    nboot = nboot,
    alpha = as.numeric(payload$alpha),
    seed = seed,
    baseHocMethod = base_hoc_method
  )
}

validate_payload_object <- function(payload) {
  if (!is.list(payload) || is.null(names(payload))) {
    stop("Request body must be a JSON object.")
  }

  dataset_path <- require_scalar_string(payload$datasetPath, "datasetPath", max_chars = 1000)
  constructs <- validate_higher_order_dimensions(validate_constructs_payload(payload$constructs))
  construct_names <- vapply(constructs, function(con) con$name, character(1), USE.NAMES = FALSE)
  interactions <- validate_interactions_payload(payload$interactions %||% list(), construct_names)
  interaction_construct_names <- vapply(interactions, function(interaction) {
    paste0(interaction$iv, "*", interaction$moderator)
  }, character(1), USE.NAMES = FALSE)
  paths <- validate_paths_payload(payload$paths, c(construct_names, interaction_construct_names))
  algorithm <- require_optional_choice(payload$algorithm, "algorithm", c("standard", "consistent"), "standard")
  algorithm_settings <- validate_algorithm_settings_payload(payload$algorithmSettings)

  normalized <- list(
    datasetPath = dataset_path,
    constructs = constructs,
    paths = paths,
    interactions = interactions,
    algorithm = algorithm,
    algorithmSettings = algorithm_settings
  )

  if (!is.null(payload$nboot)) {
    normalized$nboot <- require_scalar_integer(
      payload$nboot,
      "Bootstrap subsamples",
      50L,
      bootstrap_sample_ceiling(),
      configured_max_label = "Bootstrap subsamples"
    )
  }
  if (!is.null(payload$ciType)) {
    normalized$ciType <- require_scalar_string(payload$ciType, "ciType", max_chars = 40)
  }
  if (!is.null(payload$confidenceLevel)) {
    normalized$confidenceLevel <- require_scalar_string(payload$confidenceLevel, "confidenceLevel", max_chars = 20)
  }
  if (!is.null(payload$folds)) {
    normalized$folds <- require_scalar_integer(payload$folds, "folds", 2L, max_predict_folds)
  }
  if (!is.null(payload$validationMode)) {
    normalized$validationMode <- require_optional_choice(payload$validationMode, "validationMode", c("K-fold", "LOOCV"), "K-fold")
  }
  if (!is.null(payload$repetitions)) {
    normalized$repetitions <- require_scalar_integer(payload$repetitions, "repetitions", 1L, max_predict_repetitions)
  }
  if (!is.null(payload$cvpatEnabled)) {
    if (!is_scalar_logical(payload$cvpatEnabled)) {
      stop("cvpatEnabled must be true or false.")
    }
    normalized$cvpatEnabled <- isTRUE(payload$cvpatEnabled)
  }
  if (!is.null(payload$technique)) {
    technique <- toupper(trimws(as.character(payload$technique)))
    technique <- if (technique %in% c("EA", "ENTIRE ANTECEDENTS (EA)", "EARLIEST ANTECEDENTS (EA)")) "EA" else if (technique %in% c("DA", "DIRECT ANTECEDENTS (DA)")) "DA" else stop("technique must be Direct antecedents (DA), Earliest antecedents (EA), or Entire antecedents (EA).")
    normalized$technique <- technique
  }
  if (!is.null(payload$predictionSeed)) {
    normalized$predictionSeed <- require_scalar_integer(payload$predictionSeed, "predictionSeed", 1L, 2147483647L)
  }
  if (!is.null(payload$bootstrapSeed)) {
    normalized$bootstrapSeed <- require_scalar_integer(payload$bootstrapSeed, "bootstrapSeed", 1L, 2147483647L)
  }
  for (field in c("bootstrapTails", "bootstrapResampling", "bootstrapSignChanges")) {
    if (!is.null(payload[[field]])) normalized[[field]] <- require_scalar_string(payload[[field]], field, max_chars = 80)
  }
  if (!is.null(payload$targetConstruct)) {
    normalized$targetConstruct <- require_scalar_string(payload$targetConstruct, "targetConstruct", max_chars = 120)
    if (!(normalized$targetConstruct %in% construct_names)) {
      stop(sprintf("targetConstruct references unknown construct '%s'.", normalized$targetConstruct))
    }
  }
  if (!is.null(payload$predecessorScope)) {
    normalized$predecessorScope <- require_optional_choice(payload$predecessorScope, "predecessorScope", c("all", "direct"), "all")
  }
  if (!is.null(payload$analyses)) {
    normalized$analyses <- validate_advanced_analyses_payload(payload$analyses)
  }
  if (!is.null(payload$runDepth)) {
    normalized$runDepth <- require_scalar_integer(
      payload$runDepth,
      "NCA run depth",
      10L,
      nca_run_depth_ceiling(),
      configured_max_label = "NCA run depth"
    )
  }
  if (!is.null(payload$bottleneckStepSize)) {
    normalized$bottleneckStepSize <- require_scalar_integer(payload$bottleneckStepSize, "bottleneckStepSize", 1L, 50L)
  }
  if (!is.null(payload$postHocAlpha)) {
    if (!is_scalar_number(payload$postHocAlpha) || payload$postHocAlpha <= 0 || payload$postHocAlpha >= 1) {
      stop("postHocAlpha must be a number between 0 and 1.")
    }
    normalized$postHocAlpha <- payload$postHocAlpha
  }
  if (!is.null(payload$postHocEffect)) {
    if (!is_scalar_number(payload$postHocEffect) || payload$postHocEffect <= 0) {
      stop("postHocEffect must be a positive number.")
    }
    normalized$postHocEffect <- payload$postHocEffect
  }
  if (!is.null(payload$postHocEffectMeasure)) {
    normalized$postHocEffectMeasure <- require_scalar_string(payload$postHocEffectMeasure, "postHocEffectMeasure", max_chars = 40)
  }
  if (!is.null(payload$postHocDf)) {
    normalized$postHocDf <- require_scalar_integer(payload$postHocDf, "postHocDf", 1L, 1000000L)
  }

  normalized
}

assert_dataset_shape_allowed <- function(data) {
  if (!is.data.frame(data)) {
    stop("Dataset must be tabular.")
  }
  if (nrow(data) < 1 || ncol(data) < 1) {
    stop("Dataset must contain at least one row and one column.")
  }
  if (nrow(data) > max_dataset_rows) {
    stop(sprintf("Dataset has %s rows; the limit is %s.", nrow(data), max_dataset_rows))
  }
  if (ncol(data) > max_dataset_cols) {
    stop(sprintf("Dataset has %s columns; the limit is %s.", ncol(data), max_dataset_cols))
  }
  invisible(TRUE)
}

safe_num <- function(x) {
  if (is.null(x) || length(x) == 0 || is.na(x)) return(NULL)
  as.numeric(x)
}

row_scalar_value <- function(value) {
  if (length(value) == 0 || is.null(value)) return(NULL)
  if (length(value) > 1) return(lapply(value, row_scalar_value))

  if (inherits(value, c("Date", "POSIXct", "POSIXlt"))) {
    if (is.na(value)) return(NULL)
    return(as.character(value))
  }

  if (is.factor(value)) value <- as.character(value)

  if (is.numeric(value)) {
    if (is.na(value) || !is.finite(value)) return(NULL)
    return(unname(as.numeric(value)))
  }

  if (is.logical(value)) {
    if (is.na(value)) return(NULL)
    return(unname(as.logical(value)))
  }

  if (is.character(value)) {
    if (is.na(value)) return(NULL)
    return(unname(as.character(value)))
  }

  if (is.na(value)) return(NULL)
  unname(value)
}

json_unbox_tree <- function(value) {
  if (is.null(value)) return(NULL)
  if (inherits(value, "AsIs")) return(value)
  if (is.data.frame(value) || is.matrix(value)) return(json_unbox_tree(as_rows(value)))
  if (is.list(value)) return(lapply(value, json_unbox_tree))

  scalar <- row_scalar_value(value)
  if (is.null(scalar)) return(NULL)
  if (is.list(scalar)) return(lapply(scalar, json_unbox_tree))
  if (length(scalar) == 1L) return(jsonlite::unbox(scalar))

  lapply(scalar, json_unbox_tree)
}

dataframe_to_rows <- function(df) {
  if (!nrow(df)) return(list())

  lapply(seq_len(nrow(df)), function(row_index) {
    row <- lapply(df[row_index, , drop = FALSE], function(col) row_scalar_value(col[[1]]))
    names(row) <- colnames(df)
    row
  })
}

as_rows <- function(x) {
  if (is.null(x)) return(list())

  if (is.data.frame(x) || is.matrix(x)) {
    df <- as.data.frame(x, stringsAsFactors = FALSE, check.names = FALSE)
    existing_names <- colnames(df)
    lower_names <- tolower(existing_names)

    # Drop the jsonlite ghost row column while preserving any explicit dataset/model columns.
    keep_cols <- !(lower_names %in% c("_row"))
    if (any(keep_cols)) {
      df <- df[, keep_cols, drop = FALSE]
      existing_names <- colnames(df)
      lower_names <- tolower(existing_names)
    }

    rn <- rownames(df)
    has_meaningful_rownames <-
      !is.null(rn) &&
      length(rn) == nrow(df) &&
      any(nzchar(rn)) &&
      !identical(rn, as.character(seq_len(nrow(df))))

    if (!("row_name" %in% lower_names) && has_meaningful_rownames) {
      df <- cbind(
        data.frame(row_name = rn, stringsAsFactors = FALSE, check.names = FALSE),
        df
      )
    }

    # Prevent jsonlite from re-materializing row names as `_row`.
    rownames(df) <- NULL

    return(dataframe_to_rows(df))
  }

  if (is.list(x)) return(x)
  list(list(value = as.character(x)))
}

is_auto_construct_label <- function(label) {
  grepl("^VAR_[0-9]+$", as.character(label %||% ""), ignore.case = TRUE)
}

construct_payload_indicators <- function(construct) {
  indicators <- unlist(lapply(construct$indicators %||% list(), as.character), use.names = FALSE)
  indicators <- trimws(indicators)
  unique(indicators[!is.na(indicators) & nzchar(indicators)])
}

derive_construct_display_name <- function(construct) {
  construct_name <- trimws(as.character(construct$name %||% ""))
  indicators <- construct_payload_indicators(construct)

  if (nzchar(construct_name) && !is_auto_construct_label(construct_name)) {
    return(construct_name)
  }

  if (length(indicators) == 1L) {
    return(indicators[[1]])
  }

  if (length(indicators) > 1L) {
    stems <- unique(trimws(gsub("[._ -]?[0-9]+$", "", indicators, perl = TRUE)))
    stems <- stems[!is.na(stems) & nzchar(stems)]
    if (length(stems) == 1L && !identical(stems[[1]], indicators[[1]])) {
      return(stems[[1]])
    }
    return(paste0(indicators[[1]], " + ", length(indicators) - 1L, " more"))
  }

  construct_name
}

build_construct_display_name_map <- function(payload) {
  constructs <- payload$constructs %||% list()
  label_map <- list()
  for (construct in constructs) {
    construct_name <- trimws(as.character(construct$name %||% ""))
    display_name <- derive_construct_display_name(construct)
    if (nzchar(construct_name) && nzchar(display_name)) {
      label_map[[construct_name]] <- display_name
      label_map[[toupper(construct_name)]] <- display_name
      label_map[[tolower(construct_name)]] <- display_name
    }
  }
  label_map
}

map_display_label <- function(value, label_map) {
  raw <- trimws(as.character(value %||% ""))
  if (!nzchar(raw) || !length(label_map)) return(raw)
  mapped <- label_map[[raw]]
  if (is.null(mapped)) mapped <- label_map[[toupper(raw)]]
  if (is.null(mapped)) mapped <- label_map[[tolower(raw)]]
  as.character(mapped %||% raw)
}

apply_row_label_map <- function(matrix_like, label_map) {
  if (is.null(matrix_like) || !length(label_map)) return(matrix_like)

  if (is.matrix(matrix_like) || is.data.frame(matrix_like)) {
    df <- as.data.frame(matrix_like, stringsAsFactors = FALSE, check.names = FALSE)
    rn <- rownames(df)
    if (!is.null(rn) && length(rn) == nrow(df)) {
      rownames(df) <- vapply(rn, map_display_label, character(1), label_map = label_map, USE.NAMES = FALSE)
    }

    for (field in intersect(c("row_name", "Row", "ROW", "Construct", "construct"), names(df))) {
      df[[field]] <- vapply(df[[field]], map_display_label, character(1), label_map = label_map, USE.NAMES = FALSE)
    }

    return(df)
  }

  matrix_like
}

cvpat_matrix_to_rows <- function(matrix_like, benchmark_label, label_map = NULL) {
  rows <- as_rows(apply_row_label_map(matrix_like, label_map %||% list()))
  if (!length(rows)) return(list())

  lapply(rows, function(row) {
    for (field in intersect(c("row_name", "Row", "ROW", "Construct", "construct"), names(row))) {
      row[[field]] <- map_display_label(row[[field]], label_map %||% list())
    }
    if (is.null(row$Benchmark)) {
      row <- c(list(Benchmark = benchmark_label), row)
    }
    row
  })
}

run_cvpat_bootstrap_comparison <- function(LossM1, LossM2, nboot = 2000L, testtype = "two.sided") {
  valid <- is.finite(LossM1) & is.finite(LossM2)
  LossM1 <- LossM1[valid]
  LossM2 <- LossM2[valid]
  N <- length(LossM1)
  if (N < 2L) {
    return(list(boot_t = NA_real_, boot_p = NA_real_))
  }

  if (requireNamespace("seminrExtras", quietly = TRUE) && exists("bootstrap_cvpat", envir = asNamespace("seminrExtras"), mode = "function")) {
    fn <- get("bootstrap_cvpat", envir = asNamespace("seminrExtras"))
    res <- tryCatch({
      fn(LossM1, LossM2, testtype = testtype, nboot = nboot)
    }, error = function(e) NULL)
    if (!is.null(res)) {
      boot_t <- as.numeric(res[["Boot T value"]] %||% res[["Boot.T.value"]] %||% res[[3]])
      boot_p <- as.numeric(res[["Boot P Value"]] %||% res[["Boot.P.Value"]] %||% res[[4]])
      return(list(boot_t = boot_t, boot_p = boot_p))
    }
  }

  OrgDbar <- mean(LossM2 - LossM1)
  D_0 <- LossM2 - LossM1 - OrgDbar
  BootDbar <- numeric(nboot)
  for (b in seq_len(nboot)) {
    BootDbar[b] <- mean(sample(D_0, length(D_0), replace = TRUE))
  }
  std <- sqrt(stats::var(BootDbar))
  tstat_boot_Var <- if (is.finite(std) && std > 0) OrgDbar / std else NA_real_
  p.value_var_ttest <- if (is.finite(tstat_boot_Var)) 2 * stats::pt(-abs(tstat_boot_Var), df = N - 1, lower.tail = TRUE) else NA_real_
  list(boot_t = as.numeric(tstat_boot_Var), boot_p = as.numeric(p.value_var_ttest))
}

run_cvpat_assessment <- function(core, folds, reps, payload = NULL, prediction_seed = 123L, validation_mode = "K-fold", cv_res = NULL) {
  if (!requireNamespace("seminrExtras", quietly = TRUE)) {
    return(list(
      status = "missing-seminrextras",
      lv_ia = list(),
      lv_lm = list(),
      lv_rows = list(),
      mv_ia = list(),
      mv_lm = list(),
      mv_rows = list(),
      execution_log = list(list(message = "CVPAT skipped because the R backend does not have seminrExtras installed."))
    ))
  }

  nboot <- max_cvpat_bootstrap_samples
  prediction_no_folds <- if (toupper(as.character(validation_mode %||% "K-fold")) == "LOOCV") NULL else folds
  result <- tryCatch({
    seminrExtras::assess_cvpat(
      seminr_model = core$model,
      testtype = "two.sided",
      nboot = nboot,
      seed = prediction_seed,
      technique = normalize_plspredict_technique(payload$technique %||% payload$predictionTechnique %||% "DA"),
      noFolds = prediction_no_folds,
      reps = reps,
      cores = 1
    )
  }, error = function(err) {
    list(.metis_error = conditionMessage(err))
  })

  if (!is.null(result$.metis_error)) {
    return(list(
      status = "error",
      lv_ia = list(),
      lv_lm = list(),
      lv_rows = list(),
      mv_ia = list(),
      mv_lm = list(),
      mv_rows = list(),
      execution_log = list(list(message = paste("CVPAT failed:", result$.metis_error)))
    ))
  }

  label_map <- build_construct_display_name_map(payload %||% list())
  scalar <- function(value) {
    number <- suppressWarnings(as.numeric(value))
    if (!length(number) || !is.finite(number[[1]])) NULL else number[[1]]
  }

  normalise_cvpat_lv_matrix <- function(mat, benchmark_type) {
    if (is.null(mat) || !nrow(mat)) return(list())
    df <- as.data.frame(mat, stringsAsFactors = FALSE, check.names = FALSE)
    rn <- rownames(mat)
    out <- vector("list", nrow(df))
    for (i in seq_len(nrow(df))) {
      c_name <- if (!is.null(rn) && length(rn) >= i) rn[[i]] else paste0("Construct_", i)
      display_construct <- map_display_label(c_name, label_map %||% list())
      pls_loss_val <- scalar(df[i, "PLS Loss"] %||% df[i, 1])
      bench_loss_val <- scalar(df[i, if (benchmark_type == "IA") "IA Loss" else "LM Loss"] %||% df[i, 2])
      diff_val <- if (!is.null(pls_loss_val) && !is.null(bench_loss_val)) {
        pls_loss_val - bench_loss_val
      } else {
        scalar(df[i, "Diff"] %||% df[i, 3])
      }
      boot_t_val <- scalar(df[i, "Boot T value"] %||% df[i, "Boot.T.value"] %||% df[i, 4])
      boot_p_val <- scalar(df[i, "Boot P Value"] %||% df[i, "Boot.P.Value"] %||% df[i, 5])
      out[[i]] <- list(
        Construct = display_construct,
        `PLS Loss` = pls_loss_val,
        `Benchmark Loss` = bench_loss_val,
        Diff = diff_val,
        `Boot T value` = boot_t_val,
        `Boot P Value` = boot_p_val
      )
    }
    out
  }

  lv_lm <- normalise_cvpat_lv_matrix(result$CVPAT_compare_LM %||% result$cvpat_compare_lm, "LM")
  lv_ia <- normalise_cvpat_lv_matrix(result$CVPAT_compare_IA %||% result$cvpat_compare_ia, "IA")

  mv_ia <- list()
  mv_lm <- list()

  if (!is.null(cv_res) && length(cv_res$indicators) > 0) {
    indicators <- cv_res$indicators
    prediction_indicator_aliases <- core$prediction_indicator_aliases %||% list()
    set.seed(prediction_seed)

    for (ind in indicators) {
      alias_details <- prediction_indicator_aliases[[ind]]
      indicator_label <- if (is.null(alias_details)) {
        ind
      } else if (as.character(alias_details$indicator) %in% indicators) {
        sprintf("%s (%s)", as.character(alias_details$indicator), as.character(alias_details$construct))
      } else {
        as.character(alias_details$indicator)
      }

      pls_loss_vec <- suppressWarnings(as.numeric(cv_res$mv$pls_loss[[ind]]))
      ia_loss_vec <- suppressWarnings(as.numeric(cv_res$mv$ia_loss[[ind]]))
      lm_loss_vec <- suppressWarnings(as.numeric(cv_res$mv$lm_loss[[ind]]))

      valid_ia <- is.finite(pls_loss_vec) & is.finite(ia_loss_vec)
      if (sum(valid_ia) >= 2L) {
        pls_loss_ia <- mean(pls_loss_vec[valid_ia])
        ia_loss_mean <- mean(ia_loss_vec[valid_ia])
        diff_ia <- pls_loss_ia - ia_loss_mean
      } else {
        pls_loss_ia <- NA_real_
        ia_loss_mean <- NA_real_
        diff_ia <- NA_real_
      }

      valid_lm <- is.finite(pls_loss_vec) & is.finite(lm_loss_vec)
      if (sum(valid_lm) >= 2L) {
        pls_loss_lm <- mean(pls_loss_vec[valid_lm])
        lm_loss_mean <- mean(lm_loss_vec[valid_lm])
        diff_lm <- pls_loss_lm - lm_loss_mean
      } else {
        pls_loss_lm <- NA_real_
        lm_loss_mean <- NA_real_
        diff_lm <- NA_real_
      }

      boot_ia <- run_cvpat_bootstrap_comparison(pls_loss_vec, ia_loss_vec, nboot = nboot, testtype = "two.sided")
      boot_lm <- run_cvpat_bootstrap_comparison(pls_loss_vec, lm_loss_vec, nboot = nboot, testtype = "two.sided")

      mv_ia[[length(mv_ia) + 1L]] <- list(
        Indicator = indicator_label,
        `PLS Loss` = scalar(pls_loss_ia),
        `IA Loss` = scalar(ia_loss_mean),
        `Benchmark Loss` = scalar(ia_loss_mean),
        Diff = scalar(diff_ia),
        `Boot T value` = scalar(boot_ia$boot_t),
        `Boot P Value` = scalar(boot_ia$boot_p)
      )

      mv_lm[[length(mv_lm) + 1L]] <- list(
        Indicator = indicator_label,
        `PLS Loss` = scalar(pls_loss_lm),
        `LM Loss` = scalar(lm_loss_mean),
        `Benchmark Loss` = scalar(lm_loss_mean),
        Diff = scalar(diff_lm),
        `Boot T value` = scalar(boot_lm$boot_t),
        `Boot P Value` = scalar(boot_lm$boot_p)
      )
    }
  }

  has_results <- length(lv_ia) > 0 || length(lv_lm) > 0 || length(mv_ia) > 0 || length(mv_lm) > 0
  cvpat_log <- if (has_results) {
    "CVPAT LV results were calculated with seminrExtras::assess_cvpat; MV CVPAT results were derived from case-wise SEMinR prediction losses using the SEMinRExtras bootstrap CVPAT procedure."
  } else {
    "CVPAT ran, but seminrExtras returned no comparison rows. Check whether the model has supported endogenous constructs and no unsupported higher-order prediction setup."
  }

  list(
    status = if (has_results) "computed" else "empty",
    lv_ia = lv_ia,
    lv_lm = lv_lm,
    lv_rows = c(lv_lm, lv_ia),
    mv_ia = mv_ia,
    mv_lm = mv_lm,
    mv_rows = c(mv_lm, mv_ia),
    execution_log = list(list(message = cvpat_log))
  )
}

parse_confidence_level_alpha <- function(confidence_level) {
  if (is.null(confidence_level)) return(0.05)

  raw <- as.character(confidence_level)
  pct <- suppressWarnings(as.numeric(gsub("[^0-9.]", "", raw)))
  if (is.na(pct)) return(0.05)

  if (pct > 1) {
    alpha <- 1 - (pct / 100)
  } else {
    alpha <- 1 - pct
  }

  if (!is.finite(alpha) || alpha <= 0 || alpha >= 1) return(0.05)
  alpha
}

bootstrap_interval_labels <- function(alpha, suffix = "") {
  lower <- alpha / 2 * 100
  upper <- 100 - lower
  c(
    sprintf("%s%% CI%s", lower, suffix),
    sprintf("%s%% CI%s", upper, suffix)
  )
}

bias_corrected_interval <- function(values, original, alpha = 0.05) {
  vals <- suppressWarnings(as.numeric(values))
  vals <- vals[is.finite(vals)]
  original <- suppressWarnings(as.numeric(original))[1]
  if (length(vals) < 2 || !is.finite(original)) return(c(NA_real_, NA_real_))

  prop_less <- mean(vals < original)
  n <- length(vals)
  prop_less <- min(max(prop_less, 1 / (2 * n)), 1 - (1 / (2 * n)))
  z0 <- stats::qnorm(prop_less)
  probs <- stats::pnorm(2 * z0 + stats::qnorm(c(alpha / 2, 1 - alpha / 2)))
  probs <- c(
    min(1, max(0, probs[[1]])),
    min(1, max(0, probs[[2]]))
  )
  as.numeric(stats::quantile(vals, probs = probs, na.rm = TRUE, names = FALSE, type = 6))
}

add_bias_corrected_intervals <- function(summary_table, original_matrix, boot_array, alpha = 0.05) {
  if (is.null(summary_table) || is.null(original_matrix) || is.null(boot_array)) return(summary_table)
  if (is.null(dim(original_matrix)) || is.null(dim(boot_array)) || length(dim(boot_array)) < 3L) return(summary_table)

  df <- as.data.frame(summary_table, stringsAsFactors = FALSE, check.names = FALSE)
  if (!nrow(df)) return(summary_table)

  original <- as.matrix(original_matrix)
  original[is.na(original)] <- 0
  if (nrow(original) != dim(boot_array)[1] || ncol(original) != dim(boot_array)[2]) return(summary_table)

  lower <- c()
  upper <- c()
  for (i in seq_len(nrow(original))) {
    for (j in seq_len(ncol(original))) {
      if (original[i, j] != 0) {
        interval <- bias_corrected_interval(boot_array[i, j, ], original[i, j], alpha)
        lower <- append(lower, interval[[1]])
        upper <- append(upper, interval[[2]])
      }
    }
  }

  if (length(lower) != nrow(df) || length(upper) != nrow(df)) return(summary_table)

  labels <- bootstrap_interval_labels(alpha, " (BC)")
  df[[labels[[1]]]] <- lower
  df[[labels[[2]]]] <- upper
  rownames(df) <- rownames(summary_table)
  df
}

standardize_data <- function(df) {
  out <- df
  numeric_cols <- vapply(out, is.numeric, logical(1))
  if (any(numeric_cols)) {
    out[numeric_cols] <- scale(out[numeric_cols])
  }
  out
}

to_numeric_frame <- function(df) {
  out <- df

  normalize_numeric_text <- function(value) {
    raw <- trimws(as.character(value %||% ""))
    if (!nzchar(raw)) return("")

    compact <- gsub("[[:space:]\u00A0']", "", raw, perl = TRUE)
    if (!nzchar(compact)) return("")

    has_comma <- grepl(",", compact, fixed = TRUE)
    has_dot <- grepl(".", compact, fixed = TRUE)
    candidate <- compact

    should_treat_as_thousands <- function(integer_part, decimal_part) {
      compact_integer <- sub("^[+-]", "", integer_part)
      grepl("^[0-9]+$", compact_integer) &&
        grepl("^[0-9]+$", decimal_part) &&
        nchar(decimal_part) == 3L &&
        nchar(compact_integer) > 0L &&
        !grepl("^0+$", compact_integer)
    }

    if (has_comma && has_dot) {
      comma_positions <- gregexpr(",", candidate, fixed = TRUE)[[1]]
      dot_positions <- gregexpr(".", candidate, fixed = TRUE)[[1]]
      last_comma <- if (comma_positions[1] > 0L) tail(comma_positions, 1) else -1L
      last_dot <- if (dot_positions[1] > 0L) tail(dot_positions, 1) else -1L
      decimal_separator <- if (last_comma > last_dot) "," else "."
      thousands_separator <- if (decimal_separator == ",") "." else ","
      candidate <- gsub(if (thousands_separator == ".") "\\." else ",", "", candidate)
      if (decimal_separator == ",") {
        decimal_index <- tail(gregexpr(",", candidate, fixed = TRUE)[[1]], 1)
        candidate <- paste0(
          gsub(",", "", substr(candidate, 1, decimal_index - 1L), fixed = TRUE),
          ".",
          substr(candidate, decimal_index + 1L, nchar(candidate))
        )
      } else {
        decimal_index <- tail(gregexpr(".", candidate, fixed = TRUE)[[1]], 1)
        candidate <- paste0(
          gsub("\\.", "", substr(candidate, 1, decimal_index - 1L)),
          ".",
          substr(candidate, decimal_index + 1L, nchar(candidate))
        )
      }
    } else if (has_comma) {
      parts <- strsplit(candidate, ",", fixed = TRUE)[[1]]
      decimal_part <- parts[length(parts)] %||% ""
      integer_part <- paste(parts[seq_len(max(length(parts) - 1L, 0L))], collapse = "")
      candidate <- if (should_treat_as_thousands(integer_part, decimal_part)) {
        paste0(integer_part, decimal_part)
      } else {
        paste0(integer_part, ".", decimal_part)
      }
    } else if (length(gregexpr(".", candidate, fixed = TRUE)[[1]]) > 1L) {
      parts <- strsplit(candidate, ".", fixed = TRUE)[[1]]
      decimal_part <- parts[length(parts)] %||% ""
      integer_part <- paste(parts[seq_len(max(length(parts) - 1L, 0L))], collapse = "")
      candidate <- if (should_treat_as_thousands(integer_part, decimal_part)) {
        paste0(integer_part, decimal_part)
      } else {
        paste0(integer_part, ".", decimal_part)
      }
    }

    if (!grepl("^[+-]?((([0-9]+\\.?[0-9]*)|(\\.[0-9]+))([eE][+-]?[0-9]+)?)$", candidate)) {
      return(compact)
    }

    candidate
  }

  coerce_numeric_vector <- function(values) {
    raw_values <- as.character(values)
    converted <- suppressWarnings(as.numeric(raw_values))
    needs_locale_parse <- is.na(converted) & nzchar(trimws(raw_values))
    if (any(needs_locale_parse)) {
      normalized_values <- vapply(raw_values[needs_locale_parse], normalize_numeric_text, character(1), USE.NAMES = FALSE)
      converted[needs_locale_parse] <- suppressWarnings(as.numeric(normalized_values))
    }
    converted
  }

  for (n in names(out)) {
    if (!is.numeric(out[[n]])) {
      converted <- coerce_numeric_vector(out[[n]])
      if (!all(is.na(converted))) out[[n]] <- converted
    }
  }
  out
}

compute_regression_r2 <- function(response_vector, predictors_df) {
  if (is.null(predictors_df) || !ncol(predictors_df)) return(NULL)

  reg_df <- data.frame(
    .metis_response = suppressWarnings(as.numeric(response_vector)),
    to_numeric_frame(as.data.frame(predictors_df, stringsAsFactors = FALSE, check.names = FALSE)),
    check.names = FALSE
  )
  reg_df <- reg_df[stats::complete.cases(reg_df), , drop = FALSE]
  if (nrow(reg_df) <= (ncol(reg_df) - 1L)) return(NULL)

  x <- as.matrix(reg_df[, setdiff(colnames(reg_df), ".metis_response"), drop = FALSE])
  if (!ncol(x)) return(NULL)

  design <- cbind(`(Intercept)` = 1, x)
  fit <- tryCatch(
    stats::lm.fit(x = design, y = reg_df$.metis_response),
    error = function(e) NULL
  )
  if (is.null(fit)) return(NULL)

  residuals <- suppressWarnings(as.numeric(fit$residuals))
  y <- reg_df$.metis_response
  rss <- sum(residuals^2, na.rm = TRUE)
  tss <- sum((y - mean(y, na.rm = TRUE))^2, na.rm = TRUE)
  if (!is.finite(rss) || !is.finite(tss) || tss <= 0) return(NULL)

  r2 <- 1 - (rss / tss)
  if (!is.finite(r2) || is.na(r2)) return(NULL)
  max(0, min(1, r2))
}

read_dataset <- function(file_path) {
  assert_dataset_path_allowed(file_path)

  if (!file.exists(file_path)) {
    stop(sprintf("Dataset not found: %s", file_path))
  }

  file_size <- suppressWarnings(as.numeric(file.info(file_path)$size[[1]]))
  if (!is.na(file_size) && file_size > max_dataset_bytes) {
    stop(sprintf("Dataset file exceeds the %s MB safety limit.", round(max_dataset_bytes / (1024 * 1024))))
  }

  ext <- tolower(tools::file_ext(file_path))
  row_read_limit <- as.integer(max_dataset_rows + 1L)
  data <- NULL

  if (ext %in% c("csv", "txt")) {
    data <- utils::read.csv(
      file_path,
      check.names = FALSE,
      stringsAsFactors = FALSE,
      nrows = row_read_limit
    )
  }

  if (is.null(data) && ext %in% c("xlsx", "xls")) {
    if (!requireNamespace("readxl", quietly = TRUE)) {
      stop("Package 'readxl' is required to read Excel files.")
    }
    data <- as.data.frame(readxl::read_excel(file_path, n_max = row_read_limit))
  }

  if (is.null(data)) {
    stop(sprintf("Unsupported dataset extension: %s", ext))
  }

  assert_dataset_shape_allowed(data)
  data
}

# Collect the leaf (manifest) indicators for a construct, recursing through the
# dimensions of higher-order constructs. Used by standalone Repeated Indicators
# estimation and Embedded Stage 1.
# The same traversal maps leaf indicators back to LOCs in HOC reporting.
# The `seen` guard prevents infinite recursion on malformed/cyclic dimensions.
gather_leaf_indicators <- function(name, by_name, seen = character(0)) {
  name <- as.character(name)
  if (!nzchar(name) || name %in% seen) return(character(0))
  seen <- c(seen, name)
  con <- by_name[[name]]
  if (is.null(con)) return(character(0))
  if (isTRUE(con$is_higher_order)) {
    dims <- unlist(con$dimensions)
    dims <- dims[!is.na(dims) & nzchar(dims)]
    items <- unlist(lapply(dims, function(d) gather_leaf_indicators(d, by_name, seen)), use.names = FALSE)
  } else {
    items <- unlist(lapply(con$indicators, function(it) as.character(it)), use.names = FALSE)
  }
  items <- items[!is.na(items) & nzchar(items)]
  unique(items)
}

build_measurement <- function(
  constructs_payload,
  algorithm = "standard",
  interactions_payload = list(),
  hoc_method = "Two-stage"
) {
  algorithm <- tolower(as.character(algorithm))
  if (!(algorithm %in% c("standard", "consistent"))) {
    algorithm <- "standard"
  }
  hoc_method <- normalize_hoc_settings(list(hocMethod = hoc_method))$hocMethod

  by_name <- list()
  for (con in constructs_payload) {
    con_name <- as.character(con$name)
    if (nzchar(con_name)) by_name[[con_name]] <- con
  }

  defs <- lapply(constructs_payload, function(con) {
    con_name <- as.character(con$name)
    is_hoc <- isTRUE(con$is_higher_order)

    if (is_hoc) {
      dimensions <- unlist(con$dimensions)
      dimensions <- dimensions[!is.na(dimensions) & nzchar(dimensions)]
      if (!length(dimensions)) {
        stop(sprintf("Higher-order construct '%s' has no lower-order dimensions.", con_name))
      }
      hoc_type <- tolower(as.character(con$higher_order_type %||% "reflective"))
      hoc_weights <- if (hoc_type == "formative") seminr::mode_B else seminr::mode_A

      if (identical(hoc_method, "Repeated indicators")) {
        leaf_items <- gather_leaf_indicators(con_name, by_name)
        if (!length(leaf_items)) {
          stop(sprintf("Higher-order construct '%s' has no leaf indicators.", con_name))
        }
        seminr::composite(con_name, leaf_items, weights = hoc_weights)
      } else {
        seminr::higher_composite(
          con_name,
          dimensions = dimensions,
          method = seminr::two_stage,
          weights = hoc_weights
        )
      }
    } else {
      con_type <- tolower(as.character(con$type))
      items <- unlist(lapply(con$indicators, function(it) as.character(it)), use.names = FALSE)
      items <- items[!is.na(items) & nzchar(items)]

      if (!length(items)) {
        stop(sprintf("Construct '%s' has no indicators.", con_name))
      }

      if (length(items) == 1L) {
        single_item_spec <- seminr::single_item(items[[1]])
        if (con_type == "formative") {
          seminr::composite(con_name, single_item_spec, weights = seminr::mode_B)
        } else if (algorithm == "consistent") {
          seminr::reflective(con_name, single_item_spec)
        } else {
          seminr::composite(con_name, single_item_spec, weights = seminr::mode_A)
        }
      } else if (con_type == "formative") {
        seminr::composite(con_name, items, weights = seminr::mode_B)
      } else {
        if (algorithm == "consistent") {
          seminr::reflective(con_name, items)
        } else {
          seminr::composite(con_name, items, weights = seminr::mode_A)
        }
      }
    }
  })

  # The same IV x moderator can moderate several outcomes; the frontend sends one
  # interaction entry per outcome (same iv*moderator, different outcome). Each
  # interaction term must be created only ONCE — defining the same iv*moderator term
  # twice makes seminr throw "subscript out of bounds". The structural paths reference
  # the single interaction construct by name for each outcome.
  # Collect the UNIQUE pairs as plain data here, then build the terms with lapply:
  # seminr::interaction_term() returns a closure that captures iv/moderator, and a
  # for-loop would make every closure share the last iteration's values
  # ("missing value where TRUE/FALSE needed"). lapply gives each its own frame.
  seen_interaction_keys <- character(0)
  unique_interactions <- list()
  for (interaction in interactions_payload %||% list()) {
    iv <- as.character(interaction$iv %||% interaction$from %||% "")
    moderator <- as.character(interaction$moderator %||% "")
    if (!nzchar(iv) || !nzchar(moderator)) next
    key <- paste0(iv, "*", moderator)
    if (key %in% seen_interaction_keys) next
    seen_interaction_keys <- c(seen_interaction_keys, key)
    unique_interactions[[length(unique_interactions) + 1L]] <- list(iv = iv, moderator = moderator)
  }
  interaction_defs <- lapply(unique_interactions, function(pair) {
    iv <- pair$iv
    moderator <- pair$moderator
    seminr::interaction_term(iv = iv, moderator = moderator, method = seminr::two_stage)
  })

  all_defs <- c(defs, interaction_defs)
  do.call(seminr::constructs, all_defs)
}

build_structural <- function(paths_payload) {
  defs <- lapply(paths_payload, function(p) {
    seminr::paths(from = as.character(p$from), to = as.character(p$to))
  })
  do.call(seminr::relationships, defs)
}

extract_path_results <- function(model, input_paths) {
  path_matrix <- model$path_coef
  results <- list()
  already_covered <- character(0)

  if (!is.null(path_matrix)) {
    for (p in input_paths %||% list()) {
      from <- as.character(p$from)
      to <- as.character(p$to)
      coef <- NA_real_

      if (from %in% rownames(path_matrix) && to %in% colnames(path_matrix)) {
        coef <- safe_num(path_matrix[from, to])
      }
      if ((is.null(coef) || is.na(coef)) && to %in% rownames(path_matrix) && from %in% colnames(path_matrix)) {
        coef <- safe_num(path_matrix[to, from])
      }
      if (is.null(coef) || is.na(coef)) coef <- NULL

      results[[length(results) + 1L]] <- list(from = from, to = to, coefficient = coef)
      already_covered <- c(already_covered, paste0(from, ":::", to))
    }

    row_names <- rownames(path_matrix) %||% character()
    col_names <- colnames(path_matrix) %||% character()

    for (r_name in row_names) {
      for (c_name in col_names) {
        val <- safe_num(path_matrix[r_name, c_name])
        if (!is.null(val) && !is.na(val) && val != 0) {
          key <- paste0(r_name, ":::", c_name)
          if (!(key %in% already_covered)) {
            already_covered <- c(already_covered, key)
            results[[length(results) + 1L]] <- list(from = r_name, to = c_name, coefficient = val)
          }
        }
      }
    }
  }

  results
}

has_meaningful_vif_predictor_names <- function(rows) {
  if (!length(rows)) return(FALSE)

  ignored <- c("row", "row_name", "rowname", "row name", "endogenous", "construct", "method")
  for (row in rows) {
    keys <- names(row)
    if (is.null(keys) || !length(keys)) next
    predictors <- keys[!(tolower(keys) %in% ignored)]
    predictors <- predictors[nzchar(predictors)]
    if (!length(predictors)) next
    if (any(!grepl("^[0-9]+$", predictors))) return(TRUE)
  }

  FALSE
}

extract_r2_results <- function(summary_obj, constructs_payload, input_paths = list(), data = NULL) {
  construct_names <- unlist(lapply(constructs_payload, function(c) as.character(c$name)), use.names = FALSE)
  endogenous_names <- unique(unlist(lapply(input_paths, function(p) as.character(p$to)), use.names = FALSE))
  endogenous_names <- endogenous_names[endogenous_names %in% construct_names]
  if (!length(endogenous_names)) {
    endogenous_names <- construct_names
  }

  normalize_metric_name <- function(x) {
    gsub("[^a-z0-9]+", "", tolower(as.character(x %||% "")))
  }

  extract_metric_from_matrix <- function(mat, candidates) {
    empty <- setNames(vector("list", length(endogenous_names)), endogenous_names)
    if (is.null(mat) || !(is.matrix(mat) || is.data.frame(mat))) return(empty)

    df <- as.data.frame(mat, stringsAsFactors = FALSE, check.names = FALSE)
    row_ids <- rownames(df) %||% character()
    col_ids <- colnames(df) %||% character()
    normalized_candidates <- unique(normalize_metric_name(candidates))

    find_metric_index <- function(ids) {
      if (is.null(ids) || !length(ids)) return(NA_integer_)
      matched <- which(normalize_metric_name(ids) %in% normalized_candidates)
      if (!length(matched)) return(NA_integer_)
      matched[1]
    }

    values <- empty

    row_idx <- find_metric_index(row_ids)
    if (!is.na(row_idx)) {
      for (name in endogenous_names) {
        if (!name %in% col_ids) next
        val <- safe_num(df[row_idx, name, drop = TRUE])
        if (!is.null(val) && is.finite(val)) values[[name]] <- val
      }
    }

    col_idx <- find_metric_index(col_ids)
    if (!is.na(col_idx)) {
      for (name in endogenous_names) {
        if (!is.null(values[[name]]) || !name %in% row_ids) next
        val <- safe_num(df[name, col_idx, drop = TRUE])
        if (!is.null(val) && is.finite(val)) values[[name]] <- val
      }
    }

    values
  }

  merge_metric_values <- function(candidates, matrices) {
    merged <- setNames(vector("list", length(endogenous_names)), endogenous_names)
    for (mat in matrices) {
      extracted <- extract_metric_from_matrix(mat, candidates)
      for (name in endogenous_names) {
        if (!is.null(merged[[name]]) || is.null(extracted[[name]])) next
        merged[[name]] <- extracted[[name]]
      }
    }
    merged
  }

  candidate_matrices <- list(
    summary_obj$paths,
    summary_obj$it_criteria,
    summary_obj$model_fit,
    summary_obj$validity
  )

  r2_vals <- merge_metric_values(
    c("R^2", "R2", "r2", "R square", "R-square"),
    candidate_matrices
  )
  r2_adj_vals <- merge_metric_values(
    c("AdjR^2", "AdjR2", "Adj R^2", "Adj R2", "AdjR square", "Adj R square", "R^2 Adjusted", "R2 Adjusted", "R^2 Adj", "R2 Adj", "Adjusted R^2", "Adjusted R2", "R2_adj", "R2adj", "R square adjusted", "R-square adjusted"),
    candidate_matrices
  )

  predictor_counts <- vapply(endogenous_names, function(name) {
    unique_predictors <- unique(unlist(lapply(input_paths, function(path) {
      target <- as.character(path$to %||% "")
      if (!nzchar(target) || target != name) return(NULL)
      as.character(path$from %||% "")
    }), use.names = FALSE))
    unique_predictors <- unique_predictors[nzchar(unique_predictors)]
    length(unique_predictors)
  }, integer(1))

  n_obs <- if (!is.null(data) && is.data.frame(data)) nrow(data) else NA_integer_

  lapply(endogenous_names, function(name) {
    r2_val <- r2_vals[[name]]
    r2_adj_val <- r2_adj_vals[[name]]

    if (is.null(r2_adj_val) && !is.null(r2_val) && is.finite(n_obs)) {
      k <- predictor_counts[[name]]
      if (!is.null(k) && k > 0 && n_obs > (k + 1)) {
        r2_adj_val <- 1 - ((1 - r2_val) * ((n_obs - 1) / (n_obs - k - 1)))
      }
    }

    list(construct = name, r2 = r2_val, r2_adjusted = r2_adj_val)
  })
}

prepare_payload <- function(req) {
  if (!requireNamespace("jsonlite", quietly = TRUE)) {
    stop("Package 'jsonlite' is required by the API runtime.")
  }
  if (!requireNamespace("seminr", quietly = TRUE)) {
    stop("Package 'seminr' is not installed in the bundled R runtime.")
  }

  request_body <- req$postBody
  if (!is_scalar_string(request_body) || !nzchar(trimws(request_body))) {
    stop("Request body must be a non-empty JSON string.")
  }

  raw_payload <- jsonlite::fromJSON(request_body, simplifyVector = FALSE)
  payload <- validate_payload_object(raw_payload)
  dataset_path <- as.character(payload$datasetPath)
  data <- read_dataset(dataset_path)

  permutation_fields <- c("groupingVariable", "groupA", "groupB", "permutations", "alpha", "seed")
  if (all(permutation_fields %in% names(raw_payload))) {
    construct_names <- vapply(payload$constructs, function(con) con$name, character(1), USE.NAMES = FALSE)
    payload <- c(payload, validate_permutation_analysis_payload(raw_payload, construct_names, colnames(data)))
  }
  multi_group_fields <- c("groupingVariable", "groupA", "groupB", "nboot", "alpha", "seed")
  if (all(multi_group_fields %in% names(raw_payload))) {
    construct_names <- vapply(payload$constructs, function(con) con$name, character(1), USE.NAMES = FALSE)
    payload <- c(payload, validate_multi_group_analysis_payload(
      raw_payload,
      construct_names,
      colnames(data),
      normalized_constructs = payload$constructs
    ))
  }

  used_items <- unique(unlist(
    lapply(payload$constructs, function(c) unlist(lapply(c$indicators, as.character), use.names = FALSE)),
    use.names = FALSE
  ))
  missing_items <- setdiff(used_items, colnames(data))
  if (length(missing_items)) {
    stop(sprintf("Dataset is missing indicator columns: %s", paste(missing_items, collapse = ", ")))
  }

  list(payload = payload, data = data)
}

.metis_pls_core_cache <- new.env(hash = TRUE, parent = emptyenv())
.metis_pls_core_cache_order <- character(0)

normalize_cache_value <- function(value) {
  if (is.factor(value)) return(as.character(value))
  if (!is.list(value)) return(value)

  if (!is.null(names(value)) && length(names(value)) && all(nzchar(names(value)))) {
    value <- value[sort(names(value), method = "radix")]
  }

  lapply(value, normalize_cache_value)
}

dataset_cache_signature <- function(dataset_path) {
  normalized_path <- normalize_local_path(dataset_path)
  info <- suppressWarnings(file.info(normalized_path))
  md5 <- tryCatch(
    unname(as.character(tools::md5sum(normalized_path))),
    error = function(e) NA_character_
  )

  list(
    path = normalized_path,
    size = if (!is.null(info$size) && !is.na(info$size)) as.numeric(info$size) else NA_real_,
    mtime = if (!is.null(info$mtime) && !is.na(info$mtime)) as.numeric(info$mtime) else NA_real_,
    md5 = md5
  )
}

pls_core_cache_key <- function(payload) {
  cache_payload <- list(
    dataset = dataset_cache_signature(payload$datasetPath),
    constructs = payload$constructs,
    paths = payload$paths,
    interactions = payload$interactions,
    algorithm = payload$algorithm,
    algorithmSettings = payload$algorithmSettings
  )

  cache_json <- jsonlite::toJSON(
    normalize_cache_value(cache_payload),
    auto_unbox = TRUE,
    null = "null",
    digits = NA
  )

  if (requireNamespace("digest", quietly = TRUE)) {
    return(digest::digest(cache_json, algo = "md5", serialize = FALSE))
  }

  cache_json
}

remember_pls_core_cache_key <- function(cache_key) {
  .metis_pls_core_cache_order <<- c(cache_key, setdiff(.metis_pls_core_cache_order, cache_key))

  while (length(.metis_pls_core_cache_order) > max_cached_pls_cores) {
    evicted_key <- tail(.metis_pls_core_cache_order, 1)
    rm(list = evicted_key, envir = .metis_pls_core_cache)
    .metis_pls_core_cache_order <<- head(.metis_pls_core_cache_order, -1)
  }
}

get_cached_pls_core <- function(payload, data) {
  if (max_cached_pls_cores == 0L) {
    return(run_pls_core(payload, data))
  }

  cache_key <- pls_core_cache_key(payload)
  if (exists(cache_key, envir = .metis_pls_core_cache, inherits = FALSE)) {
    remember_pls_core_cache_key(cache_key)
    return(get(cache_key, envir = .metis_pls_core_cache, inherits = FALSE))
  }

  core <- run_pls_core(payload, data)
  assign(cache_key, core, envir = .metis_pls_core_cache)
  remember_pls_core_cache_key(cache_key)
  core
}

ensure_moderator_main_effects <- function(paths_payload, interactions_payload) {
  if (!length(interactions_payload)) return(paths_payload)
  existing_keys <- vapply(paths_payload, function(p) {
    paste0(as.character(p$from %||% ""), "|", as.character(p$to %||% ""))
  }, character(1))
  extra <- list()
  for (interaction in interactions_payload) {
    moderator <- as.character(interaction$moderator %||% "")
    outcome   <- as.character(interaction$outcome   %||% "")
    if (!nzchar(moderator) || !nzchar(outcome)) next
    key <- paste0(moderator, "|", outcome)
    if (!(key %in% existing_keys)) {
      extra <- c(extra, list(list(from = moderator, to = outcome)))
      existing_keys <- c(existing_keys, key)
    }
  }
  c(paths_payload, extra)
}

# --- Isolated per-moderator R² Change helpers --------------------------------
# These helpers produce per-interaction delta-R² and f² values by fitting
# separate models: one baseline (main effects only) and one per interaction
# (baseline + that single interaction term). This avoids the collinearity
# dilution that occurs when multiple correlated interaction terms share the
# same DV in a joint model.

strip_all_interactions <- function(payload) {
  interaction_path_froms <- character(0)
  for (interaction in payload$interactions %||% list()) {
    iv <- as.character(interaction$iv %||% "")
    moderator <- as.character(interaction$moderator %||% "")
    if (nzchar(iv) && nzchar(moderator)) {
      interaction_path_froms <- c(interaction_path_froms, paste0(iv, "*", moderator))
    }
  }

  filtered_paths <- Filter(function(p) {
    from <- as.character(p$from %||% "")
    !(from %in% interaction_path_froms)
  }, payload$paths %||% list())

  result <- payload
  result$interactions <- list()
  result$paths <- filtered_paths
  result
}

isolate_single_interaction <- function(payload, target_interaction) {
  target_iv <- as.character(target_interaction$iv %||% "")
  target_mod <- as.character(target_interaction$moderator %||% "")
  target_from <- paste0(target_iv, "*", target_mod)

  other_interaction_froms <- character(0)
  for (interaction in payload$interactions %||% list()) {
    iv <- as.character(interaction$iv %||% "")
    moderator <- as.character(interaction$moderator %||% "")
    candidate_from <- paste0(iv, "*", moderator)
    if (candidate_from != target_from && nzchar(iv) && nzchar(moderator)) {
      other_interaction_froms <- c(other_interaction_froms, candidate_from)
    }
  }

  filtered_paths <- Filter(function(p) {
    from <- as.character(p$from %||% "")
    !(from %in% other_interaction_froms)
  }, payload$paths %||% list())

  result <- payload
  result$interactions <- list(target_interaction)
  result$paths <- filtered_paths
  result
}

effect_size_label <- function(f2) {
  if (is.null(f2) || !is.finite(f2)) return("Not available")
  if (f2 >= 0.35) return("Large")
  if (f2 >= 0.15) return("Medium")
  if (f2 >= 0.02) return("Small")
  "Negligible"
}

compute_isolated_moderation_r2 <- function(payload, data, timings, use_cache = TRUE) {
  interactions <- payload$interactions %||% list()
  if (!length(interactions)) return(list())
  fit_pls_core <- if (isTRUE(use_cache)) get_cached_pls_core else run_pls_core

  # 1. Baseline fit (main effects only, zero interactions)
  baseline_payload <- strip_all_interactions(payload)
  baseline_core <- timed_or_direct(timings, "isolated baseline pls core", {
    tryCatch(
      fit_pls_core(baseline_payload, data),
      error = function(e) NULL
    )
  })
  if (is.null(baseline_core)) return(list())

  baseline_r2_list <- extract_r2_results(
    baseline_core$summary, payload$constructs, baseline_payload$paths, data
  )
  r2_baseline_by_dv <- list()
  for (entry in baseline_r2_list) {
    if (!is.null(entry$r2) && is.finite(entry$r2)) {
      r2_baseline_by_dv[[entry$construct]] <- entry$r2
    }
  }

  # 2. One fit per interaction
  rows <- list()
  for (interaction in interactions) {
    iv <- as.character(interaction$iv %||% "")
    moderator <- as.character(interaction$moderator %||% "")
    outcome <- as.character(interaction$outcome %||% "")
    if (!nzchar(iv) || !nzchar(moderator) || !nzchar(outcome)) next

    interaction_label <- paste0(iv, "*", moderator)
    phase_label <- paste0("isolated fit: ", interaction_label, " -> ", outcome)

    iso_payload <- isolate_single_interaction(payload, interaction)
    iso_core <- timed_or_direct(timings, phase_label, {
      tryCatch({
        fit_pls_core(iso_payload, data)
      }, error = function(e) NULL)
    })

    r2_with <- NA_real_
    if (!is.null(iso_core)) {
      iso_r2_list <- extract_r2_results(
        iso_core$summary, payload$constructs, iso_payload$paths, data
      )
      for (entry in iso_r2_list) {
        if (identical(entry$construct, outcome) && !is.null(entry$r2) && is.finite(entry$r2)) {
          r2_with <- entry$r2
          break
        }
      }
    }

    r2_without <- r2_baseline_by_dv[[outcome]] %||% NA_real_

    if (is.finite(r2_with) && is.finite(r2_without)) {
      delta_r2 <- r2_with - r2_without
      f2 <- if (r2_with < 1) delta_r2 / (1 - r2_with) else NA_real_
    } else {
      delta_r2 <- NA_real_
      f2 <- NA_real_
    }

    rows[[length(rows) + 1L]] <- list(
      iv = iv,
      moderator = moderator,
      outcome = outcome,
      interaction = interaction_label,
      r2_with = if (is.finite(r2_with)) r2_with else NULL,
      r2_without = if (is.finite(r2_without)) r2_without else NULL,
      delta_r2 = if (is.finite(delta_r2)) delta_r2 else NULL,
      f2 = if (is.finite(f2)) f2 else NULL,
      effect_size = effect_size_label(f2)
    )
  }

  rows
}
# --- End isolated per-moderator R² Change helpers ----------------------------

has_higher_order_construct <- function(payload) {
  constructs <- payload$constructs %||% list()
  any(vapply(constructs, function(con) isTRUE(con$is_higher_order), logical(1)))
}

micom_hoc_unavailable_message <- paste0(
  "MICOM is currently not available for models containing higher-order constructs. ",
  "Run MICOM on a model without higher-order constructs."
)

assert_micom_payload_supported <- function(payload) {
  if (has_higher_order_construct(payload)) {
    stop(micom_hoc_unavailable_message, call. = FALSE)
  }
  TRUE
}

resolve_missing_data_handler <- function(label) {
  normalized <- tolower(trimws(as.character(label %||% "Mean replacement")))
  if (grepl("listwise", normalized)) {
    return(function(data) data[stats::complete.cases(data), , drop = FALSE])
  }
  if (grepl("median", normalized)) {
    return(function(data) {
      out <- data
      for (column in names(out)) {
        values <- suppressWarnings(as.numeric(out[[column]]))
        if (anyNA(values)) {
          replacement <- stats::median(values, na.rm = TRUE)
          if (is.finite(replacement)) values[is.na(values)] <- replacement
          out[[column]] <- values
        }
      }
      out
    })
  }
  seminr::mean_replacement
}

resolve_pls_estimation_settings <- function(payload) {
  settings <- payload$algorithmSettings %||% list()
  inner_label <- tolower(as.character(settings$innerWeighting %||% "Path weighting scheme"))
  inner_weights <- if (grepl("factor", inner_label)) {
    get("path_factorial", envir = asNamespace("seminr"))
  } else if (grepl("centroid", inner_label)) {
    # SEMinR 2.5.0 has no public centroid inner-weighting function. Keep the
    # run usable, but expose the requested/applied mismatch in result metadata.
    seminr::path_weighting
  } else {
    seminr::path_weighting
  }
  max_it <- suppressWarnings(as.integer(settings$maxIterations %||% 300L))
  if (is.na(max_it) || max_it < 1L) max_it <- 300L
  stop_raw <- as.character(settings$stopCriterion %||% "1e-7")
  stop_numeric <- suppressWarnings(as.numeric(stop_raw))
  # seminr expresses the convergence threshold as a power of ten (7 means
  # 1e-7), while the Results UI stores the human-readable threshold string.
  stop_criterion <- if (!is.na(stop_numeric) && stop_numeric > 0 && stop_numeric < 1) {
    as.integer(round(-log10(stop_numeric)))
  } else {
    as.integer(round(stop_numeric))
  }
  if (is.na(stop_criterion) || stop_criterion < 1L) stop_criterion <- 7L
  list(
    inner_weights = inner_weights,
    maxIt = max_it,
    stopCriterion = stop_criterion,
    missing = resolve_missing_data_handler(settings$missingData),
    missing_label = settings$missingData %||% "Mean replacement",
    missing_value = NA,
    assess_syntax = isTRUE(settings$assessSyntax),
    initial_weights = settings$initialWeights %||% "1 (uniform)"
  )
}

estimate_pls_model <- function(data, measurement_model, structural_model, estimation_settings) {
  seminr::estimate_pls(
    data = data,
    measurement_model = measurement_model,
    structural_model = structural_model,
    inner_weights = estimation_settings$inner_weights,
    maxIt = estimation_settings$maxIt,
    stopCriterion = estimation_settings$stopCriterion,
    missing = estimation_settings$missing,
    missing_value = estimation_settings$missing_value,
    assess_syntax = estimation_settings$assess_syntax
  )
}

extract_embedded_stage1_scores <- function(model, constructs_payload) {
  base_scores <- as.data.frame(
    model$construct_scores %||% model$composite_scores,
    stringsAsFactors = FALSE,
    check.names = FALSE
  )
  if (is.null(base_scores) || !nrow(base_scores)) {
    stop("SEMinR did not return construct scores for embedded two-stage estimation.")
  }

  required_scores <- unique(vapply(
    constructs_payload %||% list(),
    function(con) as.character(con$name),
    character(1),
    USE.NAMES = FALSE
  ))
  missing_scores <- setdiff(required_scores, colnames(base_scores))
  if (length(missing_scores)) {
    stop(sprintf(
      "Embedded two-stage Stage 1 is missing required construct scores from SEMinR: %s.",
      paste(missing_scores, collapse = ", ")
    ))
  }

  base_scores
}

build_repeated_indicator_hoc_paths <- function(payload, original_paths = payload$paths %||% list()) {
  stage1_paths <- original_paths %||% list()
  existing_keys <- vapply(stage1_paths, function(path) {
    paste0(as.character(path$from %||% ""), "|", as.character(path$to %||% ""))
  }, character(1), USE.NAMES = FALSE)

  for (hoc in Filter(function(con) isTRUE(con$is_higher_order), payload$constructs %||% list())) {
    hoc_name <- as.character(hoc$name)
    hoc_type <- tolower(as.character(hoc$higher_order_type %||% "reflective"))
    dimensions <- unique(as.character(unlist(hoc$dimensions %||% list(), use.names = FALSE)))
    dimensions <- dimensions[!is.na(dimensions) & nzchar(dimensions)]

    for (dimension in dimensions) {
      path <- if (identical(hoc_type, "formative")) {
        list(from = dimension, to = hoc_name)
      } else {
        list(from = hoc_name, to = dimension)
      }
      key <- paste0(path$from, "|", path$to)
      if (!(key %in% existing_keys)) {
        stage1_paths[[length(stage1_paths) + 1L]] <- path
        existing_keys <- c(existing_keys, key)
      }
    }
  }

  stage1_paths
}

build_embedded_stage2_payload <- function(payload) {
  hocs <- Filter(function(con) isTRUE(con$is_higher_order), payload$constructs %||% list())
  loc_names <- unique(unlist(lapply(hocs, function(hoc) {
    as.character(unlist(hoc$dimensions %||% list(), use.names = FALSE))
  }), use.names = FALSE))
  loc_names <- loc_names[!is.na(loc_names) & nzchar(loc_names)]

  structural_role_names <- unique(c(
    unlist(lapply(payload$paths %||% list(), function(path) {
      c(as.character(path$from %||% ""), as.character(path$to %||% ""))
    }), use.names = FALSE),
    unlist(lapply(payload$interactions %||% list(), function(interaction) {
      c(
        as.character(interaction$iv %||% ""),
        as.character(interaction$moderator %||% ""),
        as.character(interaction$outcome %||% "")
      )
    }), use.names = FALSE)
  ))
  structural_role_names <- structural_role_names[nzchar(structural_role_names)]

  stage2_sources <- Filter(function(con) {
    con_name <- as.character(con$name)
    isTRUE(con$is_higher_order) ||
      !(con_name %in% loc_names) ||
      con_name %in% structural_role_names
  }, payload$constructs %||% list())

  stage2_constructs <- lapply(stage2_sources, function(con) {
    con_name <- as.character(con$name)
    stage2_con <- con
    stage2_con$is_higher_order <- FALSE
    if (isTRUE(con$is_higher_order)) {
      dimensions <- unlist(con$dimensions)
      dimensions <- dimensions[!is.na(dimensions) & nzchar(dimensions)]
      stage2_con$indicators <- as.list(dimensions)
      stage2_con$type <- con$higher_order_type %||% "reflective"
    } else {
      stage2_con$indicators <- list(con_name)
    }
    stage2_con
  })

  stage2_payload <- payload
  stage2_payload$constructs <- stage2_constructs
  stage2_payload
}

run_pls_core <- function(payload, data) {
  algorithm <- if (!is.null(payload$algorithm)) as.character(payload$algorithm) else "standard"
  estimation_settings <- resolve_pls_estimation_settings(payload)
  hoc_settings <- normalize_hoc_settings(payload$algorithmSettings %||% list())
  # two_stage interactions require the moderator to have a direct structural path to the
  # outcome. The frontend always includes it, but this guard prevents "subscript out of
  # bounds" from seminr if the path is ever absent.
  safe_paths <- ensure_moderator_main_effects(payload$paths, payload$interactions %||% list())
  structural_paths <- if (
    has_higher_order_construct(payload) &&
    identical(hoc_settings$hocMethod, "Repeated indicators")
  ) {
    build_repeated_indicator_hoc_paths(payload, safe_paths)
  } else {
    safe_paths
  }
  structural_model <- build_structural(structural_paths)

  use_embedded <-
    has_higher_order_construct(payload) &&
    identical(hoc_settings$hocMethod, "Two-stage") &&
    identical(hoc_settings$hocTwoStage, "Embedded")

  if (use_embedded) {
    stage1_measurement <- build_measurement(
      payload$constructs,
      algorithm = algorithm,
      interactions_payload = payload$interactions %||% list(),
      hoc_method = "Repeated indicators"
    )
    stage1_structural_model <- build_structural(build_repeated_indicator_hoc_paths(payload, safe_paths))
    stage1_model <- estimate_pls_model(data, stage1_measurement, stage1_structural_model, estimation_settings)
    stage1_scores <- extract_embedded_stage1_scores(stage1_model, payload$constructs)
    stage2_payload <- build_embedded_stage2_payload(payload)
    stage2_measurement <- build_measurement(
      stage2_payload$constructs,
      algorithm = algorithm,
      interactions_payload = stage2_payload$interactions %||% list(),
      hoc_method = "Repeated indicators"
    )
    model <- estimate_pls_model(stage1_scores, stage2_measurement, structural_model, estimation_settings)
    summary_obj <- summary(model)
    return(list(
      model = model,
      summary = summary_obj,
      hoc_settings = hoc_settings,
      hoc_method_label = hoc_method_label(hoc_settings, has_hoc = TRUE),
      stage1_model = stage1_model,
      stage2_payload = stage2_payload
    ))
  }

  measurement_model <- build_measurement(
    payload$constructs,
    algorithm = algorithm,
    interactions_payload = payload$interactions %||% list(),
    hoc_method = hoc_settings$hocMethod
  )
  model <- estimate_pls_model(data, measurement_model, structural_model, estimation_settings)

  summary_obj <- summary(model)
  list(
    model = model,
    summary = summary_obj,
    hoc_settings = hoc_settings,
    hoc_method_label = hoc_method_label(hoc_settings, has_hoc = has_higher_order_construct(payload))
  )
}

# SEMinR's PLSpredict data-frame indexing requires unique manifest column names,
# while repeated-indicator HOCs intentionally reuse LOC indicators. Alias only the
# repeated prediction columns, then prove the fitted paths and scores are unchanged.
build_repeated_indicator_prediction_core <- function(payload, core) {
  model <- core$model
  mm_matrix <- as.matrix(model$mmMatrix)
  if (is.null(mm_matrix) || !nrow(mm_matrix) || !("measurement" %in% colnames(mm_matrix))) {
    return(core)
  }

  measurements <- as.character(mm_matrix[, "measurement"])
  duplicate_rows <- which(duplicated(measurements))
  if (!length(duplicate_rows)) return(core)

  prediction_data <- as.data.frame(model$data, stringsAsFactors = FALSE, check.names = FALSE)
  prediction_measurement <- model$measurement_model
  alias_lookup <- list()
  alias_metadata <- list()

  for (row_index in duplicate_rows) {
    construct_name <- as.character(mm_matrix[row_index, "construct"])
    measurement_name <- as.character(mm_matrix[row_index, "measurement"])
    if (!(measurement_name %in% colnames(prediction_data))) {
      stop(sprintf("Repeated-indicator PLSpredict could not find manifest indicator '%s'.", measurement_name))
    }

    alias_name <- sprintf(
      "METIS_PRED_%s_%s_%s",
      row_index,
      make.names(construct_name),
      make.names(measurement_name)
    )
    while (alias_name %in% colnames(prediction_data)) alias_name <- paste0(alias_name, "_")

    prediction_data[[alias_name]] <- prediction_data[[measurement_name]]
    alias_lookup[[paste(construct_name, measurement_name, sep = "\r")]] <- alias_name
    alias_metadata[[alias_name]] <- list(
      indicator = measurement_name,
      construct = construct_name
    )
  }

  for (construct_index in seq_along(prediction_measurement)) {
    construct_spec <- prediction_measurement[[construct_index]]
    if (!inherits(construct_spec, "construct")) next

    construct_positions <- seq.int(1L, length(construct_spec), by = 3L)
    construct_name <- as.character(construct_spec[[construct_positions[[1L]]]])
    for (construct_position in construct_positions) {
      measurement_position <- construct_position + 1L
      measurement_name <- as.character(construct_spec[[measurement_position]])
      alias_name <- alias_lookup[[paste(construct_name, measurement_name, sep = "\r")]]
      if (!is.null(alias_name)) construct_spec[[measurement_position]] <- alias_name
    }
    prediction_measurement[[construct_index]] <- construct_spec
  }

  prediction_model <- estimate_pls_model(
    prediction_data,
    prediction_measurement,
    model$smMatrix,
    resolve_pls_estimation_settings(payload)
  )
  if (anyDuplicated(prediction_model$mmVariables)) {
    stop("Repeated-indicator PLSpredict could not create a unique internal manifest-indicator representation.")
  }

  same_paths <- isTRUE(all.equal(
    model$path_coef,
    prediction_model$path_coef,
    tolerance = 1e-10,
    check.attributes = FALSE
  ))
  same_scores <- isTRUE(all.equal(
    model$construct_scores,
    prediction_model$construct_scores,
    tolerance = 1e-10,
    check.attributes = FALSE
  ))
  if (!same_paths || !same_scores) {
    stop("Repeated-indicator PLSpredict aliases changed the fitted HOC model.")
  }

  prediction_core <- core
  prediction_core$model <- prediction_model
  prediction_core$summary <- summary(prediction_model)
  prediction_core$prediction_indicator_aliases <- alias_metadata
  prediction_core
}

# seminrExtras IPMA/cIPMA (compute_ipma_performance) recurse infinitely when a
# single-item construct's name equals its indicator column name: the indicator is
# mistaken for a lower-order construct and the function calls itself forever
# ("node stack overflow"). Metis names single-item moderators identically to their
# column (e.g. "Gender transform"), which triggers it. For advanced analysis we point
# any such construct at a renamed copy of its column so IPMA/cIPMA can run; the
# construct name (and therefore all IPMA/NCA output labels) is left unchanged.
rename_colliding_single_item_indicators <- function(payload, data) {
  constructs <- payload$constructs %||% list()
  for (i in seq_along(constructs)) {
    con <- constructs[[i]]
    if (isTRUE(con$is_higher_order)) next
    con_name <- as.character(con$name)
    inds <- unlist(lapply(con$indicators, function(it) as.character(it)), use.names = FALSE)
    inds <- inds[!is.na(inds) & nzchar(inds)]
    if (length(inds) == 1L && identical(inds[[1]], con_name) && con_name %in% names(data)) {
      alias <- paste0(con_name, " (indicator)")
      while (alias %in% names(data)) alias <- paste0(alias, "_")
      data[[alias]] <- data[[con_name]]
      constructs[[i]]$indicators <- list(alias)
    }
  }
  payload$constructs <- constructs
  list(payload = payload, data = data)
}

extract_specific_indirect_effects <- function(payload, boot_model, alpha = 0.05) {
  if (!exists("specific_effect_significance", where = asNamespace("seminr"))) {
    return(list())
  }

  edges <- lapply(payload$paths, function(p) {
    list(from = as.character(p$from), to = as.character(p$to))
  })

  nodes <- unique(unlist(lapply(edges, function(e) c(e$from, e$to)), use.names = FALSE))
  from_map <- lapply(nodes, function(node) {
    tos <- unique(unlist(lapply(edges, function(e) if (e$from == node) e$to else NULL), use.names = FALSE))
    tos[!is.na(tos) & nzchar(tos)]
  })
  names(from_map) <- nodes

  chains <- list()
  for (x in nodes) {
    mids <- from_map[[x]]
    if (!length(mids)) next
    for (m in mids) {
      ys <- from_map[[m]]
      if (!length(ys)) next
      for (y in ys) {
        if (x == y) next
        chains[[length(chains) + 1]] <- list(from = x, through = m, to = y)
      }
    }
  }

  if (!length(chains)) return(list())

  effects <- list()
  for (ch in chains) {
    row <- tryCatch({
      out <- seminr::specific_effect_significance(
        boot_seminr_model = boot_model,
        from = ch$from,
        through = c(ch$through),
        to = ch$to,
        alpha = alpha
      )
      if (is.null(out)) return(NULL)
      as.list(as.data.frame(out, stringsAsFactors = FALSE, check.names = FALSE)[1, , drop = FALSE])
    }, error = function(e) NULL)

    if (!is.null(row)) {
      boot_values <- NULL
      path_nodes <- c(ch$from, ch$through, ch$to)
      if (!is.null(boot_model$boot_paths) && length(dim(boot_model$boot_paths)) >= 3L) {
        boot_values <- vapply(seq_len(dim(boot_model$boot_paths)[3]), function(k) {
          product <- 1
          for (idx in seq_len(length(path_nodes) - 1L)) {
            from_node <- path_nodes[[idx]]
            to_node <- path_nodes[[idx + 1L]]
            if (from_node %in% rownames(boot_model$boot_paths) && to_node %in% colnames(boot_model$boot_paths)) {
              product <- product * suppressWarnings(as.numeric(boot_model$boot_paths[from_node, to_node, k]))
            } else {
              product <- 0
            }
          }
          product
        }, numeric(1))
      }

      if (!is.null(boot_values)) {
        original_est <- suppressWarnings(as.numeric(row[["Original Est."]]))[1]
        interval <- bias_corrected_interval(boot_values, original_est, alpha)
        bc_labels <- bootstrap_interval_labels(alpha, " (BC)")
        row[[bc_labels[[1]]]] <- interval[[1]]
        row[[bc_labels[[2]]]] <- interval[[2]]
      }

      effects[[length(effects) + 1]] <- c(
        list(path = paste(ch$from, ch$through, ch$to, sep = " -> ")),
        row
      )
    }
  }

  effects
}

construct_indicators_from_payload <- function(con) {
  indicators <- con$indicators %||% list()
  indicators <- unlist(lapply(indicators, function(indicator) {
    if (is.list(indicator)) {
      return(as.character(indicator$name %||% indicator$id %||% indicator$label %||% ""))
    }
    as.character(indicator)
  }), use.names = FALSE)
  indicators[!is.na(indicators) & nzchar(indicators)]
}

construct_scores_from_payload_data <- function(payload, data) {
  if (is.null(data) || !nrow(data)) return(list())

  raw_df <- to_numeric_frame(as.data.frame(data, stringsAsFactors = FALSE, check.names = FALSE))

  construct_defs <- payload$constructs %||% list()
  construct_scores <- list()
  for (con in construct_defs) {
    con_name <- as.character(con$name %||% "")
    if (!nzchar(con_name)) next
    indicators <- unique(construct_indicators_from_payload(con))
    indicators <- indicators[indicators %in% names(raw_df)]
    if (!length(indicators)) next

    if (length(indicators) == 1) {
      construct_scores[[con_name]] <- suppressWarnings(as.numeric(raw_df[[indicators[1]]]))
    } else {
      sub_df <- raw_df[, indicators, drop = FALSE]
      construct_scores[[con_name]] <- suppressWarnings(rowMeans(sub_df, na.rm = TRUE))
    }
  }

  score_df <- as.data.frame(construct_scores, stringsAsFactors = FALSE, check.names = FALSE)
  if (!ncol(score_df)) return(list())
  score_df
}

compute_vif_from_data <- function(payload, data) {
  score_df <- construct_scores_from_payload_data(payload, data)
  if (is.null(score_df) || !is.data.frame(score_df)) return(list())
  if (!ncol(score_df)) return(list())

  edges <- lapply(payload$paths, function(p) {
    list(from = as.character(p$from), to = as.character(p$to))
  })

  endogenous_nodes <- unique(unlist(lapply(edges, function(e) e$to), use.names = FALSE))

  out <- list()

  for (endogenous in endogenous_nodes) {
    predictors <- unique(unlist(
      lapply(edges, function(e) if (identical(e$to, endogenous)) e$from else NULL),
      use.names = FALSE
    ))

    predictors <- predictors[predictors %in% names(score_df)]
    if (!length(predictors)) next

    row <- list(row_name = endogenous)

    for (pred in predictors) {
      others <- setdiff(predictors, pred)
      vif_val <- NA_real_

      if (!length(others)) {
        vif_val <- 1
      } else {
        r2 <- compute_regression_r2(score_df[[pred]], score_df[, others, drop = FALSE])
        if (!is.null(r2) && is.finite(r2) && !is.na(r2) && r2 < 1) {
          vif_val <- 1 / (1 - r2)
        }
      }

      if (is.finite(vif_val) && !is.na(vif_val)) {
        row[[pred]] <- vif_val
      }
    }

    if (length(row) > 1) {
      out[[length(out) + 1]] <- row
    }
  }

  out
}

extract_vif_antecedents <- function(summary_obj, payload = NULL, data = NULL) {
  vif_source <- summary_obj$vif_antecedents %||%
    summary_obj$vifAntecedents %||%
    summary_obj$VIF_antecedents %||%
    summary_obj$VIFAntecedents %||%
    summary_obj$vif

  vif_rows <- as_rows(vif_source)
  if (length(vif_rows) && has_meaningful_vif_predictor_names(vif_rows)) return(vif_rows)

  if (!is.null(data) && !is.null(payload$constructs) && !is.null(payload$paths)) {
    computed_vif <- compute_vif_from_data(payload, data)
    if (length(computed_vif)) return(computed_vif)
  }

  scores <- summary_obj$composite_scores %||%
    summary_obj$construct_scores %||%
    summary_obj$scores
  if (is.null(scores)) return(list())
  if (is.null(payload$paths) || !length(payload$paths)) return(list())

  score_df <- as.data.frame(scores)
  edges <- lapply(payload$paths, function(p) {
    list(from = as.character(p$from), to = as.character(p$to))
  })
  endogenous_nodes <- unique(unlist(lapply(edges, function(e) e$to), use.names = FALSE))

  out <- list()
  for (endogenous in endogenous_nodes) {
    predictors <- unique(unlist(lapply(edges, function(e) if (identical(e$to, endogenous)) e$from else NULL), use.names = FALSE))
    predictors <- predictors[predictors %in% names(score_df)]
    if (!length(predictors)) next

    row <- list(row_name = endogenous)
    for (pred in predictors) {
      others <- setdiff(predictors, pred)
      vif_val <- NA_real_

      if (!length(others)) {
        vif_val <- 1
      } else {
        r2 <- compute_regression_r2(score_df[[pred]], score_df[, others, drop = FALSE])
        if (!is.null(r2) && is.finite(r2) && !is.na(r2) && r2 < 1) {
          vif_val <- 1 / (1 - r2)
        }
      }

      if (is.finite(vif_val) && !is.na(vif_val)) {
        row[[pred]] <- vif_val
      }
    }

    if (length(row) > 1) out[[length(out) + 1]] <- row
  }

  out
}

extract_vif_items <- function(summary_obj) {
  outer_source <- summary_obj$validity$vif_items %||%
    summary_obj$validity$VIF_items %||%
    summary_obj$validity$vifItems %||%
    summary_obj$validity$VIFItems

  as_rows(outer_source)
}

extract_latent_variables <- function(summary_obj) {
  as_rows(summary_obj$composite_scores)
}

extract_construct_residuals <- function(summary_obj, model) {
  if (is.null(summary_obj$composite_scores) || is.null(model$path_coef)) return(list())

  score_df <- as.data.frame(summary_obj$composite_scores)
  path_matrix <- model$path_coef
  rows <- list()

  for (target in colnames(path_matrix)) {
    if (!target %in% names(score_df)) next
    preds <- rownames(path_matrix)[which(path_matrix[, target] != 0)]
    preds <- preds[preds %in% names(score_df)]
    if (!length(preds)) next

    pred_val <- rep(0, nrow(score_df))
    for (pred in preds) {
      coef <- suppressWarnings(as.numeric(path_matrix[pred, target]))
      if (is.na(coef)) coef <- 0
      pred_val <- pred_val + coef * score_df[[pred]]
    }

    obs <- score_df[[target]]
    resid <- obs - pred_val

    rows[[length(rows) + 1]] <- list(
      construct = target,
      mean_residual = mean(resid, na.rm = TRUE),
      sd_residual = stats::sd(resid, na.rm = TRUE),
      rmse = sqrt(mean(resid^2, na.rm = TRUE))
    )
  }

  rows
}

extract_discriminant_validity <- function(summary_obj) {
  out <- list()

  htmt_rows <- as_rows(summary_obj$validity$htmt)
  if (length(htmt_rows)) {
    for (r in htmt_rows) {
      out[[length(out) + 1]] <- c(list(method = "HTMT"), r)
    }
  }

  fl_rows <- as_rows(summary_obj$validity$fl_criteria)
  if (length(fl_rows)) {
    for (r in fl_rows) {
      out[[length(out) + 1]] <- c(list(method = "Fornell-Larcker"), r)
    }
  }

  out
}

extract_indicator_correlations <- function(data) {
  numeric_df <- to_numeric_frame(data)
  keep <- vapply(numeric_df, is.numeric, logical(1))
  if (!any(keep)) return(list())

  numeric_df <- numeric_df[keep]
  if (ncol(numeric_df) < 2) return(list())

  cor_mat <- stats::cor(numeric_df, use = "pairwise.complete.obs")
  as_rows(cor_mat)
}

extract_stop_criterion <- function(summary_obj) {
  iters <- safe_num(summary_obj$iterations)
  if (is.null(iters)) {
    return(list(
      list(
        iterations = NULL,
        changes_available = FALSE,
        note = "SEMinR provides final iteration count but not per-iteration stop-criterion change logs."
      )
    ))
  }

  list(
    list(
      iterations = iters,
      changes_available = FALSE,
      note = "SEMinR reports convergence iterations; detailed stop-criterion history is not exposed."
    )
  )
}

extract_post_hoc_power_analysis <- function(payload, data) {
  n <- nrow(data)
  alpha <- if (!is.null(payload$postHocAlpha)) safe_num(payload$postHocAlpha) else 0.05
  if (is.null(alpha) || is.na(alpha) || alpha <= 0 || alpha >= 1) alpha <- 0.05

  effect <- if (!is.null(payload$postHocEffect)) safe_num(payload$postHocEffect) else 0.05
  if (is.null(effect) || is.na(effect) || effect <= 0) effect <- 0.05

  effect_measure <- if (!is.null(payload$postHocEffectMeasure)) {
    as.character(payload$postHocEffectMeasure)
  } else {
    "RMSEA"
  }

  df_val <- if (!is.null(payload$postHocDf)) safe_num(payload$postHocDf) else NULL
  if (is.null(df_val) || is.na(df_val) || df_val < 1) {
    df_val <- max(1, ncol(data) - 1)
  }

  if (!requireNamespace("semPower", quietly = TRUE)) {
    return(list(
      list(
        status = "unavailable",
        package = "semPower",
        note = "Package 'semPower' is not installed in this R runtime.",
        alpha = alpha,
        effect = effect,
        effect_measure = effect_measure,
        n = n,
        df = df_val
      )
    ))
  }

  res <- tryCatch({
    semPower::semPower.postHoc(
      effect = effect,
      effect.measure = effect_measure,
      alpha = alpha,
      N = n,
      df = df_val
    )
  }, error = function(e) e)

  if (inherits(res, "error")) {
    return(list(
      list(
        status = "error",
        package = "semPower",
        message = conditionMessage(res),
        alpha = alpha,
        effect = effect,
        effect_measure = effect_measure,
        n = n,
        df = df_val
      )
    ))
  }

  summary_text <- tryCatch({
    paste(capture.output(summary(res)), collapse = "\n")
  }, error = function(e) NULL)

  power_candidates <- c(res$power, res$Power, res$achievedPower, res$`1-beta`)
  power_val <- NULL
  for (cand in power_candidates) {
    vv <- safe_num(cand)
    if (!is.null(vv) && !is.na(vv)) {
      power_val <- vv
      break
    }
  }

  list(
    list(
      status = "ok",
      package = "semPower",
      power = power_val,
      alpha = alpha,
      effect = effect,
      effect_measure = effect_measure,
      n = n,
      df = df_val,
      note = "Post-hoc power is computed via semPower; df defaults to a proxy unless provided in request payload.",
      summary = summary_text
    )
  )
}

fit_metrics_to_rows <- function(metrics) {
  if (is.null(metrics) || !length(metrics) || is.null(names(metrics))) return(list())

  out <- list()
  for (nm in names(metrics)) {
    v <- suppressWarnings(as.numeric(metrics[[nm]]))
    if (length(v) && !is.na(v[1]) && is.finite(v[1])) {
      out[[length(out) + 1]] <- list(row_name = nm, value = v[1])
    }
  }
  out
}

sanitize_correlation_matrix <- function(mat) {
  if (is.null(mat)) return(NULL)
  out <- as.matrix(mat)
  if (!nrow(out) || !ncol(out)) return(NULL)
  out <- (out + t(out)) / 2
  out[!is.finite(out)] <- 0
  out <- pmax(pmin(out, 1), -1)
  diag(out) <- 1
  out
}

make_positive_definite_correlation <- function(mat) {
  if (is.null(mat)) return(NULL)

  out <- sanitize_correlation_matrix(mat)
  if (is.null(out)) return(NULL)

  if (requireNamespace("Matrix", quietly = TRUE)) {
    npd <- tryCatch(
      Matrix::nearPD(out, corr = TRUE, keepDiag = TRUE),
      error = function(e) NULL
    )
    if (!is.null(npd)) {
      out <- as.matrix(npd$mat)
      out <- sanitize_correlation_matrix(out)
    }
  }

  out
}

extract_observed_indicator_correlations <- function(model) {
  if (is.null(model$data)) return(NULL)

  items <- model$mmVariables %||% rownames(model$outer_loadings)
  items <- items[!is.na(items) & nzchar(items)]
  if (!length(items)) return(NULL)

  df <- to_numeric_frame(as.data.frame(model$data))
  items <- items[items %in% names(df)]
  if (length(items) < 2) return(NULL)

  cor_mat <- tryCatch(
    stats::cor(df[, items, drop = FALSE], use = "pairwise.complete.obs"),
    error = function(e) NULL
  )
  sanitize_correlation_matrix(cor_mat)
}

extract_saturated_construct_correlations <- function(model) {
  if (is.null(model$construct_scores)) return(NULL)
  cor_mat <- tryCatch(
    stats::cor(model$construct_scores, use = "pairwise.complete.obs"),
    error = function(e) NULL
  )
  sanitize_correlation_matrix(cor_mat)
}

extract_estimated_construct_correlations <- function(model) {
  if (is.null(model$path_coef) || is.null(model$construct_scores) || is.null(model$smMatrix)) {
    return(NULL)
  }

  observed_corr <- extract_saturated_construct_correlations(model)
  if (is.null(observed_corr)) return(NULL)

  construct_names <- intersect(rownames(observed_corr), colnames(observed_corr))
  construct_names <- intersect(construct_names, rownames(model$path_coef))
  construct_names <- intersect(construct_names, colnames(model$path_coef))
  if (!length(construct_names)) return(NULL)

  observed_corr <- observed_corr[construct_names, construct_names, drop = FALSE]
  beta <- as.matrix(model$path_coef[construct_names, construct_names, drop = FALSE])
  beta[!is.finite(beta)] <- 0

  sm_matrix <- as.matrix(model$smMatrix)
  endogenous <- unique(sm_matrix[, "target"])
  endogenous <- endogenous[endogenous %in% construct_names]
  exogenous <- setdiff(construct_names, endogenous)

  psi <- matrix(
    0,
    nrow = length(construct_names),
    ncol = length(construct_names),
    dimnames = list(construct_names, construct_names)
  )

  if (length(exogenous)) {
    psi[exogenous, exogenous] <- observed_corr[exogenous, exogenous, drop = FALSE]
  }

  r2_values <- setNames(rep(NA_real_, length(construct_names)), construct_names)
  r2_mat <- model$rSquared
  if (!is.null(r2_mat) && nrow(r2_mat)) {
    row_name <- if ("R^2" %in% rownames(r2_mat)) "R^2" else rownames(r2_mat)[1]
    r2_row <- r2_mat[row_name, , drop = TRUE]
    for (nm in intersect(names(r2_row), construct_names)) {
      r2_values[[nm]] <- safe_num(r2_row[[nm]])
    }
  }

  for (node in endogenous) {
    r2_val <- r2_values[[node]]
    if (is.null(r2_val) || is.na(r2_val)) {
      antecedents <- sm_matrix[sm_matrix[, "target"] == node, "source"]
      antecedents <- antecedents[antecedents %in% construct_names]
      if (length(antecedents)) {
        r2_val <- tryCatch(seminr:::cor_rsq(observed_corr, node, antecedents), error = function(e) NA_real_)
      }
    }

    if (!is.finite(r2_val) || is.na(r2_val)) r2_val <- 0
    psi[node, node] <- max(1 - r2_val, 1e-8)
  }

  if (!length(exogenous)) {
    diag(psi) <- pmax(diag(psi), 1e-8)
  }

  implied_cov <- tryCatch({
    transform <- solve(diag(length(construct_names)) - t(beta))
    transform %*% psi %*% t(transform)
  }, error = function(e) NULL)

  if (is.null(implied_cov)) return(observed_corr)

  rownames(implied_cov) <- construct_names
  colnames(implied_cov) <- construct_names

  implied_corr <- tryCatch(stats::cov2cor(implied_cov), error = function(e) implied_cov)
  sanitize_correlation_matrix(implied_corr)
}

build_implied_indicator_correlations <- function(model, construct_corr) {
  if (is.null(model$outer_loadings) || is.null(construct_corr)) return(NULL)

  lambda <- as.matrix(model$outer_loadings)
  items <- rownames(lambda) %||% model$mmVariables
  constructs <- intersect(colnames(lambda), colnames(construct_corr))
  constructs <- intersect(constructs, rownames(construct_corr))

  if (!length(items) || !length(constructs)) return(NULL)

  lambda <- lambda[items, constructs, drop = FALSE]
  phi <- as.matrix(construct_corr[constructs, constructs, drop = FALSE])

  implied <- tryCatch(lambda %*% phi %*% t(lambda), error = function(e) NULL)
  if (is.null(implied)) return(NULL)

  rownames(implied) <- items
  colnames(implied) <- items
  diag(implied) <- 1
  sanitize_correlation_matrix(implied)
}

compute_fit_indices <- function(observed, implied) {
  if (is.null(observed) || is.null(implied)) return(list())

  shared <- intersect(rownames(observed), rownames(implied))
  shared <- shared[shared %in% colnames(observed) & shared %in% colnames(implied)]
  if (length(shared) < 2) return(list())

  obs <- as.matrix(observed[shared, shared, drop = FALSE])
  imp <- as.matrix(implied[shared, shared, drop = FALSE])
  residual <- obs - imp
  idx <- lower.tri(residual, diag = TRUE)
  residual_vals <- residual[idx]

  d_uls <- sum(residual_vals^2, na.rm = TRUE)
  srmr <- sqrt(mean(residual_vals^2, na.rm = TRUE))

  null_implied <- diag(length(shared))
  rownames(null_implied) <- shared
  colnames(null_implied) <- shared
  null_residual <- obs - null_implied
  null_d_uls <- sum(null_residual[idx]^2, na.rm = TRUE)
  nfi <- if (is.finite(null_d_uls) && null_d_uls > 0) 1 - (d_uls / null_d_uls) else NULL

  d_g <- tryCatch({
    obs_pd <- make_positive_definite_correlation(obs)
    imp_pd <- make_positive_definite_correlation(imp)
    if (is.null(obs_pd) || is.null(imp_pd)) return(NULL)

    ratio <- solve(imp_pd, obs_pd)
    eig <- eigen(ratio, only.values = TRUE)$values
    eig <- Re(eig)
    eig <- eig[is.finite(eig) & eig > 0]
    if (!length(eig)) return(NULL)

    sqrt(sum(log(eig)^2))
  }, error = function(e) NULL)

  list(
    SRMR = srmr,
    D_ULS = d_uls,
    D_G = d_g,
    NFI = nfi
  )
}

extract_model_fit <- function(model) {
  observed_corr <- extract_observed_indicator_correlations(model)
  saturated_construct_corr <- extract_saturated_construct_correlations(model)
  estimated_construct_corr <- extract_estimated_construct_correlations(model)

  saturated_indicator_corr <- build_implied_indicator_correlations(model, saturated_construct_corr)
  estimated_indicator_corr <- build_implied_indicator_correlations(model, estimated_construct_corr)

  saturated_metrics <- compute_fit_indices(observed_corr, saturated_indicator_corr)
  estimated_metrics <- compute_fit_indices(observed_corr, estimated_indicator_corr)

  # The current UI presents one value per metric, so prefer the saturated fit
  # block and keep the estimated block available for future expansion.
  display_metrics <- if (length(saturated_metrics)) saturated_metrics else estimated_metrics

  list(
    rows = fit_metrics_to_rows(display_metrics),
    srmr = safe_num(display_metrics[["SRMR"]] %||% estimated_metrics[["SRMR"]]),
    saturated = fit_metrics_to_rows(saturated_metrics),
    estimated = fit_metrics_to_rows(estimated_metrics)
  )
}

vif_list_to_rows <- function(vif_obj) {
  if (is.null(vif_obj)) return(list())
  if (is.matrix(vif_obj) || is.data.frame(vif_obj)) return(as_rows(vif_obj))
  # Named list: list(PEOU = c(DC = 1.1, SE = 1.1), PU = c(DC = 1.1, …), …)
  if (is.list(vif_obj) && !is.null(names(vif_obj))) {
    out <- list()
    for (endogenous in names(vif_obj)) {
      vals <- vif_obj[[endogenous]]
      if (!is.numeric(vals) || is.null(names(vals))) next
      row <- list(row_name = endogenous)
      for (pred in names(vals)) {
        v <- suppressWarnings(as.numeric(vals[[pred]]))
        if (length(v) && !is.na(v[1]) && is.finite(v[1])) row[[pred]] <- v[1]
      }
      if (length(row) > 1) out[[length(out) + 1]] <- row
    }
    return(out)
  }
  list()
}

extract_quality_criteria <- function(payload, data, core, bypass_isolated_moderation_cache = FALSE) {
  summary_obj <- core$summary
  model <- core$model

  inner_vif_rows <- tryCatch({
    vif_obj <- seminr::vif_antecedents(model)
    rows <- vif_list_to_rows(vif_obj)
    if (length(rows)) rows else extract_vif_antecedents(summary_obj, payload, data)
  }, error = function(e) {
    extract_vif_antecedents(summary_obj, payload, data)
  })

  outer_vif_rows <- extract_vif_items(summary_obj)
  fit_bundle <- extract_model_fit(model)
  cross_loading_rows <- tryCatch(
    as_rows(summary_obj$validity$cross_loadings %||% summary_obj$cross_loadings),
    error = function(e) list()
  )

  isolated_r2 <- compute_isolated_moderation_r2(
    payload,
    data,
    NULL,
    use_cache = !isTRUE(bypass_isolated_moderation_cache)
  )

  list(
    r_square = extract_r2_results(summary_obj, payload$constructs, payload$paths, data),
    r_square_change_isolated = isolated_r2,
    f_square = as_rows(summary_obj$fSquare),
    reliability = as_rows(summary_obj$reliability),
    discriminant_validity = extract_discriminant_validity(summary_obj),
    vif = inner_vif_rows,
    inner_vif = inner_vif_rows,
    outer_vif = outer_vif_rows,
    cross_loadings = cross_loading_rows,
    model_fit = fit_bundle$rows,
    model_fit_saturated = fit_bundle$saturated,
    model_fit_estimated = fit_bundle$estimated,
    srmr = fit_bundle$srmr,
    model_selection_criteria = as_rows(summary_obj$it_criteria)
  )
}

extract_hoc_results <- function(payload, model, summary_obj) {
  constructs <- payload$constructs %||% list()
  hoc_constructs <- Filter(function(con) isTRUE(con$is_higher_order), constructs)
  if (length(hoc_constructs) == 0) return(list())
  hoc_settings <- normalize_hoc_settings(payload$algorithmSettings %||% list())
  use_leaf_indicators <- identical(hoc_settings$hocMethod, "Repeated indicators")

  by_name <- list()
  for (con in constructs) {
    con_name <- as.character(con$name)
    if (nzchar(con_name)) by_name[[con_name]] <- con
  }

  ol <- model$outer_loadings
  ow <- model$outer_weights
  vif_items <- summary_obj$validity$vif_items %||%
               summary_obj$validity$VIF_items %||%
               summary_obj$validity$vifItems %||%
               summary_obj$validity$VIFItems

  hoc_rows <- list()

  for (con in hoc_constructs) {
    hoc_name <- as.character(con$name)
    hoc_type <- tolower(as.character(con$higher_order_type %||% "reflective"))
    dimensions <- unlist(con$dimensions)

    for (dim_name in dimensions) {
      loc_con <- Filter(function(c) as.character(c$name) == dim_name, constructs)
      loc_type <- if (length(loc_con) > 0) tolower(as.character(loc_con[[1]]$type %||% "reflective")) else "reflective"
      indicator_names <- if (use_leaf_indicators) gather_leaf_indicators(dim_name, by_name) else dim_name

      for (indicator_name in indicator_names) {
        loading_val <- NA_real_
        weight_val <- NA_real_
        vif_val <- NA_real_

        if (!is.null(ol) && indicator_name %in% rownames(ol) && hoc_name %in% colnames(ol)) {
          loading_val <- safe_num(ol[indicator_name, hoc_name])
        }

        if (!is.null(ow) && indicator_name %in% rownames(ow) && hoc_name %in% colnames(ow)) {
          weight_val <- safe_num(ow[indicator_name, hoc_name])
        }

        if (!is.null(vif_items)) {
          if (is.list(vif_items) && !is.null(vif_items[[hoc_name]]) && indicator_name %in% names(vif_items[[hoc_name]])) {
            vif_val <- safe_num(vif_items[[hoc_name]][[indicator_name]])
          } else if (is.matrix(vif_items) || is.data.frame(vif_items)) {
            if (indicator_name %in% rownames(vif_items) && hoc_name %in% colnames(vif_items)) {
              vif_val <- safe_num(vif_items[indicator_name, hoc_name])
            } else if (hoc_name %in% rownames(vif_items) && indicator_name %in% colnames(vif_items)) {
              vif_val <- safe_num(vif_items[hoc_name, indicator_name])
            }
          } else if (indicator_name %in% names(vif_items)) {
            vif_val <- safe_num(vif_items[[indicator_name]])
          }
        }

        hoc_rows[[length(hoc_rows) + 1]] <- list(
          hoc_construct = hoc_name,
          loc_construct = dim_name,
          indicator = indicator_name,
          hoc_type = hoc_type,
          loc_type = loc_type,
          loading = loading_val,
          weight = weight_val,
          vif = vif_val
        )
      }
    }
  }

  hoc_rows
}

embedded_bootstrap_matrix <- function(models, field, reference) {
  if (is.null(reference) || is.null(dim(reference))) return(NULL)
  out <- array(NA_real_, dim = c(nrow(reference), ncol(reference), length(models)), dimnames = list(rownames(reference), colnames(reference), NULL))
  for (k in seq_along(models)) {
    current <- models[[k]]$model[[field]]
    if (is.null(current)) next
    for (i in seq_len(nrow(reference))) {
      for (j in seq_len(ncol(reference))) {
        if (rownames(reference)[[i]] %in% rownames(current) && colnames(reference)[[j]] %in% colnames(current)) {
          out[i, j, k] <- suppressWarnings(as.numeric(current[rownames(reference)[[i]], colnames(reference)[[j]]]))
        }
      }
    }
  }
  out
}

embedded_bootstrap_derived_matrix <- function(models, reference, derive_matrix) {
  if (is.null(reference) || is.null(dim(reference))) return(NULL)
  out <- array(
    NA_real_,
    dim = c(nrow(reference), ncol(reference), length(models)),
    dimnames = list(rownames(reference), colnames(reference), NULL)
  )
  for (k in seq_along(models)) {
    current <- derive_matrix(models[[k]]$model)
    if (is.null(current) || is.null(dim(current))) next
    shared_rows <- intersect(rownames(reference), rownames(current))
    shared_columns <- intersect(colnames(reference), colnames(current))
    if (length(shared_rows) && length(shared_columns)) {
      out[shared_rows, shared_columns, k] <- current[shared_rows, shared_columns, drop = FALSE]
    }
  }
  out
}

run_embedded_hoc_bootstrap <- function(payload, data, core, nboot, seed = NULL, timings = NULL) {
  if (!is.null(seed)) set.seed(as.integer(seed))
  models <- vector("list", nboot)
  for (idx in seq_len(nboot)) {
    sample_rows <- sample.int(nrow(data), nrow(data), replace = TRUE)
    models[[idx]] <- timed_or_direct(timings, sprintf("embedded bootstrap resample %s", idx), run_pls_core(payload, data[sample_rows, , drop = FALSE]))
  }
  total_paths <- seminr:::total_effects(core$model$path_coef)
  boot_paths <- embedded_bootstrap_matrix(models, "path_coef", core$model$path_coef)
  boot_total_paths <- embedded_bootstrap_derived_matrix(
    models,
    total_paths,
    function(model) seminr:::total_effects(model$path_coef)
  )
  list(
    path_coef = core$model$path_coef,
    total_paths = total_paths,
    total_indirect_paths = total_paths - core$model$path_coef,
    outer_loadings = core$model$outer_loadings,
    outer_weights = core$model$outer_weights,
    boot_paths = boot_paths,
    boot_total_paths = boot_total_paths,
    boot_total_indirect_paths = boot_total_paths - boot_paths,
    boot_loadings = embedded_bootstrap_matrix(models, "outer_loadings", core$model$outer_loadings),
    boot_weights = embedded_bootstrap_matrix(models, "outer_weights", core$model$outer_weights)
  )
}

embedded_bootstrap_statistics <- function(observed, values, alpha = 0.05) {
  observed <- suppressWarnings(as.numeric(observed))[1]
  values <- suppressWarnings(as.numeric(values))
  values <- values[is.finite(values)]
  if (!is.finite(observed) || !length(values)) return(NULL)

  bootstrap_sd <- if (length(values) > 1L) stats::sd(values) else NA_real_
  t_stat <- observed / bootstrap_sd
  if (!is.finite(t_stat) || abs(t_stat) > 999999999) t_stat <- NA_real_
  percentile_interval <- as.numeric(stats::quantile(
    values,
    probs = c(alpha / 2, 1 - alpha / 2),
    na.rm = TRUE,
    names = FALSE
  ))
  bias_corrected <- bias_corrected_interval(values, observed, alpha)
  percentile_labels <- bootstrap_interval_labels(alpha)
  bias_corrected_labels <- bootstrap_interval_labels(alpha, " (BC)")

  row <- list(
    `Original Est.` = observed,
    `Bootstrap Mean` = mean(values),
    `Bootstrap SD` = bootstrap_sd,
    `T Stat.` = t_stat
  )
  row[[percentile_labels[[1]]]] <- percentile_interval[[1]]
  row[[percentile_labels[[2]]]] <- percentile_interval[[2]]
  row[["Bootstrap P Val"]] <- 2 * min(mean(values <= 0), mean(values > 0))
  row[[bias_corrected_labels[[1]]]] <- bias_corrected[[1]]
  row[[bias_corrected_labels[[2]]]] <- bias_corrected[[2]]
  row[["Significance"]] <- if (
    percentile_interval[[1]] > 0 || percentile_interval[[2]] < 0
  ) "Significant" else "Not significant"
  row
}

embedded_bootstrap_rows <- function(original, boot_array, alpha = 0.05) {
  if (is.null(original) || is.null(boot_array) || is.null(dim(original)) || length(dim(boot_array)) < 3L) return(list())
  rows <- list()
  for (i in seq_len(nrow(original))) {
    for (j in seq_len(ncol(original))) {
      observed <- suppressWarnings(as.numeric(original[i, j]))
      if (!is.finite(observed) || observed == 0) next
      statistics <- embedded_bootstrap_statistics(observed, boot_array[i, j, ], alpha)
      if (is.null(statistics)) next
      rows[[length(rows) + 1L]] <- c(
        list(row_name = paste(rownames(original)[[i]], colnames(original)[[j]], sep = " -> ")),
        statistics
      )
    }
  }
  rows
}

embedded_specific_indirect_paths <- function(payload) {
  edges <- lapply(payload$paths %||% list(), function(path) {
    c(as.character(path$from %||% ""), as.character(path$to %||% ""))
  })
  edges <- Filter(function(edge) length(edge) == 2L && all(nzchar(edge)), edges)
  nodes <- unique(unlist(edges, use.names = FALSE))
  adjacency <- setNames(vector("list", length(nodes)), nodes)
  for (edge in edges) adjacency[[edge[[1]]]] <- unique(c(adjacency[[edge[[1]]]], edge[[2]]))

  paths <- list()
  walk <- function(current, path_nodes) {
    next_nodes <- adjacency[[current]] %||% character(0)
    for (next_node in next_nodes) {
      if (next_node %in% path_nodes) next
      next_path <- c(path_nodes, next_node)
      if (length(next_path) >= 3L) paths[[length(paths) + 1L]] <<- next_path
      walk(next_node, next_path)
    }
  }
  for (node in nodes) walk(node, node)

  if (!length(paths)) return(list())
  keys <- vapply(
    paths,
    function(path_nodes) paste(path_nodes, collapse = "|"),
    character(1),
    USE.NAMES = FALSE
  )
  paths[!duplicated(keys)]
}

embedded_path_product <- function(path_matrix, path_nodes) {
  if (is.null(path_matrix) || length(path_nodes) < 2L) return(NA_real_)
  product <- 1
  for (idx in seq_len(length(path_nodes) - 1L)) {
    source <- path_nodes[[idx]]
    target <- path_nodes[[idx + 1L]]
    if (!(source %in% rownames(path_matrix)) || !(target %in% colnames(path_matrix))) return(NA_real_)
    product <- product * suppressWarnings(as.numeric(path_matrix[source, target]))
  }
  product
}

embedded_specific_indirect_effects <- function(payload, path_coef, boot_paths, alpha = 0.05) {
  chains <- embedded_specific_indirect_paths(payload)
  if (!length(chains) || is.null(boot_paths) || length(dim(boot_paths)) < 3L) return(list())

  effects <- list()
  for (path_nodes in chains) {
    original <- embedded_path_product(path_coef, path_nodes)
    values <- vapply(seq_len(dim(boot_paths)[3]), function(k) {
      embedded_path_product(boot_paths[, , k], path_nodes)
    }, numeric(1))
    statistics <- embedded_bootstrap_statistics(original, values, alpha)
    if (is.null(statistics)) next
    path_label <- paste(path_nodes, collapse = " -> ")
    effects[[length(effects) + 1L]] <- c(
      list(path = path_label, row_name = path_label),
      statistics
    )
  }
  effects
}

assemble_embedded_bootstrap_response <- function(payload, data, core, boot, nboot, confidence_level, algorithm, algorithm_label, alpha = 0.05, bypass_isolated_moderation_cache = FALSE) {
  hoc_settings <- payload$algorithmSettings %||% list()
  execution_log <- list(list(message = sprintf("Embedded two-stage bootstrap reran Stage 1 and Stage 2 for all %s resamples.", nboot)))
  results <- list(
    final_results = list(
      path_coefficients = embedded_bootstrap_rows(boot$path_coef, boot$boot_paths, alpha),
      total_indirect_effects = embedded_bootstrap_rows(boot$total_indirect_paths, boot$boot_total_indirect_paths, alpha),
      specific_indirect_effects = embedded_specific_indirect_effects(payload, boot$path_coef, boot$boot_paths, alpha),
      total_effects = embedded_bootstrap_rows(boot$total_paths, boot$boot_total_paths, alpha),
      outer_loadings = embedded_bootstrap_rows(boot$outer_loadings, boot$boot_loadings, alpha),
      outer_weights = embedded_bootstrap_rows(boot$outer_weights, boot$boot_weights, alpha)
    ),
    quality_criteria = extract_quality_criteria(
      payload,
      data,
      core,
      bypass_isolated_moderation_cache = bypass_isolated_moderation_cache
    ),
    algorithm = list(settings = list(mode = "PLS-SEM", algorithm = algorithm, algorithm_label = algorithm_label, hoc_method = "Embedded Two-stage", hoc_method_requested = hoc_settings$hocMethod %||% "Two-stage", hoc_two_stage = "Embedded", algorithm_settings = hoc_settings, nboot = nboot, ci_type = payload$ciType %||% "Percentile", confidence_level = confidence_level), execution_log = execution_log),
    execution_log = execution_log,
    model_and_data = list(inner_model = as_rows(core$model$path_coef), outer_model = as_rows(core$model$outer_loadings), indicator_data_original = as_rows(utils::head(data, 200)), indicator_data_standardized = as_rows(utils::head(standardize_data(data), 200)), indicator_data_correlations = extract_indicator_correlations(data)),
    meta = list(mode = "bootstrap", algorithm = algorithm, algorithm_label = algorithm_label, hoc_method = "Embedded Two-stage", rows = nrow(data), columns = ncol(data), engine = "seminr")
  )
  list(success = TRUE, results = results)
}

assemble_bootstrap_response <- function(payload, data, core, boot_model, boot_summary, nboot, confidence_level, algorithm, algorithm_label, alpha = 0.05, bypass_isolated_moderation_cache = FALSE) {
  total_indirect_matrix <- seminr:::total_indirect_effects(boot_model$path_coef)
  if (!is.null(total_indirect_matrix) && any(total_indirect_matrix != 0, na.rm = TRUE) && !is.null(boot_model$boot_total_paths) && !is.null(boot_model$boot_paths)) {
    boot_total_indirect <- boot_model$boot_total_paths - boot_model$boot_paths
    boot_summary$bootstrapped_total_indirect_paths <- seminr:::parse_boot_array(total_indirect_matrix, boot_total_indirect, alpha = alpha)
    boot_summary$bootstrapped_total_indirect_paths <- add_bias_corrected_intervals(boot_summary$bootstrapped_total_indirect_paths, total_indirect_matrix, boot_total_indirect, alpha = alpha)
  }
  specific_indirect <- extract_specific_indirect_effects(payload, boot_model, alpha = alpha)

  boot_paths <- as_rows(boot_summary$bootstrapped_paths)
  if (!length(boot_paths)) boot_paths <- extract_path_results(core$model, payload$paths)
  boot_total_indirect <- as_rows(boot_summary$bootstrapped_total_indirect_effects %||% boot_summary$bootstrapped_total_indirect_paths %||% boot_summary$total_indirect_effects)
  if (!length(boot_total_indirect)) boot_total_indirect <- as_rows(core$summary$total_indirect_effects)
  boot_total_effects <- as_rows(boot_summary$bootstrapped_total_effects %||% boot_summary$bootstrapped_total_paths %||% boot_summary$total_effects)
  if (!length(boot_total_effects)) boot_total_effects <- as_rows(core$summary$total_effects)
  boot_loadings <- as_rows(boot_summary$bootstrapped_loadings)
  if (!length(boot_loadings)) boot_loadings <- as_rows(core$summary$loadings)
  boot_weights <- as_rows(boot_summary$bootstrapped_weights)
  if (!length(boot_weights)) boot_weights <- as_rows(core$summary$weights)

  quality_criteria <- c(
    extract_quality_criteria(
      payload,
      data,
      core,
      bypass_isolated_moderation_cache = bypass_isolated_moderation_cache
    ),
    list(htmt_confidence_intervals = as_rows(boot_summary$bootstrapped_HTMT))
  )
  execution_log <- list(list(message = sprintf("Bootstrap completed with %s subsamples", nboot)))
  hoc_settings <- payload$algorithmSettings %||% list()
  results <- list(
    final_results = list(path_coefficients = boot_paths, total_indirect_effects = boot_total_indirect, specific_indirect_effects = specific_indirect, total_effects = boot_total_effects, outer_loadings = boot_loadings, outer_weights = boot_weights),
    quality_criteria = quality_criteria,
    algorithm = list(settings = list(mode = "PLS-SEM", algorithm = algorithm, algorithm_label = algorithm_label, hoc_method = core$hoc_method_label %||% hoc_method_label(hoc_settings, has_hoc = has_higher_order_construct(payload)), hoc_method_requested = hoc_settings$hocMethod %||% "Two-stage", hoc_two_stage = hoc_settings$hocTwoStage %||% "Disjoint two-stage", algorithm_settings = hoc_settings, nboot = nboot, ci_type = payload$ciType %||% "Percentile", confidence_level = confidence_level), execution_log = execution_log),
    execution_log = execution_log,
    model_and_data = list(inner_model = as_rows(core$model$path_coef), outer_model = as_rows(core$model$outer_loadings), indicator_data_original = as_rows(utils::head(data, 200)), indicator_data_standardized = as_rows(utils::head(standardize_data(data), 200)), indicator_data_correlations = extract_indicator_correlations(data)),
    meta = list(mode = "bootstrap", algorithm = algorithm, algorithm_label = algorithm_label, hoc_method = core$hoc_method_label %||% hoc_method_label(hoc_settings, has_hoc = has_higher_order_construct(payload)), rows = nrow(data), columns = ncol(data), engine = "seminr")
  )
  list(success = TRUE, results = results)
}

describe_unsupported_pls_settings <- function(payload) {
  settings <- payload$algorithmSettings %||% list()
  inner <- tolower(as.character(settings$innerWeighting %||% ""))
  initial <- tolower(as.character(settings$initialWeights %||% ""))
  notes <- character(0)
  if (grepl("centroid", inner)) notes <- c(notes, "Centroid inner weighting is not exposed by SEMinR 2.5.0; Path weighting was applied and the request was recorded.")
  if (grepl("loh", initial) || grepl("random", initial)) notes <- c(notes, "Selectable Lohmöller or random initial outer weights are not exposed by SEMinR 2.5.0; SEMinR default initialization was applied and the request was recorded.")
  notes
}

extract_pls_sections <- function(payload, data, core) {
  summary_obj <- core$summary
  model <- core$model
  algorithm <- if (!is.null(payload$algorithm)) tolower(as.character(payload$algorithm)) else "standard"
  if (!(algorithm %in% c("standard", "consistent"))) algorithm <- "standard"
  algorithm_label <- if (algorithm == "consistent") "Consistent PLS (PLSc)" else "Standard PLS"
  quality_criteria <- extract_quality_criteria(payload, data, core)

  list(
    final_results = list(
      path_coefficients = extract_path_results(model, payload$paths),
      total_indirect_effects = as_rows(summary_obj$total_indirect_effects),
      specific_indirect_effects = list(),
      total_effects = as_rows(summary_obj$total_effects),
      outer_loadings = as_rows(summary_obj$loadings),
      outer_weights = as_rows(summary_obj$weights),
      latent_variables = extract_latent_variables(summary_obj),
      residuals = extract_construct_residuals(summary_obj, model),
      hoc_results = extract_hoc_results(payload, model, summary_obj)
    ),
    quality_criteria = quality_criteria,
    algorithm = list(
      settings = list(
        mode = "PLS-SEM",
        algorithm = algorithm,
        algorithm_label = algorithm_label,
        hoc_method = core$hoc_method_label %||% hoc_method_label(payload$algorithmSettings, has_hoc = has_higher_order_construct(payload)),
        hoc_method_requested = payload$algorithmSettings$hocMethod %||% "Two-stage",
        hoc_two_stage = payload$algorithmSettings$hocTwoStage %||% "Disjoint two-stage",
        algorithm_settings = payload$algorithmSettings %||% list(),
        missing_data = payload$algorithmSettings$missingData %||% "Mean replacement",
        assess_syntax = isTRUE(payload$algorithmSettings$assessSyntax),
        missing_value_sentinel = payload$algorithmSettings$missingValue %||% "NA",
        unsupported_settings = describe_unsupported_pls_settings(payload)
      ),
      stop_criterion_changes = extract_stop_criterion(summary_obj),
      post_hoc_power_analysis = extract_post_hoc_power_analysis(payload, data),
      execution_log = c(list(list(message = "PLS-SEM estimation completed")), lapply(describe_unsupported_pls_settings(payload), function(message) list(message = message)))
    ),
    model_and_data = list(
      inner_model = as_rows(model$path_coef),
      outer_model = as_rows(model$outer_loadings),
      indicator_data_original = as_rows(utils::head(data, 200)),
      indicator_data_standardized = as_rows(utils::head(standardize_data(data), 200)),
      indicator_data_correlations = extract_indicator_correlations(data)
    ),
    meta = list(
      mode = "pls-sem",
      algorithm = algorithm,
      algorithm_label = algorithm_label,
      hoc_method = core$hoc_method_label %||% hoc_method_label(payload$algorithmSettings, has_hoc = has_higher_order_construct(payload)),
      rows = nrow(data),
      columns = ncol(data),
      engine = "seminr"
    )
  )
}

list_first_non_null <- function(values) {
  for (value in values) {
    if (!is.null(value)) return(value)
  }
  NULL
}

row_identity <- function(row) {
  keys <- c("Construct", "construct", "Condition", "condition", "row_name", "Row", "ROW", "name")
  for (key in keys) {
    if (!is.null(row[[key]]) && nzchar(trimws(as.character(row[[key]])))) {
      return(trimws(as.character(row[[key]])))
    }
  }
  ""
}

canonicalize_priority_label <- function(value) {
  raw <- trimws(as.character(value %||% ""))
  if (!nzchar(raw)) return("")
  raw <- gsub("_", " ", raw, fixed = TRUE)
  paste(vapply(strsplit(tolower(raw), "\\s+")[[1]], function(part) {
    if (!nzchar(part)) return("")
    paste0(toupper(substr(part, 1, 1)), substr(part, 2, nchar(part)))
  }, character(1), USE.NAMES = FALSE), collapse = " ")
}

is_truthy_value <- function(value) {
  if (is.null(value) || length(value) == 0 || is.na(value)) return(FALSE)
  if (is.logical(value)) return(isTRUE(value[[1]]))
  normalized <- tolower(trimws(as.character(value[[1]])))
  normalized %in% c("true", "t", "1", "yes", "y")
}

classify_nca_effect <- function(d_value) {
  d <- suppressWarnings(as.numeric(d_value))[1]
  if (!is.finite(d) || is.na(d) || d <= 0) return("none")
  if (d < 0.1) return("small")
  if (d < 0.3) return("medium")
  if (d < 0.5) return("large")
  "very large"
}

classify_nca_status <- function(d_value, p_value, necessary_names = character(0), label = "") {
  label_key <- tolower(trimws(as.character(label %||% "")))
  if (nzchar(label_key) && label_key %in% necessary_names) return("necessary")

  d <- suppressWarnings(as.numeric(d_value))[1]
  p <- suppressWarnings(as.numeric(p_value))[1]
  if (is.finite(p) && !is.na(p) && p < 0.05 && is.finite(d) && !is.na(d) && d > 0) return("necessary")
  if ((is.finite(p) && !is.na(p) && p < 0.1) || (is.finite(d) && !is.na(d) && d >= 0.1)) return("borderline")
  "not_supported"
}

collect_target_predecessors <- function(payload, target_construct, scope = "all") {
  edges <- lapply(payload$paths %||% list(), function(path) {
    list(
      from = trimws(as.character(path$from %||% "")),
      to = trimws(as.character(path$to %||% ""))
    )
  })

  reverse_adj <- list()
  for (edge in edges) {
    if (!nzchar(edge$from) || !nzchar(edge$to) || identical(edge$from, edge$to)) next
    reverse_adj[[edge$to]] <- unique(c(reverse_adj[[edge$to]] %||% character(0), edge$from))
  }

  direct <- reverse_adj[[target_construct]] %||% character(0)
  direct <- direct[nzchar(direct)]
  if (identical(scope, "direct")) return(unique(direct))

  visited <- character(0)
  frontier <- unique(direct)
  while (length(frontier)) {
    current <- frontier[[1]]
    frontier <- frontier[-1]
    if (!nzchar(current) || current %in% visited) next
    visited <- c(visited, current)
    parents <- reverse_adj[[current]] %||% character(0)
    parents <- parents[nzchar(parents) & !(parents %in% visited)]
    frontier <- unique(c(frontier, parents))
  }

  unique(visited)
}

filter_rows_by_construct <- function(rows, allowed_names) {
  allowed <- unique(trimws(as.character(allowed_names %||% character(0))))
  allowed <- allowed[nzchar(allowed)]
  if (!length(allowed)) return(list())

  rows[unlist(lapply(rows, function(row) {
    identity <- row_identity(row)
    nzchar(identity) && identity %in% allowed
  }), use.names = FALSE)]
}

normalize_ipma_classification_rows <- function(summary_obj, allowed_names) {
  rows <- as_rows(summary_obj$classification %||% list())
  rows <- lapply(rows, function(row) {
    construct_name <- row_identity(row)
    importance <- suppressWarnings(as.numeric(row$Importance %||% row$importance))[1]
    performance <- suppressWarnings(as.numeric(row$Performance %||% row$performance))[1]
    high_importance <- is_truthy_value(row$High_Importance %||% row$high_importance)
    necessary <- is_truthy_value(row$Necessary %||% row$necessary)
    priority <- canonicalize_priority_label(row$Priority %||% row$priority)

    list(
      Construct = construct_name,
      Importance = if (is.finite(importance) && !is.na(importance)) importance else NULL,
      Performance = if (is.finite(performance) && !is.na(performance)) performance else NULL,
      High_Importance = high_importance,
      Necessary = necessary,
      Priority = priority
    )
  })
  filter_rows_by_construct(rows, allowed_names)
}

normalize_ipma_construct_rows <- function(summary_obj, allowed_names) {
  classification_rows <- normalize_ipma_classification_rows(summary_obj, allowed_names)
  classification_map <- setNames(classification_rows, vapply(classification_rows, function(row) {
    trimws(as.character(row$Construct %||% ""))
  }, character(1), USE.NAMES = FALSE))

  importance_unstd <- summary_obj$importance_unstd %||% numeric(0)
  importance_std <- summary_obj$importance_std %||% numeric(0)
  performance <- summary_obj$performance %||% numeric(0)

  all_names <- unique(c(
    names(importance_unstd),
    names(importance_std),
    names(performance),
    names(classification_map)
  ))
  all_names <- all_names[nzchar(trimws(as.character(all_names)))]

  rows <- lapply(all_names, function(name) {
    classification <- classification_map[[name]] %||% list()
    list(
      Construct = name,
      Importance = suppressWarnings(as.numeric(importance_unstd[[name]]))[1],
      Standardized_Importance = suppressWarnings(as.numeric(importance_std[[name]]))[1],
      Performance = suppressWarnings(as.numeric(performance[[name]]))[1],
      High_Importance = isTRUE(classification$High_Importance),
      Necessary = isTRUE(classification$Necessary),
      Priority = canonicalize_priority_label(classification$Priority %||% "")
    )
  })

  filter_rows_by_construct(rows, allowed_names)
}

nca_method_label <- function(method_key) {
  normalized <- tolower(trimws(as.character(method_key %||% "")))
  if (identical(normalized, "ce_fdh")) return("CE-FDH")
  if (identical(normalized, "cr_fdh")) return("CR-FDH")
  toupper(gsub("_", "-", normalized, fixed = TRUE))
}

extract_nca_method_metrics <- function(row, method_keys = c("ce_fdh", "cr_fdh")) {
  available_keys <- names(row %||% list())
  if (is.null(available_keys) || !length(available_keys)) {
    return(setNames(as.list(rep(NA_real_, length(method_keys))), method_keys))
  }

  available_lookup <- tolower(available_keys)
  metrics <- setNames(as.list(rep(NA_real_, length(method_keys))), method_keys)
  for (method_key in method_keys) {
    matched_idx <- match(tolower(method_key), available_lookup, nomatch = 0L)
    if (matched_idx <= 0L) next
    value <- suppressWarnings(as.numeric(row[[available_keys[[matched_idx]]]]))[1]
    if (is.finite(value) && !is.na(value)) {
      metrics[[method_key]] <- value
    }
  }

  metrics
}

normalize_nca_summary_rows <- function(summary_obj, allowed_names) {
  effect_rows <- as_rows(summary_obj$effect_sizes %||% list())
  significance_rows <- as_rows(summary_obj$significance %||% list())
  necessary_names <- tolower(trimws(as.character(unlist(summary_obj$necessary_predictors %||% character(0), use.names = FALSE))))
  necessary_names <- necessary_names[nzchar(necessary_names)]
  method_keys <- c("ce_fdh", "cr_fdh")

  named_rows <- function(rows) {
    row_map <- list()
    for (row in rows) {
      label <- row_identity(row)
      if (nzchar(label)) row_map[[label]] <- row
    }
    row_map
  }

  effect_map <- named_rows(effect_rows)
  significance_map <- named_rows(significance_rows)
  labels <- unique(c(names(effect_map), names(significance_map)))
  labels <- labels[nzchar(labels)]

  rows <- list()
  for (label in labels) {
    effect_metrics <- extract_nca_method_metrics(effect_map[[label]] %||% list(), method_keys)
    significance_metrics <- extract_nca_method_metrics(significance_map[[label]] %||% list(), method_keys)
    for (method_key in method_keys) {
      effect_value <- suppressWarnings(as.numeric(effect_metrics[[method_key]]))[1]
      p_value <- suppressWarnings(as.numeric(significance_metrics[[method_key]]))[1]
      if ((!is.finite(effect_value) || is.na(effect_value)) && (!is.finite(p_value) || is.na(p_value))) next
      effect_label <- classify_nca_effect(effect_value)
      status <- classify_nca_status(effect_value, p_value, necessary_names, label)
      necessary <- tolower(label) %in% necessary_names || identical(status, "necessary")
      rows[[length(rows) + 1L]] <- list(
        Condition = label,
        Method = nca_method_label(method_key),
        Ceiling = method_key,
        D = if (is.finite(effect_value) && !is.na(effect_value)) effect_value else NULL,
        P_Value = if (is.finite(p_value) && !is.na(p_value)) p_value else NULL,
        Effect_Label = effect_label,
        Status = status,
        Necessary = necessary
      )
    }
  }

  filter_rows_by_construct(rows, allowed_names)
}

normalize_bottleneck_name <- function(value) {
  tolower(gsub("[[:space:]_.()%/-]+", "", as.character(value %||% "")))
}

is_bottleneck_meta_column <- function(column_name) {
  normalize_bottleneck_name(column_name) %in% c("method", "ceiling", "ceilingline", "ceilingmethod")
}

is_bottleneck_outcome_column <- function(column_name) {
  normalize_bottleneck_name(column_name) %in% c(
    "outcomelevel",
    "outcome",
    "desiredoutcome",
    "desiredoutcomelevel",
    "targetlevel",
    "performancelevel",
    "level",
    "row",
    "rowname"
  )
}

looks_like_outcome_levels <- function(values) {
  nums <- suppressWarnings(as.numeric(unlist(values, use.names = FALSE)))
  finite <- is.finite(nums)
  if (sum(finite) < min(3L, length(values))) return(FALSE)

  nums <- nums[finite]
  if (any(nums < 0 | nums > 100)) return(FALSE)
  if (length(nums) > 1L && any(diff(nums) < 0)) return(FALSE)
  length(unique(nums)) >= min(3L, length(nums))
}

infer_bottleneck_outcome_key <- function(method_rows) {
  all_keys <- unique(unlist(lapply(method_rows, names), use.names = FALSE))
  all_keys <- all_keys[!vapply(all_keys, is_bottleneck_meta_column, logical(1))]
  if (!length(all_keys)) return(NULL)

  explicit <- all_keys[vapply(all_keys, is_bottleneck_outcome_column, logical(1))]
  if (length(explicit)) return(list(key = explicit[[1]], restore_condition = FALSE))

  first_key <- all_keys[[1]]
  first_values <- lapply(method_rows, function(row) row[[first_key]] %||% NA)
  if (looks_like_outcome_levels(first_values)) {
    return(list(key = first_key, restore_condition = TRUE))
  }

  NULL
}

normalize_bottleneck_rows <- function(summary_obj, method_keys = c("ce_fdh", "cr_fdh"), predictor_names = character(0), target_construct = NULL) {
  bottleneck <- summary_obj$bottleneck %||% list()
  rows <- list()
  predictor_names <- as.character(predictor_names %||% character(0))
  predictor_names <- predictor_names[!is.na(predictor_names) & nzchar(predictor_names)]
  target_construct <- as.character(target_construct %||% "")
  if (nzchar(target_construct)) {
    predictor_names <- predictor_names[predictor_names != target_construct]
  }
  for (method_key in method_keys) {
    method_rows <- as_rows(bottleneck[[method_key]])
    if (!length(method_rows)) next
    outcome_info <- infer_bottleneck_outcome_key(method_rows)
    outcome_key <- outcome_info$key %||% NULL
    restore_condition <- isTRUE(outcome_info$restore_condition)
    all_keys <- unique(unlist(lapply(method_rows, names), use.names = FALSE))
    raw_condition_keys <- all_keys[
      !vapply(all_keys, is_bottleneck_meta_column, logical(1)) &
        !vapply(all_keys, is_bottleneck_outcome_column, logical(1)) &
        !(all_keys %in% outcome_key)
    ]
    if (nzchar(target_construct)) {
      raw_condition_keys <- raw_condition_keys[raw_condition_keys != target_construct]
    }
    condition_keys <- if (length(predictor_names)) predictor_names else raw_condition_keys
    if (restore_condition && (!length(predictor_names) || outcome_key %in% predictor_names)) {
      condition_keys <- unique(c(outcome_key, condition_keys))
    }
    condition_keys <- unique(condition_keys)

    for (row in method_rows) {
      normalized <- list(
        Method = "NCA",
        Ceiling = nca_method_label(method_key),
        Outcome_Level = if (!is.null(outcome_key)) row[[outcome_key]] %||% NULL else NULL
      )
      for (condition_key in condition_keys) {
        normalized[[condition_key]] <- if (restore_condition && identical(condition_key, outcome_key)) {
          "NN"
        } else {
          row[[condition_key]] %||% "NN"
        }
      }
      rows[[length(rows) + 1L]] <- normalized
    }
  }
  rows
}

sample_evenly <- function(length_value, max_items) {
  if (length_value <= max_items) return(seq_len(length_value))
  unique(pmax(1L, pmin(length_value, round(seq(1, length_value, length.out = max_items)))))
}

compute_ce_fdh_frontier <- function(x, y) {
  max_y_at_x <- aggregate(y, by = list(X = x), FUN = max)
  names(max_y_at_x) <- c("X", "Y")
  max_y_at_x <- max_y_at_x[order(max_y_at_x$X), , drop = FALSE]
  data.frame(
    X = max_y_at_x$X,
    Y = cummax(max_y_at_x$Y),
    stringsAsFactors = FALSE,
    check.names = FALSE
  )
}

get_ce_fdh_peers <- function(x, y) {
  max_y_at_x <- aggregate(y, by = list(X = x), FUN = max)
  names(max_y_at_x) <- c("X", "Y")
  max_y_at_x <- max_y_at_x[order(max_y_at_x$X), , drop = FALSE]
  if (nrow(max_y_at_x) < 2L) return(max_y_at_x)
  ceiling_y <- cummax(max_y_at_x$Y)
  is_peer <- c(TRUE, max_y_at_x$Y[-1] > ceiling_y[-length(ceiling_y)])
  max_y_at_x[is_peer, , drop = FALSE]
}

build_nca_ceiling_rows <- function(core, target_construct, predecessor_names, max_points = 120L, max_line_points = 48L) {
  scores <- core$model$construct_scores %||% NULL
  if (is.null(scores) || !(is.matrix(scores) || is.data.frame(scores))) return(list())
  scores <- as.data.frame(scores, check.names = FALSE)
  if (!(target_construct %in% names(scores))) return(list())

  rows <- list()
  append_row <- function(row) {
    rows[[length(rows) + 1L]] <<- row
  }

  for (predictor in predecessor_names) {
    if (!(predictor %in% names(scores))) next
    x <- suppressWarnings(as.numeric(scores[[predictor]]))
    y <- suppressWarnings(as.numeric(scores[[target_construct]]))
    keep <- is.finite(x) & is.finite(y)
    x <- x[keep]
    y <- y[keep]
    if (length(x) < 2L) next

    ordered <- order(x, y)
    sorted_x <- x[ordered]
    sorted_y <- y[ordered]
    point_indices <- sample_evenly(length(sorted_x), max_points)
    for (idx in point_indices) {
      append_row(list(
        Condition = predictor,
        Target = target_construct,
        Series = "Observed",
        X = sorted_x[[idx]],
        Y = sorted_y[[idx]]
      ))
    }

    frontier <- compute_ce_fdh_frontier(x, y)
    line_indices <- sample_evenly(nrow(frontier), max_line_points)
    for (idx in line_indices) {
      append_row(list(
        Condition = predictor,
        Target = target_construct,
        Series = "CE-FDH",
        X = frontier$X[[idx]],
        Y = frontier$Y[[idx]]
      ))
    }

    peers <- get_ce_fdh_peers(x, y)
    if (nrow(peers) >= 2L) {
      fit <- try(stats::lm(Y ~ X, data = peers), silent = TRUE)
      if (!inherits(fit, "try-error")) {
        cr_x <- seq(min(sorted_x), max(sorted_x), length.out = min(max_line_points, 32L))
        cr_y <- suppressWarnings(as.numeric(stats::predict(fit, newdata = data.frame(X = cr_x))))
        cr_y <- pmin(pmax(cr_y, min(y)), max(y))
        for (idx in seq_along(cr_x)) {
          if (!is.finite(cr_x[[idx]]) || !is.finite(cr_y[[idx]])) next
          append_row(list(
            Condition = predictor,
            Target = target_construct,
            Series = "CR-FDH",
            X = cr_x[[idx]],
            Y = cr_y[[idx]]
          ))
        }
      }
    }
  }

  rows
}

run_advanced_sections <- function(payload, data, core, timings = NULL) {
  if (!requireNamespace("seminrExtras", quietly = TRUE)) {
    stop("Advanced analysis requires seminrExtras in the R backend.")
  }

  target_construct <- as.character(payload$targetConstruct %||% "")
  if (!nzchar(target_construct)) {
    stop("targetConstruct is required for advanced analysis.")
  }

  predecessor_scope <- tolower(as.character(payload$predecessorScope %||% "all"))
  if (!(predecessor_scope %in% c("all", "direct"))) predecessor_scope <- "all"
  predecessor_names <- collect_target_predecessors(payload, target_construct, predecessor_scope)
  if (!length(predecessor_names)) {
    stop(sprintf("Selected target '%s' has no predecessors in the current model.", target_construct))
  }

  analyses <- payload$analyses %||% list(ipma = FALSE, nca = FALSE, cipma = FALSE)
  if (!any(unlist(analyses, use.names = FALSE))) {
    stop("Select at least one advanced analysis.")
  }

  run_depth <- as.integer(payload$runDepth %||% 500L)
  if (is.na(run_depth) || run_depth < 10L) run_depth <- 500L
  if (is.finite(nca_run_depth_ceiling())) {
    run_depth <- min(run_depth, nca_run_depth_ceiling())
  }

  bottleneck_step <- as.integer(payload$bottleneckStepSize %||% 10L)
  if (is.na(bottleneck_step) || bottleneck_step < 1L) bottleneck_step <- 10L
  bottleneck_step <- min(bottleneck_step, 50L)

  execution_log <- list()
  append_log <- function(message_text) {
    execution_log[[length(execution_log) + 1L]] <<- list(message = message_text)
  }

  ipma_summary <- NULL
  nca_summary <- NULL
  cipma_summary <- NULL

  # Each sub-analysis runs in its own tryCatch so a failure in one (including a
  # `node stack overflow` from seminrExtras on a pathological model) degrades to a
  # clear note and partial results instead of failing the whole request with a 500.
  if (isTRUE(analyses$ipma)) {
    tryCatch({
      ipma_result <- timed_or_direct(timings, "advanced assess_ipma", seminrExtras::assess_ipma(
        seminr_model = core$model,
        target = target_construct,
        scale_min = 1,
        scale_max = 7,
        seed = 123
      ))
      ipma_summary <- timed_or_direct(timings, "advanced summary ipma", summary(ipma_result))
      append_log(sprintf("IPMA completed for target '%s'.", target_construct))
    }, error = function(err) {
      append_log(sprintf("IPMA could not be computed for target '%s': %s", target_construct, conditionMessage(err)))
    })
  }

  if (isTRUE(analyses$nca) && !isTRUE(analyses$cipma)) {
    tryCatch({
      nca_result <- timed_or_direct(timings, "advanced assess_nca", seminrExtras::assess_nca(
        seminr_model = core$model,
        target = target_construct,
        predictors = predecessor_names,
        test.rep = run_depth,
        steps = bottleneck_step,
        seed = 123
      ), details = list(replications = run_depth))
      nca_summary <- timed_or_direct(timings, "advanced summary nca", summary(nca_result))
      append_log(sprintf("NCA completed for target '%s' with %s replications.", target_construct, run_depth))
    }, error = function(err) {
      append_log(sprintf("NCA could not be computed for target '%s': %s", target_construct, conditionMessage(err)))
    })
  }

  if (isTRUE(analyses$cipma)) {
    tryCatch({
      cipma_result <- timed_or_direct(timings, "advanced assess_cipma", seminrExtras::assess_cipma(
        seminr_model = core$model,
        target = target_construct,
        scale_min = 1,
        scale_max = 7,
        nca = isTRUE(analyses$nca),
        nca_ceilings = c("ce_fdh", "cr_fdh"),
        nca_test.rep = run_depth,
        nca_steps = bottleneck_step,
        seed = 123
      ), details = list(nca = isTRUE(analyses$nca), nca_replications = run_depth))
      cipma_summary <- timed_or_direct(timings, "advanced summary cipma", summary(cipma_result))
      append_log(sprintf("cIPMA completed for target '%s'.", target_construct))
      if (isTRUE(analyses$nca)) {
        append_log(sprintf("NCA tables reused cIPMA's integrated NCA run for target '%s'.", target_construct))
      }
    }, error = function(err) {
      append_log(sprintf("cIPMA could not be computed for target '%s': %s", target_construct, conditionMessage(err)))
    })
  }

  priority_map <- if (!is.null(ipma_summary)) {
    normalize_ipma_classification_rows(ipma_summary, predecessor_names)
  } else if (!is.null(cipma_summary)) {
    normalize_ipma_classification_rows(cipma_summary, predecessor_names)
  } else {
    list()
  }

  construct_table <- if (!is.null(ipma_summary)) {
    normalize_ipma_construct_rows(ipma_summary, predecessor_names)
  } else {
    list()
  }

  necessity_source <- if (isTRUE(analyses$nca)) {
    nca_summary %||% (cipma_summary$nca %||% NULL)
  } else {
    NULL
  }
  necessity_check <- if (!is.null(necessity_source)) {
    normalize_nca_summary_rows(necessity_source, predecessor_names)
  } else {
    list()
  }

  bottleneck_source <- if (isTRUE(analyses$nca)) {
    nca_summary %||% (cipma_summary$nca %||% NULL)
  } else {
    NULL
  }
  bottleneck_table <- if (!is.null(bottleneck_source)) {
    normalize_bottleneck_rows(bottleneck_source, predictor_names = predecessor_names, target_construct = target_construct)
  } else {
    list()
  }
  ceiling_lines <- if (!is.null(necessity_source)) {
    build_nca_ceiling_rows(core, target_construct, predecessor_names)
  } else {
    list()
  }

  cipma_priorities <- if (!is.null(cipma_summary)) {
    normalize_ipma_classification_rows(cipma_summary, predecessor_names)
  } else {
    list()
  }

  algorithm <- if (!is.null(payload$algorithm)) tolower(as.character(payload$algorithm)) else "standard"
  if (!(algorithm %in% c("standard", "consistent"))) algorithm <- "standard"
  algorithm_label <- if (algorithm == "consistent") "Consistent PLS (PLSc)" else "Standard PLS"
  pls_sections <- timed_or_direct(timings, "advanced extract base pls sections", extract_pls_sections(payload, data, core))

  list(
    final_results = list(
      path_coefficients = pls_sections$final_results$path_coefficients,
      outer_loadings = pls_sections$final_results$outer_loadings,
      priority_map = priority_map,
      construct_table = construct_table,
      necessity_check = necessity_check,
      bottleneck_table = bottleneck_table,
      ceiling_lines = ceiling_lines,
      cipma_priorities = cipma_priorities
    ),
    quality_criteria = list(
      model_fit = pls_sections$quality_criteria$model_fit
    ),
    algorithm = list(
      settings = list(
        mode = "Advanced analysis",
        base_mode = "PLS-SEM",
        algorithm = algorithm,
        algorithm_label = algorithm_label,
        algorithm_settings = pls_sections$algorithm$settings$algorithm_settings %||% list(),
        target_construct = target_construct,
        predecessor_scope = predecessor_scope,
        run_depth = run_depth,
        bottleneck_step_size = bottleneck_step,
        analyses = analyses
      ),
      execution_log = execution_log
    ),
    execution_log = execution_log,
    model_and_data = pls_sections$model_and_data,
    meta = list(
      mode = "advanced",
      algorithm = algorithm,
      algorithm_label = algorithm_label,
      rows = nrow(data),
      columns = ncol(data),
      engine = "seminr",
      analysis_settings = list(
        advanced = list(
          targetConstruct = target_construct,
          predecessorScope = predecessor_scope,
          analyses = analyses,
          runDepth = run_depth,
          bottleneckStepSize = bottleneck_step
        )
      )
    )
  )
}

plspredict_default_folds <- function() 10L
plspredict_default_repetitions <- function() 1L
plspredict_default_seed <- function() 123L

normalize_plspredict_technique <- function(value) {
  normalized <- toupper(trimws(as.character(value %||% "DA")))
  if (normalized %in% c("EA", "ENTIRE ANTECEDENTS (EA)", "EARLIEST ANTECEDENTS (EA)")) return(seminr::predict_EA)
  seminr::predict_DA
}

plspredict_fold_assignments <- function(model_data, folds, seed) {
  if (is.null(model_data) || !nrow(model_data)) return(integer(0))
  folds <- min(as.integer(folds), nrow(model_data))
  if (is.na(folds) || folds < 2L) stop("PLSpredict requires at least two observations for cross-validation.")
  row_ids <- rownames(model_data)
  if (is.null(row_ids) || anyDuplicated(row_ids)) stop("PLSpredict requires unique row names to align folds and predictions.")
  set.seed(seed)
  order <- sample(nrow(model_data), nrow(model_data), replace = FALSE)
  ordered_ids <- row_ids[order]
  fold_ids <- cut(seq_len(nrow(model_data)), breaks = folds, labels = FALSE)
  setNames(as.integer(fold_ids), ordered_ids)
}

normalize_plspredict_cv_result <- function(predict_model, model, effective_folds, effective_reps, prediction_seed, validation_mode = "K-fold") {
  as_df <- function(value) if (is.null(value)) NULL else as.data.frame(value, stringsAsFactors = FALSE)

  pls_oos <- as_df(predict_model$items[["PLS_out_of_sample"]])
  pls_in_sample <- as_df(predict_model$items[["PLS_in_sample"]])
  lm_oos <- as_df(predict_model$items[["lm_out_of_sample"]])
  lm_in_sample <- as_df(predict_model$items[["lm_in_sample"]])
  item_actuals <- as_df(predict_model$items[["item_actuals"]])
  pls_oos_residuals <- as_df(predict_model$items[["PLS_out_of_sample_residuals"]])
  pls_in_sample_residuals <- as_df(predict_model$items[["PLS_in_sample_residuals"]])
  lm_oos_residuals <- as_df(predict_model$items[["lm_out_of_sample_residuals"]])
  lm_in_sample_residuals <- as_df(predict_model$items[["lm_in_sample_residuals"]])
  composite_oos <- as_df(predict_model$composites[["composite_out_of_sample"]])
  composite_in_sample <- as_df(predict_model$composites[["composite_in_sample"]])
  actuals_star <- as_df(predict_model$composites[["actuals_star"]])

  align_frames <- function(frames) {
    frames <- lapply(frames, as_df)
    if (any(vapply(frames, is.null, logical(1)))) return(NULL)
    row_sets <- lapply(frames, rownames)
    if (any(vapply(row_sets, is.null, logical(1))) || any(vapply(row_sets, anyDuplicated, integer(1)) > 0)) return(NULL)
    if (!all(vapply(row_sets[-1], identical, logical(1), row_sets[[1]]))) return(NULL)
    common <- row_sets[[1]]
    lapply(frames, function(frame) frame[common, , drop = FALSE])
  }

  mv_frames <- align_frames(list(item_actuals, pls_oos, pls_oos_residuals, lm_oos, lm_oos_residuals))
  if (is.null(mv_frames)) return(NULL)

  item_actuals <- mv_frames[[1]]
  pls_oos <- mv_frames[[2]]
  pls_oos_residuals <- mv_frames[[3]]
  lm_oos <- mv_frames[[4]]
  lm_oos_residuals <- mv_frames[[5]]

  common_rows <- rownames(item_actuals)
  is_loocv <- toupper(as.character(validation_mode %||% "K-fold")) == "LOOCV"
  fold_map <- if (is_loocv) {
    setNames(seq_along(common_rows), common_rows)
  } else {
    plspredict_fold_assignments(model$data[common_rows, , drop = FALSE], effective_folds, prediction_seed)[common_rows]
  }

  indicators <- Reduce(intersect, list(
    colnames(item_actuals),
    colnames(pls_oos),
    colnames(pls_oos_residuals),
    colnames(lm_oos),
    colnames(lm_oos_residuals)
  ))

  sm <- as.matrix(model$smMatrix)
  endogenous_constructs <- if ("target" %in% colnames(sm)) unique(as.character(sm[, "target"])) else character(0)
  endogenous_constructs <- endogenous_constructs[!is.na(endogenous_constructs) & nzchar(endogenous_constructs)]

  lv_frames <- align_frames(list(composite_oos, actuals_star))
  if (!is.null(lv_frames)) {
    composite_oos <- lv_frames[[1]]
    actuals_star <- lv_frames[[2]]
    constructs <- intersect(colnames(composite_oos), colnames(actuals_star))
    endogenous_constructs <- intersect(constructs, endogenous_constructs)
  } else {
    endogenous_constructs <- character(0)
  }

  n_rows <- nrow(item_actuals)
  ia_predictions <- matrix(NA_real_, nrow = n_rows, ncol = length(indicators), dimnames = list(common_rows, indicators))
  ia_residuals <- matrix(NA_real_, nrow = n_rows, ncol = length(indicators), dimnames = list(common_rows, indicators))

  for (j in seq_along(indicators)) {
    ind <- indicators[[j]]
    raw_vals <- suppressWarnings(as.numeric(model$data[common_rows, ind]))
    act_vals <- suppressWarnings(as.numeric(item_actuals[[ind]]))
    for (i in seq_len(n_rows)) {
      train_indices <- if (is_loocv) seq_len(n_rows)[-i] else which(fold_map != fold_map[[i]])
      train_sample <- raw_vals[train_indices]
      train_sample <- train_sample[is.finite(train_sample)]
      if (length(train_sample) > 0) {
        train_mean <- mean(train_sample)
        ia_predictions[i, j] <- train_mean
        ia_residuals[i, j] <- act_vals[[i]] - train_mean
      }
    }
  }
  ia_predictions <- as.data.frame(ia_predictions, stringsAsFactors = FALSE)
  ia_residuals <- as.data.frame(ia_residuals, stringsAsFactors = FALSE)

  pls_mv_loss <- as.data.frame(pls_oos_residuals[, indicators, drop = FALSE]^2, stringsAsFactors = FALSE)
  lm_mv_loss <- as.data.frame(lm_oos_residuals[, indicators, drop = FALSE]^2, stringsAsFactors = FALSE)
  ia_mv_loss <- as.data.frame(ia_residuals[, indicators, drop = FALSE]^2, stringsAsFactors = FALSE)

  lv_ia_predictions <- matrix(NA_real_, nrow = n_rows, ncol = length(endogenous_constructs), dimnames = list(common_rows, endogenous_constructs))
  lv_ia_residuals <- matrix(NA_real_, nrow = n_rows, ncol = length(endogenous_constructs), dimnames = list(common_rows, endogenous_constructs))
  lv_pls_residuals <- matrix(NA_real_, nrow = n_rows, ncol = length(endogenous_constructs), dimnames = list(common_rows, endogenous_constructs))

  for (k in seq_along(endogenous_constructs)) {
    con <- endogenous_constructs[[k]]
    act_con_scores <- suppressWarnings(as.numeric(actuals_star[[con]]))
    pred_con_scores <- suppressWarnings(as.numeric(composite_oos[[con]]))
    lv_pls_residuals[, k] <- act_con_scores - pred_con_scores
    for (i in seq_len(n_rows)) {
      train_indices <- if (is_loocv) seq_len(n_rows)[-i] else which(fold_map != fold_map[[i]])
      train_scores <- act_con_scores[train_indices]
      train_scores <- train_scores[is.finite(train_scores)]
      if (length(train_scores) > 0) {
        con_train_mean <- mean(train_scores)
        lv_ia_predictions[i, k] <- con_train_mean
        lv_ia_residuals[i, k] <- act_con_scores[[i]] - con_train_mean
      }
    }
  }
  lv_ia_predictions <- as.data.frame(lv_ia_predictions, stringsAsFactors = FALSE)
  lv_ia_residuals <- as.data.frame(lv_ia_residuals, stringsAsFactors = FALSE)
  lv_pls_residuals <- as.data.frame(lv_pls_residuals, stringsAsFactors = FALSE)

  pls_lv_loss <- matrix(NA_real_, nrow = n_rows, ncol = length(endogenous_constructs), dimnames = list(common_rows, endogenous_constructs))
  lm_lv_loss <- matrix(NA_real_, nrow = n_rows, ncol = length(endogenous_constructs), dimnames = list(common_rows, endogenous_constructs))
  ia_lv_loss <- matrix(NA_real_, nrow = n_rows, ncol = length(endogenous_constructs), dimnames = list(common_rows, endogenous_constructs))

  mm <- as.matrix(model$mmMatrix)
  for (con in endogenous_constructs) {
    con_items <- if (nrow(mm) > 0 && ncol(mm) >= 2) as.character(mm[mm[, 1] == con, 2]) else character(0)
    valid_items <- intersect(con_items, indicators)
    if (length(valid_items) > 0) {
      pls_lv_loss[, con] <- rowMeans(pls_oos_residuals[, valid_items, drop = FALSE]^2)
      lm_lv_loss[, con] <- rowMeans(lm_oos_residuals[, valid_items, drop = FALSE]^2)
      ia_lv_loss[, con] <- rowMeans(ia_residuals[, valid_items, drop = FALSE]^2)
    }
  }
  pls_lv_loss <- as.data.frame(pls_lv_loss, stringsAsFactors = FALSE)
  lm_lv_loss <- as.data.frame(lm_lv_loss, stringsAsFactors = FALSE)
  ia_lv_loss <- as.data.frame(ia_lv_loss, stringsAsFactors = FALSE)

  list(
    fold_assignments = fold_map,
    indicators = indicators,
    constructs = endogenous_constructs,
    mv = list(
      actuals = item_actuals[, indicators, drop = FALSE],
      pls_pred = pls_oos[, indicators, drop = FALSE],
      pls_resid = pls_oos_residuals[, indicators, drop = FALSE],
      lm_pred = lm_oos[, indicators, drop = FALSE],
      lm_resid = lm_oos_residuals[, indicators, drop = FALSE],
      ia_pred = ia_predictions,
      ia_resid = ia_residuals,
      pls_loss = pls_mv_loss,
      lm_loss = lm_mv_loss,
      ia_loss = ia_mv_loss
    ),
    lv = list(
      actuals = actuals_star[, endogenous_constructs, drop = FALSE],
      pls_pred = composite_oos[, endogenous_constructs, drop = FALSE],
      pls_resid = lv_pls_residuals,
      ia_pred = lv_ia_predictions,
      ia_resid = lv_ia_residuals,
      pls_loss = pls_lv_loss,
      lm_loss = lm_lv_loss,
      ia_loss = ia_lv_loss
    )
  )
}

extract_plspredict_sections <- function(payload, data, core, predict_model, folds = NULL, reps = NULL, timings = NULL, prediction_representation = "Standard", prediction_core = core) {
  model <- core$model
  prediction_model <- prediction_core$model
  prediction_indicator_aliases <- prediction_core$prediction_indicator_aliases %||% list()
  validation_mode <- if (toupper(as.character(payload$validationMode %||% "K-fold")) == "LOOCV") "LOOCV" else "K-fold"
  effective_folds <- if (validation_mode == "LOOCV") nrow(prediction_model$data) else as.integer(folds %||% payload$folds %||% plspredict_default_folds())
  effective_reps <- as.integer(reps %||% payload$repetitions %||% plspredict_default_repetitions())
  prediction_seed <- as.integer(payload$predictionSeed %||% payload$prediction_seed %||% plspredict_default_seed())
  technique_label <- if (toupper(as.character(payload$technique %||% payload$predictionTechnique %||% "DA")) %in% c("EA", "ENTIRE ANTECEDENTS (EA)", "EARLIEST ANTECEDENTS (EA)")) "Earliest antecedents (EA)" else "Direct antecedents (DA)"

  scalar <- function(value) {
    number <- suppressWarnings(as.numeric(value))
    if (!length(number) || !is.finite(number[[1]])) NULL else number[[1]]
  }
  metric <- function(values, kind) {
    numbers <- suppressWarnings(as.numeric(values))
    numbers <- numbers[is.finite(numbers)]
    if (!length(numbers)) return(NULL)
    if (kind == "rmse") sqrt(mean(numbers^2)) else mean(abs(numbers))
  }

  cv_res <- normalize_plspredict_cv_result(
    predict_model = predict_model,
    model = prediction_model,
    effective_folds = effective_folds,
    effective_reps = effective_reps,
    prediction_seed = prediction_seed,
    validation_mode = validation_mode
  )

  mv_summary <- list()
  mv_pred_err <- list()
  mv_log <- list()

  if (!is.null(cv_res) && length(cv_res$indicators) > 0) {
    actuals <- cv_res$mv$actuals
    pls_predictions <- cv_res$mv$pls_pred
    pls_errors <- cv_res$mv$pls_resid
    lm_predictions <- cv_res$mv$lm_pred
    lm_errors <- cv_res$mv$lm_resid
    ia_predictions <- cv_res$mv$ia_pred
    ia_errors <- cv_res$mv$ia_resid
    indicators <- cv_res$indicators

    for (indicator in indicators) {
      alias_details <- prediction_indicator_aliases[[indicator]]
      indicator_label <- if (is.null(alias_details)) {
        indicator
      } else if (as.character(alias_details$indicator) %in% indicators) {
        sprintf("%s (%s)", as.character(alias_details$indicator), as.character(alias_details$construct))
      } else {
        as.character(alias_details$indicator)
      }

      pls_err_vec <- suppressWarnings(as.numeric(pls_errors[[indicator]]))
      lm_err_vec <- suppressWarnings(as.numeric(lm_errors[[indicator]]))
      ia_err_vec <- suppressWarnings(as.numeric(ia_errors[[indicator]]))
      valid_common <- is.finite(pls_err_vec) & is.finite(ia_err_vec)
      sse_pls <- sum(pls_err_vec[valid_common]^2)
      sse_ia <- sum(ia_err_vec[valid_common]^2)
      q2_val <- if (sse_ia > 0) (1 - sse_pls / sse_ia) else NA_real_

      mv_summary[[length(mv_summary) + 1L]] <- list(
        Indicator = indicator_label,
        Q2predict = scalar(q2_val),
        PLS_SEM_RMSE = scalar(metric(pls_err_vec, "rmse")),
        PLS_SEM_MAE = scalar(metric(pls_err_vec, "mae")),
        LM_RMSE = scalar(metric(lm_err_vec, "rmse")),
        LM_MAE = scalar(metric(lm_err_vec, "mae")),
        IA_RMSE = scalar(metric(ia_err_vec, "rmse")),
        IA_MAE = scalar(metric(ia_err_vec, "mae"))
      )

      for (case_id in seq_len(nrow(actuals))) {
        mv_pred_err[[length(mv_pred_err) + 1L]] <- list(
          Case = rownames(actuals)[[case_id]],
          Indicator = indicator_label,
          Actual = scalar(actuals[case_id, indicator]),
          `PLS Prediction` = scalar(pls_predictions[case_id, indicator]),
          `PLS Error` = scalar(pls_errors[case_id, indicator]),
          `LM Prediction` = scalar(lm_predictions[case_id, indicator]),
          `LM Error` = scalar(lm_errors[case_id, indicator]),
          `IA Prediction` = scalar(ia_predictions[case_id, indicator]),
          `IA Error` = scalar(ia_errors[case_id, indicator])
        )
      }
    }
    mv_log <- list(list(message = sprintf("Extracted %s endogenous indicator predictions from SEMinR native items slots.", length(indicators))))
  } else {
    mv_log <- list(list(message = "MV prediction/error panels are empty because SEMinR native item prediction slots were unavailable or could not be aligned."))
  }

  lv_summary <- list()
  lv_pred_err <- list()
  lv_log <- list()

  if (!is.null(cv_res) && length(cv_res$constructs) > 0) {
    lv_actuals <- cv_res$lv$actuals
    lv_predictions <- cv_res$lv$pls_pred
    lv_errors <- cv_res$lv$pls_resid
    lv_ia_errors <- cv_res$lv$ia_resid
    constructs <- cv_res$constructs

    for (construct in constructs) {
      pls_err_con <- suppressWarnings(as.numeric(lv_errors[[construct]]))
      ia_err_con <- suppressWarnings(as.numeric(lv_ia_errors[[construct]]))
      valid_common <- is.finite(pls_err_con) & is.finite(ia_err_con)
      sse_pls_con <- sum(pls_err_con[valid_common]^2)
      sse_ia_con <- sum(ia_err_con[valid_common]^2)
      q2_con <- if (sse_ia_con > 0) (1 - sse_pls_con / sse_ia_con) else NA_real_

      lv_summary[[length(lv_summary) + 1L]] <- list(
        Construct = construct,
        Q2predict = scalar(q2_con),
        PLS_SEM_RMSE = scalar(metric(pls_err_con, "rmse")),
        PLS_SEM_MAE = scalar(metric(pls_err_con, "mae"))
      )

      for (case_id in seq_len(nrow(lv_predictions))) {
        lv_pred_err[[length(lv_pred_err) + 1L]] <- list(
          Case = rownames(lv_predictions)[[case_id]],
          Construct = construct,
          Actual = scalar(lv_actuals[case_id, construct]),
          `PLS Prediction` = scalar(lv_predictions[case_id, construct]),
          `PLS Error` = scalar(lv_errors[case_id, construct])
        )
      }
    }
    lv_log <- list(list(message = sprintf("Extracted %s endogenous construct predictions from SEMinR native composite slots.", length(constructs))))
  } else {
    lv_log <- list(list(message = "LV prediction/error panels are empty because SEMinR native composite prediction slots were unavailable or could not be aligned."))
  }

  cvpat_enabled <- isTRUE(payload$cvpatEnabled)
  cvpat <- if (cvpat_enabled) {
    timed_or_direct(
      timings,
      "plspredict cvpat assessment",
      run_cvpat_assessment(
        prediction_core,
        effective_folds,
        effective_reps,
        payload,
        prediction_seed,
        validation_mode,
        cv_res = cv_res
      ),
      details = list(folds = effective_folds, repetitions = effective_reps, validation_mode = validation_mode)
    )
  } else {
    list(
      status = "disabled",
      lv_ia = list(),
      lv_lm = list(),
      lv_rows = list(),
      mv_ia = list(),
      mv_lm = list(),
      mv_rows = list(),
      execution_log = list()
    )
  }

  algorithm <- if (tolower(as.character(payload$algorithm %||% "standard")) == "consistent") "consistent" else "standard"
  algorithm_label <- if (algorithm == "consistent") "Consistent PLS (PLSc)" else "Standard PLS"
  unsupported <- c(if (grepl("centroid", tolower(as.character(payload$algorithmSettings$innerWeighting %||% ""))) || grepl("loh", tolower(as.character(payload$algorithmSettings$initialWeights %||% ""))) || grepl("random", tolower(as.character(payload$algorithmSettings$initialWeights %||% "")))) "The installed SEMinR version does not expose centroid inner weighting or selectable initial outer weights; the request is recorded and SEMinR's supported defaults are used." else character(0))
  mv_histogram <- lapply(mv_pred_err, function(row) list(Indicator = row$Indicator, Error = row[["PLS Error"]]))
  mv_histogram <- Filter(function(row) !is.null(row$Error) && is.finite(row$Error), mv_histogram)
  lv_histogram <- lapply(lv_pred_err, function(row) list(Construct = row$Construct, Error = row[["PLS Error"]]))
  lv_histogram <- Filter(function(row) !is.null(row$Error) && is.finite(row$Error), lv_histogram)
  execution_log <- c(list(list(message = sprintf("PLSpredict used SEMinR predict_pls with %s, %s, %s repetitions, seed %s, and %s model representation.", technique_label, validation_mode, effective_reps, prediction_seed, prediction_representation))), mv_log, lv_log, cvpat$execution_log)

  cvpat_lv_summary <- if (length(cvpat$lv_ia) || length(cvpat$lv_lm)) list(ia = cvpat$lv_ia, lm = cvpat$lv_lm) else list()
  cvpat_mv_summary <- if (length(cvpat$mv_ia) || length(cvpat$mv_lm)) list(ia = cvpat$mv_ia, lm = cvpat$mv_lm) else list()

  list(
    final_results = list(
      plspredict_mv_summary = mv_summary,
      plspredict_lv_summary = lv_summary,
      cvpat_mv_summary = cvpat_mv_summary,
      cvpat_mv_ia = cvpat$mv_ia,
      cvpat_mv_lm = cvpat$mv_lm,
      cvpat_lv_summary = cvpat_lv_summary,
      cvpat_compare_ia = cvpat$lv_ia,
      cvpat_compare_lm = cvpat$lv_lm,
      mv_predictions_and_errors = mv_pred_err,
      lv_predictions_and_errors = lv_pred_err
    ),
    algorithm = list(
      settings = list(
        method = "PLSpredict",
        engine = "SEMinR",
        mode = "PLS-SEM",
        algorithm = algorithm,
        algorithm_label = algorithm_label,
        hoc_method = if (has_higher_order_construct(payload)) "Repeated Indicators" else NULL,
        prediction_technique = technique_label,
        cross_validation = validation_mode,
        folds = effective_folds,
        repetitions = effective_reps,
        prediction_seed = prediction_seed,
        prediction_cores = "SEMinR default (NULL)",
        cvpat_enabled = cvpat_enabled,
        cvpat_status = cvpat$status,
        model_representation = prediction_representation,
        algorithm_settings = payload$algorithmSettings %||% list(),
        missing_data = payload$algorithmSettings$missingData %||% "Mean replacement",
        assess_syntax = isTRUE(payload$algorithmSettings$assessSyntax),
        missing_value_sentinel = payload$algorithmSettings$missingValue %||% "NA",
        initial_weights_requested = payload$algorithmSettings$initialWeights %||% "1 (uniform)",
        initial_weights_status = "SEMinR 2.5.0 does not expose a public initial-weights argument; SEMinR default initialization was used.",
        unsupported_settings = unsupported
      ),
      execution_log = execution_log
    ),
    histograms = list(plsem_mv_error_histogram = mv_histogram, plsem_lv_error_histogram = lv_histogram),
    model_and_data = list(
      inner_model = as_rows(model$path_coef),
      outer_model = as_rows(model$outer_loadings),
      indicator_data_original = as_rows(utils::head(data, 200)),
      indicator_data_standardized = as_rows(utils::head(standardize_data(data), 200))
    ),
    meta = list(
      mode = "plspredict",
      algorithm = algorithm,
      algorithm_label = algorithm_label,
      hoc_method = if (has_higher_order_construct(payload)) "Repeated Indicators" else NULL,
      rows = nrow(data),
      columns = ncol(data),
      engine = "seminr",
      analysis_settings = list(
        plspredict = list(
          folds = effective_folds,
          repetitions = effective_reps,
          technique = technique_label,
          predictionSeed = prediction_seed,
          validationMode = validation_mode,
          cvpatEnabled = cvpat_enabled
        )
      ),
      cvpat_status = cvpat$status
    )
  )
}

micom_group_count <- function(data, grouping_variable, group_value) {
  labels <- as.character(data[[grouping_variable]])
  sum(!is.na(labels) & nzchar(labels) & labels == group_value)
}

is_supported_decision <- function(value) {
  identical(tolower(as.character(value %||% "")), "supported")
}

classify_micom_constructs <- function(step2_rows, step3_rows) {
  if (!length(step2_rows)) return(list())

  step3_by_construct <- list()
  for (row in step3_rows) {
    construct <- as.character(row$construct %||% "")
    if (nzchar(construct)) step3_by_construct[[construct]] <- row
  }

  lapply(step2_rows, function(row) {
    construct <- as.character(row$construct %||% "")
    step3 <- step3_by_construct[[construct]]
    classification <- "none"
    if (is_supported_decision(row$decision)) {
      classification <- if (
        !is.null(step3) &&
        is_supported_decision(step3$mean_decision) &&
        is_supported_decision(step3$variance_decision)
      ) "full" else "partial"
    }

    list(
      construct = construct,
      classification = classification,
      compositionalDecision = row$decision %||% NULL,
      meanDecision = if (!is.null(step3)) step3$mean_decision %||% NULL else NULL,
      varianceDecision = if (!is.null(step3)) step3$variance_decision %||% NULL else NULL
    )
  })
}

micom_admissibility_execution_log <- function(admissibility_rows) {
  if (!length(admissibility_rows)) return(list())
  lapply(admissibility_rows, function(row) {
    list(message = sprintf(
      "Permutation admissibility for %s: %s requested, %s admissible, %s dropped (%s%%).",
      as.character(row$construct %||% "construct"),
      as.character(row$requested %||% "0"),
      as.character(row$admissible %||% "0"),
      as.character(row$dropped %||% "0"),
      as.character(row$dropped_pct %||% "0")
    ))
  })
}

micom_admissibility_warnings <- function(admissibility_rows) {
  rows_with_drops <- Filter(function(row) {
    dropped <- suppressWarnings(as.numeric(row$dropped %||% 0))
    !is.na(dropped) && dropped > 0
  }, admissibility_rows)
  lapply(rows_with_drops, function(row) {
    list(
      code = "MICOM_INADMISSIBLE_PERMUTATIONS_DROPPED",
      message = sprintf(
        "%s dropped %s inadmissible permutation re-estimation(s).",
        as.character(row$construct %||% "A construct"),
        as.character(row$dropped %||% "0")
      )
    )
  })
}

micom_step1_passed <- function(step1_rows) {
  length(step1_rows) > 0L && all(vapply(step1_rows, function(row) {
    identical(tolower(as.character(row$status %||% "")), "passed")
  }, logical(1)))
}

map_micom_step1_response <- function(payload, data, step1_result, timings = NULL) {
  algorithm <- payload$algorithm %||% "standard"
  algorithm_label <- if (identical(algorithm, "consistent")) "Consistent PLS (PLSc)" else "Standard PLS"
  step1_rows <- as_rows(step1_result %||% list())
  passed <- micom_step1_passed(step1_rows)
  status <- if (passed) "passed" else "failed"
  execution_log <- list(list(message = sprintf(
    "MICOM configural precheck ran for %s = %s vs %s.",
    payload$groupingVariable,
    payload$groupA,
    payload$groupB
  )))

  json_unbox_tree(list(
    method = "MICOM",
    status = status,
    groups = list(
      groupingVariable = payload$groupingVariable,
      groupA = payload$groupA,
      groupB = payload$groupB,
      leftValue = payload$groupA,
      rightValue = payload$groupB,
      counts = list(
        groupA = micom_group_count(data, payload$groupingVariable, payload$groupA),
        groupB = micom_group_count(data, payload$groupingVariable, payload$groupB)
      )
    ),
    configuralInvariance = list(
      checks = step1_rows,
      passed = passed,
      status = status
    ),
    execution_log = execution_log,
    algorithm = list(
      settings = list(
        method = "MICOM",
        algorithm = algorithm,
        algorithm_label = algorithm_label,
        hoc_method = if (has_higher_order_construct(payload)) hoc_method_label(payload$algorithmSettings, has_hoc = TRUE) else "Not applicable",
        algorithm_settings = payload$algorithmSettings %||% list(),
        mode = "permutation-configural-precheck",
        group_var = payload$groupingVariable,
        group_a = payload$groupA,
        group_b = payload$groupB
      ),
      execution_log = execution_log
    ),
    meta = list(
      mode = "permutation",
      engine = "metis_micom_step1",
      rows = nrow(data),
      columns = ncol(data),
      analysis_settings = list(
        permutation = list(
          groupingVariable = payload$groupingVariable,
          groupA = payload$groupA,
          groupB = payload$groupB,
          permutations = payload$permutations,
          alpha = payload$alpha,
          seed = payload$seed
        )
      )
    )
  ))
}

map_micom_response <- function(payload, data, micom_result, timings = NULL) {
  algorithm <- payload$algorithm %||% "standard"
  algorithm_label <- if (identical(algorithm, "consistent")) "Consistent PLS (PLSc)" else "Standard PLS"
  step1_rows <- as_rows(micom_result$step1 %||% list())
  step2_rows <- as_rows(micom_result$step2 %||% list())
  step3_rows <- as_rows(micom_result$step3 %||% list())
  admissibility_rows <- as_rows(micom_result$admissibility %||% list())
  execution_log <- c(
    list(list(message = sprintf(
      "MICOM ran for %s = %s vs %s with %s permutations, alpha %s, and seed %s.",
      payload$groupingVariable,
      payload$groupA,
      payload$groupB,
      payload$permutations,
      payload$alpha,
      payload$seed
    ))),
    micom_admissibility_execution_log(admissibility_rows)
  )

  json_unbox_tree(list(
    method = "MICOM",
    groups = list(
      groupingVariable = payload$groupingVariable,
      groupA = payload$groupA,
      groupB = payload$groupB,
      leftValue = payload$groupA,
      rightValue = payload$groupB,
      counts = list(
        groupA = micom_group_count(data, payload$groupingVariable, payload$groupA),
        groupB = micom_group_count(data, payload$groupingVariable, payload$groupB)
      )
    ),
    settings = list(
      permutations = payload$permutations,
      alpha = payload$alpha,
      seed = payload$seed
    ),
    configuralInvariance = list(
      checks = step1_rows,
      passed = micom_step1_passed(step1_rows),
      status = if (micom_step1_passed(step1_rows)) "passed" else "failed"
    ),
    compositionalInvariance = step2_rows,
    equalityAssessment = step3_rows,
    invarianceClassification = classify_micom_constructs(step2_rows, step3_rows),
    admissibility = admissibility_rows,
    invariance = micom_result$invariance %||% list(),
    warnings = micom_admissibility_warnings(admissibility_rows),
    execution_log = execution_log,
    algorithm = list(
      settings = list(
        method = "MICOM",
        algorithm = algorithm,
        algorithm_label = algorithm_label,
        hoc_method = if (has_higher_order_construct(payload)) hoc_method_label(payload$algorithmSettings, has_hoc = TRUE) else "Not applicable",
        algorithm_settings = payload$algorithmSettings %||% list(),
        mode = "permutation",
        group_var = payload$groupingVariable,
        group_a = payload$groupA,
        group_b = payload$groupB,
        permutations = payload$permutations,
        alpha = payload$alpha,
        seed = payload$seed
      ),
      execution_log = execution_log
    ),
    meta = list(
      mode = "permutation",
      engine = "metis_micom",
      rows = nrow(data),
      columns = ncol(data),
      analysis_settings = list(
        permutation = list(
          groupingVariable = payload$groupingVariable,
          groupA = payload$groupA,
          groupB = payload$groupB,
          permutations = payload$permutations,
          alpha = payload$alpha,
          seed = payload$seed
        )
      )
    )
  ))
}

selected_group_rows <- function(data, grouping_variable, group_a, group_b) {
  labels <- trimws(as.character(data[[grouping_variable]]))
  keep <- !is.na(labels) & nzchar(labels) & labels %in% c(group_a, group_b)
  data[keep, , drop = FALSE]
}

mga_group_condition <- function(data, grouping_variable, group_a) {
  labels <- trimws(as.character(data[[grouping_variable]]))
  condition <- !is.na(labels) & nzchar(labels) & labels == group_a
  condition[is.na(condition)] <- FALSE
  condition
}

mga_number <- function(value) {
  numeric <- suppressWarnings(as.numeric(value))[1]
  if (is.na(numeric) || !is.finite(numeric)) return(NULL)
  numeric
}

mga_descriptive_rows_from_summary <- function(group_label, source) {
  rows <- as_rows(source)
  if (!length(rows)) return(list())

  out <- lapply(rows, function(row) {
    construct_name <- row$Construct %||%
      row$construct %||%
      row$row_name %||%
      row$Row %||%
      row$name
    construct_name <- as.character(construct_name %||% "")
    if (!nzchar(construct_name)) return(NULL)

    variance_value <- mga_number(row$Variance %||% row$variance)
    sd_value <- mga_number(
      row[["Standard Deviation"]] %||%
      row$StandardDeviation %||%
      row$StdDev %||%
      row$`Std. Dev.` %||%
      row$SD %||%
      row$sd
    )
    if (is.null(sd_value) && !is.null(variance_value) && variance_value >= 0) {
      sd_value <- sqrt(variance_value)
    }

    list(
      Group = as.character(group_label),
      Construct = construct_name,
      Number = mga_number(row$Number %||% row$N %||% row$n %||% row$count),
      Mean = mga_number(row$Mean %||% row$mean),
      `Standard Deviation` = mga_number(sd_value),
      Skewness = mga_number(row$Skewness %||% row$skewness),
      Kurtosis = mga_number(row$Kurtosis %||% row$kurtosis),
      Variance = variance_value
    )
  })

  Filter(Negate(is.null), out)
}

mga_descriptive_rows_from_scores <- function(group_label, construct_scores) {
  if (is.null(construct_scores)) return(list())
  score_df <- tryCatch(
    as.data.frame(construct_scores, stringsAsFactors = FALSE, check.names = FALSE),
    error = function(e) NULL
  )
  if (is.null(score_df) || !ncol(score_df)) return(list())

  rows <- lapply(names(score_df), function(construct_name) {
    values <- suppressWarnings(as.numeric(score_df[[construct_name]]))
    values <- values[is.finite(values)]
    n <- length(values)
    if (!n) return(NULL)

    mean_value <- mean(values)
    variance_value <- if (n > 1L) stats::var(values) else NA_real_
    sd_value <- if (n > 1L) stats::sd(values) else NA_real_
    centered <- values - mean_value
    skewness_value <- if (n > 2L && is.finite(sd_value) && sd_value > 0) {
      mean(centered^3) / (sd_value^3)
    } else {
      NA_real_
    }
    kurtosis_value <- if (n > 3L && is.finite(sd_value) && sd_value > 0) {
      mean(centered^4) / (sd_value^4)
    } else {
      NA_real_
    }

    list(
      Group = as.character(group_label),
      Construct = as.character(construct_name),
      Number = n,
      Mean = mga_number(mean_value),
      `Standard Deviation` = mga_number(sd_value),
      Skewness = mga_number(skewness_value),
      Kurtosis = mga_number(kurtosis_value),
      Variance = mga_number(variance_value)
    )
  })

  Filter(Negate(is.null), rows)
}

mga_descriptive_rows <- function(group_label, payload = NULL, group_data = NULL, group_model = NULL, group_summary = NULL) {
  construct_scores <- group_model$construct_scores %||%
    group_model$constructScores %||%
    group_model$composite_scores %||%
    group_model$compositeScores %||%
    group_model$scores %||%
    group_summary$construct_scores %||%
    group_summary$constructScores %||%
    group_summary$composite_scores %||%
    group_summary$compositeScores %||%
    group_summary$scores

  if (is.null(construct_scores)) {
    summary_construct_descriptives <- group_summary$descriptives$statistics$constructs %||%
      group_summary$descriptives$statistics$Constructs %||%
      group_summary$descriptives$constructs %||%
      group_summary$descriptives$Constructs
    summary_rows <- mga_descriptive_rows_from_summary(group_label, summary_construct_descriptives)
    if (length(summary_rows)) return(summary_rows)
  }

  score_rows <- mga_descriptive_rows_from_scores(group_label, construct_scores)
  if (length(score_rows)) return(score_rows)

  raw_score_rows <- mga_descriptive_rows_from_scores(
    group_label,
    construct_scores_from_payload_data(payload, group_data)
  )
  if (length(raw_score_rows)) return(raw_score_rows)

  list()
}

mga_micom_overview_message <- function(mga_result) {
  fallback <- "MICOM was not run for this analysis. Interpret between-group differences with caution because measurement invariance was not assessed."
  micom_overview <- mga_result$micomOverview %||% mga_result$micom_overview
  if (is.null(micom_overview)) return(fallback)

  if (is.character(micom_overview) && length(micom_overview) && nzchar(trimws(micom_overview[[1]]))) {
    return(as.character(micom_overview[[1]]))
  }

  if (is.list(micom_overview)) {
    value <- micom_overview$message %||% micom_overview$summary %||% micom_overview$statusLabel %||% micom_overview$status
    if (!is.null(value) && length(value) && nzchar(trimws(as.character(value[[1]])))) {
      return(as.character(value[[1]]))
    }
  }

  fallback
}

mga_hoc_micom_unavailable_message <- paste0(
  "MICOM is unavailable for HOC models; ",
  "MGA was estimated without a MICOM invariance assessment."
)

mga_overview_setup_rows <- function(payload, data, mga_result) {
  measurement_invariance_message <- if (has_higher_order_construct(payload)) {
    mga_hoc_micom_unavailable_message
  } else {
    mga_micom_overview_message(mga_result)
  }

  list(
    list("Analysis information" = "Grouping variable", Value = as.character(payload$groupingVariable)),
    list("Analysis information" = "Selected groups", Value = sprintf("%s vs %s", payload$groupA, payload$groupB)),
    list("Analysis information" = "Sample size per group", Value = sprintf(
      "%s: %s, %s: %s",
      payload$groupA,
      micom_group_count(data, payload$groupingVariable, payload$groupA),
      payload$groupB,
      micom_group_count(data, payload$groupingVariable, payload$groupB)
    )),
    list("Analysis information" = "MGA settings", Value = sprintf(
      "%s bootstrap subsamples, alpha %s, seed %s",
      payload$nboot,
      payload$alpha,
      payload$seed
    )),
    list("Analysis information" = "Measurement invariance status", Value = measurement_invariance_message)
  )
}

mga_boot_paths_matrix <- function(pls_boot, sm_matrix = pls_boot$smMatrix) {
  boot_array <- pls_boot$boot_paths
  if (!is.null(boot_array) && length(dim(boot_array)) >= 3L && !is.null(sm_matrix)) {
    sources <- seminr:::path_sources(sm_matrix)
    targets <- seminr:::path_targets(sm_matrix)
    path_names <- seminr:::to_path_labels(sm_matrix)
    repetitions <- dim(boot_array)[3]
    out <- matrix(NA_real_, nrow = repetitions, ncol = length(path_names))
    for (index in seq_along(path_names)) {
      out[, index] <- suppressWarnings(as.numeric(boot_array[sources[[index]], targets[[index]], ]))
    }
    colnames(out) <- path_names
    return(out)
  }

  boot_paths <- seminr:::boot_paths_df(pls_boot)
  if (is.null(dim(boot_paths))) {
    path_names <- seminr:::to_path_labels(sm_matrix)
    boot_paths <- matrix(boot_paths, ncol = 1L)
    colnames(boot_paths) <- path_names[seq_len(ncol(boot_paths))]
  }
  boot_paths
}

mga_clean_boot_values <- function(values) {
  vals <- suppressWarnings(as.numeric(values))
  vals[is.finite(vals)]
}

mga_result_label <- function(significant) {
  if (isTRUE(significant)) "Significant" else "Not significant"
}

mga_direction <- function(diff, group_a, group_b) {
  if (is.null(diff) || !nzchar(group_a) || !nzchar(group_b)) return(NULL)
  if (diff >= 0) sprintf("%s > %s", group_a, group_b) else sprintf("%s > %s", group_b, group_a)
}

mga_ci_values <- function(boot_values, original, alpha) {
  interval <- bias_corrected_interval(boot_values, original, alpha)
  list(
    lower = mga_number(interval[[1]]),
    upper = mga_number(interval[[2]])
  )
}

mga_ci_overlap <- function(a_ci, b_ci) {
  if (is.null(a_ci$lower) || is.null(a_ci$upper) || is.null(b_ci$lower) || is.null(b_ci$upper)) return(NULL)
  max(a_ci$lower, b_ci$lower) <= min(a_ci$upper, b_ci$upper)
}

mga_comparison_intervals <- function(comparison, alpha) {
  list(
    group_a = mga_ci_values(comparison$bootstrap_a, comparison$original_a, alpha),
    group_b = mga_ci_values(comparison$bootstrap_b, comparison$original_b, alpha)
  )
}

mga_parameter_comparison <- function(entry, group_a_n, group_b_n) {
  identity <- entry$identity %||% list()
  label <- as.character(identity$path %||% paste(
    Filter(nzchar, as.character(unlist(identity, use.names = FALSE))),
    collapse = " :: "
  ))
  original_a <- mga_number(entry$estimate_a)
  original_b <- mga_number(entry$estimate_b)
  list(
    identity = identity,
    label = label,
    original_a = original_a,
    original_b = original_b,
    difference = if (!is.null(original_a) && !is.null(original_b)) original_a - original_b else NULL,
    bootstrap_a = mga_clean_boot_values(entry$boot_a),
    bootstrap_b = mga_clean_boot_values(entry$boot_b),
    n_a = suppressWarnings(as.numeric(group_a_n))[1],
    n_b = suppressWarnings(as.numeric(group_b_n))[1]
  )
}

mga_pls_mga_p <- function(comparison) {
  original_a <- comparison$original_a
  original_b <- comparison$original_b
  bootstrap_a <- comparison$bootstrap_a
  bootstrap_b <- comparison$bootstrap_b
  if (is.null(original_a) || is.null(original_b) || !length(bootstrap_a) || !length(bootstrap_b)) return(NULL)

  centred_a <- bootstrap_a - mean(bootstrap_a) + original_a
  centred_b <- sort(bootstrap_b - mean(bootstrap_b) + original_b)
  less_or_equal <- findInterval(centred_a, centred_b)
  strictly_less <- findInterval(centred_a, centred_b, left.open = TRUE)
  greater_counts <- length(centred_b) - less_or_equal
  equal_counts <- less_or_equal - strictly_less
  mean((greater_counts + (0.5 * equal_counts)) / length(centred_b))
}

mga_pls_mga_significant <- function(probability, alpha) {
  !is.null(probability) && is.finite(probability) &&
    (probability < alpha || probability > (1 - alpha))
}

mga_parametric_stats <- function(comparison, alpha, welch = FALSE) {
  empty_result <- list(
    difference = comparison$difference,
    standard_error = NULL,
    t_value = NULL,
    df = NULL,
    p_value = NULL,
    significant = FALSE
  )
  difference <- comparison$difference
  bootstrap_a <- comparison$bootstrap_a
  bootstrap_b <- comparison$bootstrap_b
  n_a <- comparison$n_a
  n_b <- comparison$n_b
  if (is.null(difference) || !is.finite(n_a) || !is.finite(n_b) || n_a < 2L || n_b < 2L) {
    return(empty_result)
  }
  if (length(bootstrap_a) < 2L || length(bootstrap_b) < 2L) return(empty_result)

  se_a <- stats::sd(bootstrap_a)
  se_b <- stats::sd(bootstrap_b)
  if (!is.finite(se_a) || !is.finite(se_b)) return(empty_result)

  if (isTRUE(welch)) {
    component_a <- ((n_a - 1) / n_a) * (se_a ^ 2)
    component_b <- ((n_b - 1) / n_b) * (se_b ^ 2)
    standard_error <- sqrt(component_a + component_b)
    denominator <- (component_a ^ 2) / (n_a - 1) + (component_b ^ 2) / (n_b - 1)
    df <- if (is.finite(denominator) && denominator > 0) {
      (((component_a + component_b) ^ 2) / denominator) - 2
    } else {
      NA_real_
    }
  } else {
    df <- n_a + n_b - 2
    pooled_variance <-
      (((n_a - 1) ^ 2) / df) * (se_a ^ 2) +
      (((n_b - 1) ^ 2) / df) * (se_b ^ 2)
    standard_error <- sqrt(pooled_variance) * sqrt((1 / n_a) + (1 / n_b))
  }

  if (!is.finite(standard_error) || standard_error <= 0 || !is.finite(df) || df <= 0) {
    return(empty_result)
  }

  t_value <- difference / standard_error
  p_value <- 2 * stats::pt(-abs(t_value), df = df)
  list(
    difference = mga_number(difference),
    standard_error = mga_number(standard_error),
    t_value = mga_number(t_value),
    df = mga_number(df),
    p_value = mga_number(p_value),
    significant = !is.null(p_value) && is.finite(p_value) && p_value <= alpha
  )
}

mga_compare_entries <- function(entries, payload, group_a_field, group_b_field, group_a_n, group_b_n) {
  alpha <- payload$alpha
  ci_rows <- list()
  henseler_rows <- list()
  parametric_rows <- list()
  welch_rows <- list()

  for (entry in entries) {
    comparison <- mga_parameter_comparison(entry, group_a_n, group_b_n)
    estimate_a <- comparison$original_a
    estimate_b <- comparison$original_b
    diff <- comparison$difference
    boot_a <- comparison$bootstrap_a
    boot_b <- comparison$bootstrap_b
    mean_a <- if (length(boot_a)) mean(boot_a) else NULL
    mean_b <- if (length(boot_b)) mean(boot_b) else NULL
    pls_mga_p <- mga_pls_mga_p(comparison)
    p_value_inverse <- if (!is.null(pls_mga_p)) 1 - pls_mga_p else NULL
    pls_significant <- mga_pls_mga_significant(pls_mga_p, alpha)
    direction <- mga_direction(diff, payload$groupA, payload$groupB)
    intervals <- mga_comparison_intervals(comparison, alpha)
    a_ci <- intervals$group_a
    b_ci <- intervals$group_b
    ci_overlap <- mga_ci_overlap(a_ci, b_ci)
    ci_significant <- !is.null(ci_overlap) && !isTRUE(ci_overlap)
    parametric <- mga_parametric_stats(comparison, alpha, welch = FALSE)
    welch <- mga_parametric_stats(comparison, alpha, welch = TRUE)

    ci_values <- list()
    ci_values[[group_a_field]] <- estimate_a
    ci_values$groupA_ci_lower <- a_ci$lower
    ci_values$groupA_ci_upper <- a_ci$upper
    ci_values[[group_b_field]] <- estimate_b
    ci_values$groupB_ci_lower <- b_ci$lower
    ci_values$groupB_ci_upper <- b_ci$upper
    ci_values$ci_overlap <- ci_overlap
    ci_values$result <- mga_result_label(ci_significant)

    base_values <- list()
    base_values[[group_a_field]] <- estimate_a
    base_values[[group_b_field]] <- estimate_b
    base_values$diff <- diff

    ci_rows[[length(ci_rows) + 1L]] <- c(entry$identity, ci_values)
    henseler_rows[[length(henseler_rows) + 1L]] <- c(
      entry$identity,
      base_values,
      list(
        groupA_boot_mean = mga_number(mean_a),
        groupB_boot_mean = mga_number(mean_b),
        pls_mga_p = mga_number(pls_mga_p),
        p_value = mga_number(pls_mga_p),
        p_value_inverse = mga_number(p_value_inverse),
        significant = pls_significant,
        direction = direction,
        result = mga_result_label(pls_significant),
        decision = mga_result_label(pls_significant)
      )
    )
    parametric_rows[[length(parametric_rows) + 1L]] <- c(
      entry$identity,
      base_values,
      list(
        standard_error = parametric$standard_error,
        t_value = parametric$t_value,
        df = parametric$df,
        p_value = parametric$p_value,
        significant = parametric$significant,
        result = mga_result_label(parametric$significant)
      )
    )
    welch_rows[[length(welch_rows) + 1L]] <- c(
      entry$identity,
      base_values,
      list(
        standard_error = welch$standard_error,
        t_value = welch$t_value,
        df = welch$df,
        p_value = welch$p_value,
        significant = welch$significant,
        result = mga_result_label(welch$significant)
      )
    )
  }

  list(
    biasCorrectedConfidenceIntervals = ci_rows,
    henselerPlsMga = henseler_rows,
    parametricTest = parametric_rows,
    welchTest = welch_rows
  )
}

payload_nomological_paths <- function(payload) {
  paths <- payload$paths %||% list()
  normalized <- lapply(paths, function(path) {
    list(
      source = as.character(path$from %||% ""),
      target = as.character(path$to %||% "")
    )
  })
  normalized <- Filter(function(path) nzchar(path$source) && nzchar(path$target), normalized)
  if (!length(normalized)) return(list())
  keys <- vapply(normalized, function(path) paste(path$source, path$target, sep = "\r"), character(1))
  normalized[!duplicated(keys)]
}

mga_path_value <- function(path_matrix, source, target) {
  if (is.null(path_matrix) || is.null(rownames(path_matrix)) || is.null(colnames(path_matrix))) return(NA_real_)
  if (!(source %in% rownames(path_matrix)) || !(target %in% colnames(path_matrix))) return(NA_real_)
  suppressWarnings(as.numeric(path_matrix[source, target]))
}

mga_boot_path_values <- function(boot_model, source, target) {
  boot_paths <- boot_model$boot_paths
  if (is.null(boot_paths) || is.null(dim(boot_paths)) || length(dim(boot_paths)) < 3L) return(numeric(0))
  if (!(source %in% rownames(boot_paths)) || !(target %in% colnames(boot_paths))) return(numeric(0))
  suppressWarnings(as.numeric(boot_paths[source, target, ]))
}

mga_path_entries <- function(payload, group1_model, group2_model, group1_boot, group2_boot) {
  paths <- payload_nomological_paths(payload)
  lapply(paths, function(path) {
    source <- path$source
    target <- path$target
    path_name <- sprintf("%s -> %s", source, target)
    list(
      identity = list(
        source = source,
        target = target,
        path = path_name
      ),
      estimate_a = mga_path_value(group1_model$path_coef, source, target),
      estimate_b = mga_path_value(group2_model$path_coef, source, target),
      boot_a = mga_boot_path_values(group1_boot, source, target),
      boot_b = mga_boot_path_values(group2_boot, source, target)
    )
  })
}

mga_nomological_path_matrix <- function(payload, path_coef) {
  if (is.null(path_coef) || is.null(dim(path_coef))) return(NULL)
  masked <- matrix(
    0,
    nrow = nrow(path_coef),
    ncol = ncol(path_coef),
    dimnames = dimnames(path_coef)
  )
  for (path in payload_nomological_paths(payload)) {
    source <- path$source
    target <- path$target
    if (source %in% rownames(path_coef) && target %in% colnames(path_coef)) {
      masked[source, target] <- path_coef[source, target]
    }
  }
  masked
}

mga_nomological_boot_derived_array <- function(payload, boot_paths, reference, derive_matrix) {
  if (is.null(boot_paths) || is.null(dim(boot_paths)) || length(dim(boot_paths)) < 3L ||
      is.null(reference) || is.null(dim(reference))) return(NULL)
  out <- array(
    NA_real_,
    dim = c(nrow(reference), ncol(reference), dim(boot_paths)[3]),
    dimnames = list(rownames(reference), colnames(reference), NULL)
  )
  for (index in seq_len(dim(boot_paths)[3])) {
    path_matrix <- boot_paths[, , index]
    masked <- mga_nomological_path_matrix(payload, path_matrix)
    derived <- derive_matrix(masked)
    shared_rows <- intersect(rownames(reference), rownames(derived))
    shared_columns <- intersect(colnames(reference), colnames(derived))
    if (length(shared_rows) && length(shared_columns)) {
      out[shared_rows, shared_columns, index] <- derived[shared_rows, shared_columns, drop = FALSE]
    }
  }
  out
}

mga_measurement_entries <- function(group1_matrix, group2_matrix, group1_boot_array, group2_boot_array) {
  if (is.null(group1_matrix) || is.null(group2_matrix) ||
      is.null(group1_boot_array) || is.null(group2_boot_array)) return(list())
  if (is.null(dim(group1_boot_array)) || is.null(dim(group2_boot_array)) ||
      length(dim(group1_boot_array)) < 3L || length(dim(group2_boot_array)) < 3L) return(list())

  m1 <- as.matrix(group1_matrix)
  m2 <- as.matrix(group2_matrix)
  if (nrow(m1) != nrow(m2) || ncol(m1) != ncol(m2)) return(list())
  if (nrow(m1) != dim(group1_boot_array)[1] || ncol(m1) != dim(group1_boot_array)[2]) return(list())
  if (nrow(m2) != dim(group2_boot_array)[1] || ncol(m2) != dim(group2_boot_array)[2]) return(list())

  indicators <- rownames(m1)
  constructs <- colnames(m1)
  if (is.null(indicators)) indicators <- as.character(seq_len(nrow(m1)))
  if (is.null(constructs)) constructs <- as.character(seq_len(ncol(m1)))

  entries <- list()
  for (i in seq_len(nrow(m1))) {
    for (j in seq_len(ncol(m1))) {
      estimate_a <- mga_number(m1[i, j])
      estimate_b <- mga_number(m2[i, j])
      include_entry <- (!is.null(estimate_a) && estimate_a != 0) || (!is.null(estimate_b) && estimate_b != 0)
      if (!include_entry) next
      entries[[length(entries) + 1L]] <- list(
        identity = list(
          construct = as.character(constructs[[j]] %||% ""),
          indicator = as.character(indicators[[i]] %||% "")
        ),
        estimate_a = estimate_a,
        estimate_b = estimate_b,
        boot_a = group1_boot_array[i, j, ],
        boot_b = group2_boot_array[i, j, ]
      )
    }
  }
  entries
}

mga_effect_matrix_entries <- function(group1_matrix, group2_matrix, group1_boot_array, group2_boot_array) {
  if (is.null(group1_matrix) || is.null(group2_matrix) ||
      is.null(group1_boot_array) || is.null(group2_boot_array)) return(list())
  if (is.null(dim(group1_boot_array)) || is.null(dim(group2_boot_array)) ||
      length(dim(group1_boot_array)) < 3L || length(dim(group2_boot_array)) < 3L) return(list())

  m1 <- as.matrix(group1_matrix)
  m2 <- as.matrix(group2_matrix)
  if (nrow(m1) != nrow(m2) || ncol(m1) != ncol(m2)) return(list())
  if (nrow(m1) != dim(group1_boot_array)[1] || ncol(m1) != dim(group1_boot_array)[2]) return(list())
  if (nrow(m2) != dim(group2_boot_array)[1] || ncol(m2) != dim(group2_boot_array)[2]) return(list())

  sources <- rownames(m1)
  targets <- colnames(m1)
  if (is.null(sources)) sources <- as.character(seq_len(nrow(m1)))
  if (is.null(targets)) targets <- as.character(seq_len(ncol(m1)))

  entries <- list()
  for (i in seq_len(nrow(m1))) {
    for (j in seq_len(ncol(m1))) {
      estimate_a <- mga_number(m1[i, j])
      estimate_b <- mga_number(m2[i, j])
      boot_a <- group1_boot_array[i, j, ]
      boot_b <- group2_boot_array[i, j, ]
      boot_a_numeric <- suppressWarnings(as.numeric(boot_a))
      boot_b_numeric <- suppressWarnings(as.numeric(boot_b))
      include_entry <- (!is.null(estimate_a) && estimate_a != 0) ||
        (!is.null(estimate_b) && estimate_b != 0) ||
        any(is.finite(boot_a_numeric) & boot_a_numeric != 0, na.rm = TRUE) ||
        any(is.finite(boot_b_numeric) & boot_b_numeric != 0, na.rm = TRUE)
      if (!include_entry) next
      entries[[length(entries) + 1L]] <- list(
        identity = list(
          source = as.character(sources[[i]] %||% ""),
          target = as.character(targets[[j]] %||% ""),
          path = sprintf("%s -> %s", sources[[i]], targets[[j]])
        ),
        estimate_a = estimate_a,
        estimate_b = estimate_b,
        boot_a = boot_a,
        boot_b = boot_b
      )
    }
  }
  entries
}

mga_boot_total_indirect_array <- function(boot_model) {
  if (is.null(boot_model$boot_total_paths) || is.null(boot_model$boot_paths)) return(NULL)
  if (is.null(dim(boot_model$boot_total_paths)) || is.null(dim(boot_model$boot_paths))) return(NULL)
  if (!identical(dim(boot_model$boot_total_paths), dim(boot_model$boot_paths))) return(NULL)
  boot_model$boot_total_paths - boot_model$boot_paths
}

mga_specific_indirect_chains <- function(payload) {
  edges <- lapply(payload$paths, function(p) {
    list(from = as.character(p$from), to = as.character(p$to))
  })
  nodes <- unique(unlist(lapply(edges, function(e) c(e$from, e$to)), use.names = FALSE))
  nodes <- nodes[!is.na(nodes) & nzchar(nodes)]
  from_map <- lapply(nodes, function(node) {
    tos <- unique(unlist(lapply(edges, function(e) if (identical(e$from, node)) e$to else NULL), use.names = FALSE))
    tos[!is.na(tos) & nzchar(tos)]
  })
  names(from_map) <- nodes

  chains <- list()
  for (x in nodes) {
    mids <- from_map[[x]]
    if (!length(mids)) next
    for (m in mids) {
      ys <- from_map[[m]]
      if (!length(ys)) next
      for (y in ys) {
        if (x == y) next
        chains[[length(chains) + 1L]] <- c(x, m, y)
      }
    }
  }
  chains
}

mga_path_product <- function(path_coef, path_nodes) {
  if (is.null(path_coef) || length(path_nodes) < 2L) return(NA_real_)
  product <- 1
  for (idx in seq_len(length(path_nodes) - 1L)) {
    from_node <- path_nodes[[idx]]
    to_node <- path_nodes[[idx + 1L]]
    if (!from_node %in% rownames(path_coef) || !to_node %in% colnames(path_coef)) return(NA_real_)
    product <- product * suppressWarnings(as.numeric(path_coef[from_node, to_node]))
  }
  product
}

mga_specific_boot_values <- function(boot_model, path_nodes) {
  if (is.null(boot_model$boot_paths) || is.null(dim(boot_model$boot_paths)) ||
      length(dim(boot_model$boot_paths)) < 3L || length(path_nodes) < 2L) return(numeric(0))

  vapply(seq_len(dim(boot_model$boot_paths)[3]), function(k) {
    product <- 1
    for (idx in seq_len(length(path_nodes) - 1L)) {
      from_node <- path_nodes[[idx]]
      to_node <- path_nodes[[idx + 1L]]
      if (!from_node %in% rownames(boot_model$boot_paths) || !to_node %in% colnames(boot_model$boot_paths)) {
        return(NA_real_)
      }
      product <- product * suppressWarnings(as.numeric(boot_model$boot_paths[from_node, to_node, k]))
    }
    product
  }, numeric(1))
}

mga_specific_indirect_entries <- function(payload, group1_model, group2_model, group1_boot, group2_boot) {
  chains <- mga_specific_indirect_chains(payload)
  if (!length(chains)) return(list())

  entries <- list()
  for (path_nodes in chains) {
    estimate_a <- mga_path_product(group1_model$path_coef, path_nodes)
    estimate_b <- mga_path_product(group2_model$path_coef, path_nodes)
    boot_a <- mga_specific_boot_values(group1_boot, path_nodes)
    boot_b <- mga_specific_boot_values(group2_boot, path_nodes)
    include_entry <- is.finite(estimate_a) || is.finite(estimate_b) ||
      any(is.finite(boot_a), na.rm = TRUE) || any(is.finite(boot_b), na.rm = TRUE)
    if (!include_entry) next

    entries[[length(entries) + 1L]] <- list(
      identity = list(
        source = path_nodes[[1]],
        mediator = path_nodes[[2]],
        target = path_nodes[[3]],
        path = paste(path_nodes, collapse = " -> ")
      ),
      estimate_a = estimate_a,
      estimate_b = estimate_b,
      boot_a = boot_a,
      boot_b = boot_b
    )
  }
  entries
}

mga_group_bootstrap_sections <- function(payload, group_data, group_core, group_boot, embedded = FALSE, bypass_isolated_moderation_cache = TRUE) {
  alpha <- payload$alpha
  algorithm <- if (!is.null(payload$algorithm)) tolower(as.character(payload$algorithm)) else "standard"
  if (!(algorithm %in% c("standard", "consistent"))) algorithm <- "standard"
  algorithm_label <- if (algorithm == "consistent") "Consistent PLS (PLSc)" else "Standard PLS"
  confidence_level <- sprintf("%g%%", (1 - alpha) * 100)

  if (isTRUE(embedded)) {
    response <- assemble_embedded_bootstrap_response(
      payload, group_data, group_core, group_boot, payload$nboot,
      confidence_level, algorithm, algorithm_label, alpha,
      bypass_isolated_moderation_cache = bypass_isolated_moderation_cache
    )
    return(response$results %||% response)
  }

  group_model <- group_core$model
  boot_summary <- summary(group_boot, alpha = alpha)

  boot_summary$bootstrapped_paths <- add_bias_corrected_intervals(
    boot_summary$bootstrapped_paths,
    group_boot$path_coef,
    group_boot$boot_paths,
    alpha = alpha
  )
  boot_summary$bootstrapped_loadings <- add_bias_corrected_intervals(
    boot_summary$bootstrapped_loadings,
    group_boot$outer_loadings,
    group_boot$boot_loadings,
    alpha = alpha
  )
  boot_summary$bootstrapped_weights <- add_bias_corrected_intervals(
    boot_summary$bootstrapped_weights,
    group_boot$outer_weights,
    group_boot$boot_weights,
    alpha = alpha
  )
  boot_summary$bootstrapped_total_paths <- add_bias_corrected_intervals(
    boot_summary$bootstrapped_total_paths,
    seminr:::total_effects(group_boot$path_coef),
    group_boot$boot_total_paths,
    alpha = alpha
  )

  group_response <- assemble_bootstrap_response(
    payload,
    group_data,
    group_core,
    group_boot,
    boot_summary,
    payload$nboot,
    confidence_level,
    algorithm,
    algorithm_label,
    alpha = alpha,
    bypass_isolated_moderation_cache = bypass_isolated_moderation_cache
  )
  group_response$results %||% group_response
}

assemble_mga_bootstrap_tables <- function(
  payload,
  group1_data,
  group2_data,
  group1_core,
  group2_core,
  group1_boot,
  group2_boot,
  embedded = FALSE
) {
  group1_model <- group1_core$model
  group2_model <- group2_core$model
  group1_summary <- group1_core$summary %||% summary(group1_model)
  group2_summary <- group2_core$summary %||% summary(group2_model)
  group1_n <- nrow(group1_data)
  group2_n <- nrow(group2_data)

  path_entries <- mga_path_entries(payload, group1_model, group2_model, group1_boot, group2_boot)
  specific_indirect_entries <- mga_specific_indirect_entries(payload, group1_model, group2_model, group1_boot, group2_boot)
  group1_nomological_paths <- mga_nomological_path_matrix(payload, group1_model$path_coef)
  group2_nomological_paths <- mga_nomological_path_matrix(payload, group2_model$path_coef)
  group1_total_indirect <- seminr:::total_indirect_effects(group1_nomological_paths)
  group2_total_indirect <- seminr:::total_indirect_effects(group2_nomological_paths)
  group1_total_effects <- seminr:::total_effects(group1_nomological_paths)
  group2_total_effects <- seminr:::total_effects(group2_nomological_paths)
  group1_boot_total_indirect <- mga_nomological_boot_derived_array(
    payload,
    group1_boot$boot_paths,
    group1_total_indirect,
    seminr:::total_indirect_effects
  )
  group2_boot_total_indirect <- mga_nomological_boot_derived_array(
    payload,
    group2_boot$boot_paths,
    group2_total_indirect,
    seminr:::total_indirect_effects
  )
  group1_boot_total_effects <- mga_nomological_boot_derived_array(
    payload,
    group1_boot$boot_paths,
    group1_total_effects,
    seminr:::total_effects
  )
  group2_boot_total_effects <- mga_nomological_boot_derived_array(
    payload,
    group2_boot$boot_paths,
    group2_total_effects,
    seminr:::total_effects
  )
  total_indirect_entries <- mga_effect_matrix_entries(
    group1_total_indirect,
    group2_total_indirect,
    group1_boot_total_indirect,
    group2_boot_total_indirect
  )
  total_effect_entries <- mga_effect_matrix_entries(
    group1_total_effects,
    group2_total_effects,
    group1_boot_total_effects,
    group2_boot_total_effects
  )
  loading_entries <- mga_measurement_entries(
    group1_model$outer_loadings,
    group2_model$outer_loadings,
    group1_boot$boot_loadings,
    group2_boot$boot_loadings
  )
  weight_entries <- mga_measurement_entries(
    group1_model$outer_weights,
    group2_model$outer_weights,
    group1_boot$boot_weights,
    group2_boot$boot_weights
  )

  list(
    groupSpecific = list(
      groupA = mga_group_bootstrap_sections(payload, group1_data, group1_core, group1_boot, embedded),
      groupB = mga_group_bootstrap_sections(payload, group2_data, group2_core, group2_boot, embedded)
    ),
    descriptives = c(
      mga_descriptive_rows(payload$groupA, payload, group1_data, group1_model, group1_summary),
      mga_descriptive_rows(payload$groupB, payload, group2_data, group2_model, group2_summary)
    ),
    pathCoefficients = mga_compare_entries(path_entries, payload, "groupA_beta", "groupB_beta", group1_n, group2_n),
    specificIndirectEffects = mga_compare_entries(specific_indirect_entries, payload, "groupA_beta", "groupB_beta", group1_n, group2_n),
    totalIndirectEffects = mga_compare_entries(total_indirect_entries, payload, "groupA_beta", "groupB_beta", group1_n, group2_n),
    totalEffects = mga_compare_entries(total_effect_entries, payload, "groupA_beta", "groupB_beta", group1_n, group2_n),
    outerLoadings = mga_compare_entries(loading_entries, payload, "groupA_loading", "groupB_loading", group1_n, group2_n),
    outerWeights = mga_compare_entries(weight_entries, payload, "groupA_weight", "groupB_weight", group1_n, group2_n)
  )
}

run_mga_bootstrap_tables <- function(pls_model, condition, payload, ...) {
  pls_data <- pls_model$rawdata
  group1_data <- pls_data[condition, , drop = FALSE]
  group2_data <- pls_data[!condition, , drop = FALSE]
  nboot <- payload$nboot

  message("Estimating and bootstrapping selected MGA groups...")
  group1_model <- seminr:::rerun(pls_model, data = group1_data)
  group2_model <- seminr:::rerun(pls_model, data = group2_data)
  group1_core <- list(model = group1_model, summary = summary(group1_model))
  group2_core <- list(model = group2_model, summary = summary(group2_model))
  group1_boot <- seminr::bootstrap_model(seminr_model = group1_model, nboot = nboot, ...)
  group2_boot <- seminr::bootstrap_model(seminr_model = group2_model, nboot = nboot, ...)

  assemble_mga_bootstrap_tables(
    payload, group1_data, group2_data,
    group1_core, group2_core, group1_boot, group2_boot,
    embedded = FALSE
  )
}

hoc_mga_with_context <- function(expr, group_role, group_value, method, phase) {
  tryCatch(
    force(expr),
    error = function(err) {
      stop(sprintf(
        "HOC MGA %s '%s' using %s failed during %s: %s",
        group_role,
        group_value,
        method,
        phase,
        conditionMessage(err)
      ), call. = FALSE)
    }
  )
}

run_hoc_mga_bootstrap_tables <- function(data, payload, cores = 1L, timings = NULL) {
  condition <- mga_group_condition(data, payload$groupingVariable, payload$groupA)
  group1_data <- data[condition, , drop = FALSE]
  group2_data <- data[!condition, , drop = FALSE]
  hoc_settings <- normalize_hoc_settings(payload$algorithmSettings %||% list())
  embedded <- identical(hoc_settings$hocMethod, "Two-stage") &&
    identical(hoc_settings$hocTwoStage, "Embedded")
  method <- hoc_method_label(hoc_settings, has_hoc = TRUE)

  group1_core <- hoc_mga_with_context(
    timed_or_direct(timings, "fit HOC MGA group A", run_pls_core(payload, group1_data)),
    "group A", payload$groupA, method, "fit"
  )
  group2_core <- hoc_mga_with_context(
    timed_or_direct(timings, "fit HOC MGA group B", run_pls_core(payload, group2_data)),
    "group B", payload$groupB, method, "fit"
  )
  if (embedded) {
    group1_boot <- hoc_mga_with_context(
      timed_or_direct(
        timings,
        "bootstrap Embedded HOC MGA group A",
        run_embedded_hoc_bootstrap(payload, group1_data, group1_core, payload$nboot, timings = timings)
      ),
      "group A", payload$groupA, method, "bootstrap"
    )
    group2_boot <- hoc_mga_with_context(
      timed_or_direct(
        timings,
        "bootstrap Embedded HOC MGA group B",
        run_embedded_hoc_bootstrap(payload, group2_data, group2_core, payload$nboot, timings = timings)
      ),
      "group B", payload$groupB, method, "bootstrap"
    )
  } else {
    group1_boot <- hoc_mga_with_context(
      timed_or_direct(
        timings,
        "bootstrap HOC MGA group A",
        seminr::bootstrap_model(group1_core$model, nboot = payload$nboot, cores = cores)
      ),
      "group A", payload$groupA, method, "bootstrap"
    )
    group2_boot <- hoc_mga_with_context(
      timed_or_direct(
        timings,
        "bootstrap HOC MGA group B",
        seminr::bootstrap_model(group2_core$model, nboot = payload$nboot, cores = cores)
      ),
      "group B", payload$groupB, method, "bootstrap"
    )
  }

  assemble_mga_bootstrap_tables(
    payload, group1_data, group2_data,
    group1_core, group2_core, group1_boot, group2_boot,
    embedded = embedded
  )
}

map_mga_path_rows <- function(payload, mga_result) {
  rows <- as_rows(mga_result %||% list())
  lapply(rows, function(row) {
    source <- as.character(row$source %||% "")
    target <- as.character(row$target %||% "")
    path_label <- as.character(row$row_name %||% if (nzchar(source) && nzchar(target)) sprintf("%s -> %s", source, target) else "")
    diff <- mga_number(row$diff)
    p_value <- mga_number(row$pls_mga_p)
    p_value_inverse <- if (!is.null(p_value)) 1 - p_value else NULL
    significant <- !is.null(p_value) && (
      p_value <= payload$alpha ||
      (!is.null(p_value_inverse) && p_value_inverse <= payload$alpha)
    )
    direction <- NULL
    if (!is.null(diff) && nzchar(payload$groupA) && nzchar(payload$groupB)) {
      direction <- if (diff >= 0) {
        sprintf("%s > %s", payload$groupA, payload$groupB)
      } else {
        sprintf("%s > %s", payload$groupB, payload$groupA)
      }
    }

    list(
      source = source,
      target = target,
      path = path_label,
      estimate = mga_number(row$estimate),
      groupA_beta = mga_number(row$group1_beta),
      groupB_beta = mga_number(row$group2_beta),
      diff = diff,
      groupA_beta_mean = mga_number(row$group1_beta_mean),
      groupB_beta_mean = mga_number(row$group2_beta_mean),
      pls_mga_p = p_value,
      p_value = p_value,
      p_value_inverse = p_value_inverse,
      significant = significant,
      direction = direction,
      decision = if (significant) "significant" else "not significant"
    )
  })
}

mga_hoc_method_metadata <- function(payload) {
  has_hoc <- has_higher_order_construct(payload)
  if (!has_hoc) {
    return(list(
      base_hoc_method = "Not applicable",
      mga_hoc_method = "Not applicable",
      hoc_method_changed = FALSE
    ))
  }

  mga_method <- hoc_method_label(payload$algorithmSettings %||% list(), has_hoc = TRUE)
  base_method <- as.character(payload$baseHocMethod %||% mga_method)
  list(
    base_hoc_method = base_method,
    mga_hoc_method = mga_method,
    hoc_method_changed = !identical(base_method, mga_method)
  )
}

map_mga_response <- function(payload, data, mga_result, timings = NULL) {
  hoc_metadata <- mga_hoc_method_metadata(payload)
  has_hoc <- has_higher_order_construct(payload)
  algorithm <- payload$algorithm %||% "standard"
  algorithm_label <- if (identical(algorithm, "consistent")) "Consistent PLS (PLSc)" else "Standard PLS"
  mga_engine <- if (has_hoc && identical(hoc_metadata$mga_hoc_method, "Embedded Two-stage")) {
    "Metis Embedded two-stage bootstrap PLS-MGA"
  } else if (has_hoc) {
    sprintf("seminr::bootstrap_model %s PLS-MGA", hoc_metadata$mga_hoc_method)
  } else {
    "seminr::bootstrap_model PLS-MGA"
  }
  path_rows <- mga_result$pathCoefficients$henselerPlsMga %||% map_mga_path_rows(payload, mga_result)
  significant_rows <- Filter(function(row) isTRUE(row$significant), path_rows)
  execution_log <- list(list(message = sprintf(
    "MGA ran for %s = %s vs %s with %s bootstrap subsamples, alpha %s, and seed %s.",
    payload$groupingVariable,
    payload$groupA,
    payload$groupB,
    payload$nboot,
    payload$alpha,
    payload$seed
  )))
  if (has_hoc) {
    execution_log[[length(execution_log) + 1L]] <- list(message = sprintf(
      "Each MGA group was estimated independently using %s.",
      hoc_metadata$mga_hoc_method
    ))
  }
  if (has_hoc && identical(hoc_metadata$mga_hoc_method, "Embedded Two-stage")) {
    execution_log[[length(execution_log) + 1L]] <- list(message =
      "Embedded HOC MGA reran Stage 1 and Stage 2 within every bootstrap resample for both groups."
    )
  }
  if (isTRUE(hoc_metadata$hoc_method_changed)) {
    execution_log[[length(execution_log) + 1L]] <- list(message = sprintf(
      "MGA re-estimated the HOC using %s instead of the fitted PLS-SEM method %s.",
      hoc_metadata$mga_hoc_method,
      hoc_metadata$base_hoc_method
    ))
  }

  json_unbox_tree(list(
    method = "MGA",
    overview = list(
      setup = mga_overview_setup_rows(payload, data, mga_result),
      descriptives = mga_result$descriptives %||% list()
    ),
    descriptives = mga_result$descriptives %||% list(),
    groupSpecific = mga_result$groupSpecific %||% list(groupA = list(), groupB = list()),
    bootstrapMGA = list(
      pathCoefficients = list(
        biasCorrectedConfidenceIntervals = mga_result$pathCoefficients$biasCorrectedConfidenceIntervals %||% list(),
        henselerPlsMga = mga_result$pathCoefficients$henselerPlsMga %||% list(),
        parametricTest = mga_result$pathCoefficients$parametricTest %||% list(),
        welchTest = mga_result$pathCoefficients$welchTest %||% list()
      ),
      specificIndirectEffects = list(
        biasCorrectedConfidenceIntervals = mga_result$specificIndirectEffects$biasCorrectedConfidenceIntervals %||% list(),
        henselerPlsMga = mga_result$specificIndirectEffects$henselerPlsMga %||% list(),
        parametricTest = mga_result$specificIndirectEffects$parametricTest %||% list(),
        welchTest = mga_result$specificIndirectEffects$welchTest %||% list()
      ),
      totalIndirectEffects = list(
        biasCorrectedConfidenceIntervals = mga_result$totalIndirectEffects$biasCorrectedConfidenceIntervals %||% list(),
        henselerPlsMga = mga_result$totalIndirectEffects$henselerPlsMga %||% list(),
        parametricTest = mga_result$totalIndirectEffects$parametricTest %||% list(),
        welchTest = mga_result$totalIndirectEffects$welchTest %||% list()
      ),
      totalEffects = list(
        biasCorrectedConfidenceIntervals = mga_result$totalEffects$biasCorrectedConfidenceIntervals %||% list(),
        henselerPlsMga = mga_result$totalEffects$henselerPlsMga %||% list(),
        parametricTest = mga_result$totalEffects$parametricTest %||% list(),
        welchTest = mga_result$totalEffects$welchTest %||% list()
      ),
      outerLoadings = list(
        biasCorrectedConfidenceIntervals = mga_result$outerLoadings$biasCorrectedConfidenceIntervals %||% list(),
        henselerPlsMga = mga_result$outerLoadings$henselerPlsMga %||% list(),
        parametricTest = mga_result$outerLoadings$parametricTest %||% list(),
        welchTest = mga_result$outerLoadings$welchTest %||% list()
      ),
      outerWeights = list(
        biasCorrectedConfidenceIntervals = mga_result$outerWeights$biasCorrectedConfidenceIntervals %||% list(),
        henselerPlsMga = mga_result$outerWeights$henselerPlsMga %||% list(),
        parametricTest = mga_result$outerWeights$parametricTest %||% list(),
        welchTest = mga_result$outerWeights$welchTest %||% list()
      )
    ),
    pathCoefficients = path_rows,
    significantDifferences = significant_rows,
    groups = list(
      groupingVariable = payload$groupingVariable,
      groupA = payload$groupA,
      groupB = payload$groupB,
      leftValue = payload$groupA,
      rightValue = payload$groupB,
      counts = list(
        groupA = micom_group_count(data, payload$groupingVariable, payload$groupA),
        groupB = micom_group_count(data, payload$groupingVariable, payload$groupB)
      )
    ),
    settings = list(
      nboot = payload$nboot,
      alpha = payload$alpha,
      seed = payload$seed,
      base_hoc_method = hoc_metadata$base_hoc_method,
      mga_hoc_method = hoc_metadata$mga_hoc_method,
      hoc_method_changed = hoc_metadata$hoc_method_changed
    ),
    execution_log = execution_log,
    algorithm = list(
      settings = list(
        method = "MGA",
        algorithm = algorithm,
        algorithm_label = algorithm_label,
        hoc_method = hoc_metadata$mga_hoc_method,
        base_hoc_method = hoc_metadata$base_hoc_method,
        mga_hoc_method = hoc_metadata$mga_hoc_method,
        hoc_method_changed = hoc_metadata$hoc_method_changed,
        algorithm_settings = payload$algorithmSettings %||% list(),
        mode = "mga",
        group_var = payload$groupingVariable,
        group_a = payload$groupA,
        group_b = payload$groupB,
        nboot = payload$nboot,
        alpha = payload$alpha,
        seed = payload$seed
      ),
      execution_log = execution_log
    ),
    meta = list(
      mode = "mga",
      engine = mga_engine,
      rows = nrow(data),
      columns = ncol(data),
      analysis_settings = list(
        mga = list(
          groupingVariable = payload$groupingVariable,
          groupA = payload$groupA,
          groupB = payload$groupB,
          nboot = payload$nboot,
          alpha = payload$alpha,
          seed = payload$seed,
          base_hoc_method = hoc_metadata$base_hoc_method,
          mga_hoc_method = hoc_metadata$mga_hoc_method,
          hoc_method_changed = hoc_metadata$hoc_method_changed
        )
      )
    )
  ))
}

pr$handle("GET", "/health", function(req, res) {
  res$setHeader("Content-Type", "application/json")
  list(status = "ok", service = "metis-plumber")
})

pr$handle("POST", "/run-pls", function(req, res) {
  res$setHeader("Content-Type", "application/json")
  tryCatch({
    with_analysis_timeout_for({
      prepared <- prepare_payload(req)
      payload <- prepared$payload
      data <- prepared$data
      core <- get_cached_pls_core(payload, data)
      list(success = TRUE, results = extract_pls_sections(payload, data, core))
    }, analysis_timeout_seconds)
  }, error = function(err) {
    res$status <- 500
    analysis_error_response(err, "PLS-SEM analysis", analysis_timeout_seconds)
  })
})

pr$handle("POST", "/run-bootstrap", function(req, res) {
  res$setHeader("Content-Type", "application/json")
  tryCatch({
    with_analysis_timeout_for({
      timings <- new_timing_collector("bootstrap")
      prepared <- time_phase(timings, "prepare payload and read dataset", prepare_payload(req))
      payload <- prepared$payload
      data <- prepared$data
      algorithm <- if (!is.null(payload$algorithm)) tolower(as.character(payload$algorithm)) else "standard"
      if (!(algorithm %in% c("standard", "consistent"))) algorithm <- "standard"
      algorithm_label <- if (algorithm == "consistent") "Consistent PLS (PLSc)" else "Standard PLS"
      core <- time_phase(timings, "get cached/base pls model", get_cached_pls_core(payload, data))
      nboot <- as.integer(payload$nboot %||% 500L)
      if (is.na(nboot) || nboot < 50L) nboot <- 50L
      confidence_level <- as.character(payload$confidenceLevel %||% "95%")
      alpha <- parse_confidence_level_alpha(confidence_level)
      hoc_settings <- normalize_hoc_settings(payload$algorithmSettings %||% list())

      if (has_higher_order_construct(payload) && identical(hoc_settings$hocMethod, "Two-stage") && identical(hoc_settings$hocTwoStage, "Embedded")) {
        boot <- time_phase(timings, "embedded two-stage bootstrap", run_embedded_hoc_bootstrap(payload, data, core, nboot, seed = payload$bootstrapSeed %||% NULL, timings = timings), details = list(nboot = nboot))
        return(attach_timing_metadata(assemble_embedded_bootstrap_response(payload, data, core, boot, nboot, confidence_level, algorithm, algorithm_label, alpha), timings))
      }

      core_plan <- analysis_core_plan()
      boot_model <- time_phase(timings, "seminr bootstrap_model", seminr::bootstrap_model(core$model, nboot = nboot, cores = core_plan$cores), details = list(nboot = nboot, cores = core_plan$cores, detected_cores = core_plan$detected_cores, reserved_cores = core_plan$reserved_cores, core_policy = core_plan$policy))
      boot_summary <- time_phase(timings, "summary boot_model", summary(boot_model, alpha = alpha))
      boot_summary$bootstrapped_paths <- time_phase(timings, "bias-corrected path intervals", add_bias_corrected_intervals(boot_summary$bootstrapped_paths, boot_model$path_coef, boot_model$boot_paths, alpha = alpha))
      boot_summary$bootstrapped_loadings <- time_phase(timings, "bias-corrected loading intervals", add_bias_corrected_intervals(boot_summary$bootstrapped_loadings, boot_model$outer_loadings, boot_model$boot_loadings, alpha = alpha))
      boot_summary$bootstrapped_weights <- time_phase(timings, "bias-corrected weight intervals", add_bias_corrected_intervals(boot_summary$bootstrapped_weights, boot_model$outer_weights, boot_model$boot_weights, alpha = alpha))
      boot_summary$bootstrapped_total_paths <- time_phase(timings, "bias-corrected total-effect intervals", add_bias_corrected_intervals(boot_summary$bootstrapped_total_paths, seminr:::total_effects(boot_model$path_coef), boot_model$boot_total_paths, alpha = alpha))
      response <- time_phase(timings, "assemble bootstrap response", assemble_bootstrap_response(payload, data, core, boot_model, boot_summary, nboot, confidence_level, algorithm, algorithm_label, alpha = alpha))
      attach_timing_metadata(response, timings)
    }, bootstrap_timeout_seconds)
  }, error = function(err) {
    res$status <- 500
    analysis_error_response(err, "Bootstrap analysis", bootstrap_timeout_seconds)
  })
})

pr$handle("POST", "/run-isolated-moderation-r2", function(req, res) {
  res$setHeader("Content-Type", "application/json")
  tryCatch({
    with_analysis_timeout_for({
      timings <- new_timing_collector("isolated_moderation_r2")
      prepared <- time_phase(timings, "prepare payload and read dataset", prepare_payload(req))
      payload <- prepared$payload
      data <- prepared$data
      rows <- time_phase(timings, "compute isolated moderation r2", compute_isolated_moderation_r2(payload, data, timings = timings))
      attach_timing_metadata(list(success = TRUE, results = list(r_square_change_isolated = rows)), timings)
    }, analysis_timeout_seconds)
  }, error = function(err) {
    res$status <- 500
    analysis_error_response(err, "Isolated moderation R2 change", analysis_timeout_seconds)
  })
})

pr$handle("POST", "/run-plspredict", function(req, res) {
  res$setHeader("Content-Type", "application/json")

  tryCatch({
    with_analysis_timeout_for({
      timings <- new_timing_collector("plspredict")
      prepared <- time_phase(timings, "prepare payload and read dataset", prepare_payload(req))
      payload <- prepared$payload
      data <- prepared$data
      core <- time_phase(timings, "get cached/base pls model", get_cached_pls_core(payload, data))

      uses_hoc <- has_higher_order_construct(payload)
      hoc_settings <- normalize_hoc_settings(payload$algorithmSettings %||% list())
      if (
        uses_hoc &&
        identical(hoc_settings$hocMethod, "Two-stage")
      ) {
        stop("PLSpredict is not available for Embedded or Disjoint two-stage higher-order constructs. Run PLS-SEM and Bootstrap instead.")
      }
      predict_core <- core
      if (uses_hoc) predict_core <- build_repeated_indicator_prediction_core(payload, core)
      prediction_representation <- if (uses_hoc) {
        "HOC repeated indicators with internal duplicate-column aliases"
      } else {
        "Standard"
      }

      # Use defaults if not provided by the frontend
      folds <- if (!is.null(payload$folds)) as.integer(payload$folds) else plspredict_default_folds()
      reps <- if (!is.null(payload$repetitions)) as.integer(payload$repetitions) else plspredict_default_repetitions()
      prediction_seed <- as.integer(payload$predictionSeed %||% plspredict_default_seed())
      technique <- normalize_plspredict_technique(payload$technique %||% "DA")
      validation_mode <- if (toupper(as.character(payload$validationMode %||% "K-fold")) == "LOOCV") "LOOCV" else "K-fold"
      prediction_n <- nrow(predict_core$model$data)
      if (prediction_n < 2L) stop("PLSpredict requires at least two usable observations after missing-data processing.")
      prediction_no_folds <- if (validation_mode == "LOOCV") {
        NULL
      } else {
        if (is.na(folds) || folds < 2L) folds <- 2L
        folds <- min(folds, prediction_n)
        if (folds < 2L) stop("PLSpredict k-fold validation requires at least two usable observations.")
        folds
      }
      effective_folds <- if (is.null(prediction_no_folds)) prediction_n else prediction_no_folds
      if (is.na(reps) || reps < 1) reps <- 1
      if (reps > max_predict_repetitions) reps <- max_predict_repetitions

      # Execute ACTUAL k-fold out-of-sample prediction. The seed is set immediately
      # before predict_pls so the extractor can reproduce SEMinR's fold shuffle.
      set.seed(prediction_seed)
      predict_model <- time_phase(timings, "seminr predict_pls", seminr::predict_pls(
        model = predict_core$model,
        technique = technique,
        noFolds = prediction_no_folds,
        reps = reps,
        cores = NULL
      ), details = list(folds = effective_folds, validation_mode = validation_mode, repetitions = reps, prediction_seed = prediction_seed))

      if (is.null(predict_model)) {
        # predict_pls returns NULL for model shapes it cannot handle. Surface a clear
        # message instead of letting extract_plspredict_sections crash on the NULL.
        unavailable_note <- "PLSpredict could not be computed for this model. seminr returned no prediction (this can happen for model shapes it does not support)."
        results <- list(
          final_results = list(
            plspredict_mv_summary = list(),
            plspredict_lv_summary = list(),
            cvpat_lv_summary = list(),
            mv_predictions_and_errors = list(),
            lv_predictions_and_errors = list()
          ),
          algorithm = list(
            settings = list(
              method = "PLSpredict",
              mode = "PLS-SEM",
              algorithm = payload$algorithm %||% "standard",
              algorithm_settings = payload$algorithmSettings %||% list(),
              prediction_technique = if (identical(technique, seminr::predict_EA)) "Earliest antecedents (EA)" else "Direct antecedents (DA)",
              cross_validation = validation_mode,
              folds = effective_folds,
              repetitions = reps,
              prediction_seed = prediction_seed,
              model_representation = prediction_representation
            ),
            execution_log = list(list(message = unavailable_note))
          ),
          meta = list(mode = "plspredict", engine = "seminr", rows = nrow(data), columns = ncol(data))
        )
        attach_timing_metadata(list(success = TRUE, results = results), timings)
      } else {
        # Note: We are passing predict_model instead of pred_summary now!
        results <- time_phase(
          timings,
          "extract plspredict response sections",
          extract_plspredict_sections(payload, data, core, predict_model, effective_folds, reps, timings = timings, prediction_representation = prediction_representation, prediction_core = predict_core)
        )
        attach_timing_metadata(list(success = TRUE, results = results), timings)
      }
    }, plspredict_timeout_seconds)
  }, error = function(err) {
    res$status <- 500
    analysis_error_response(err, "PLSpredict analysis", plspredict_timeout_seconds)
  })
})

pr$handle("POST", "/run-advanced-analysis", function(req, res) {
  res$setHeader("Content-Type", "application/json")

  tryCatch({
    with_analysis_timeout_for({
      timings <- new_timing_collector("advanced")
      prepared <- time_phase(timings, "prepare payload and read dataset", prepare_payload(req))
      payload <- prepared$payload
      data <- prepared$data
      # Avoid the seminrExtras IPMA/cIPMA infinite-recursion that occurs when a
      # single-item construct's name equals its indicator column name.
      adv_inputs <- rename_colliding_single_item_indicators(payload, data)
      payload <- adv_inputs$payload
      data <- adv_inputs$data
      core <- time_phase(timings, "get cached/base pls model", get_cached_pls_core(payload, data))

      results <- time_phase(timings, "run advanced response sections", run_advanced_sections(payload, data, core, timings = timings))
      attach_timing_metadata(list(success = TRUE, results = results), timings)
    }, advanced_analysis_timeout_seconds)
  }, error = function(err) {
    res$status <- 500
    analysis_error_response(err, "Advanced analysis", advanced_analysis_timeout_seconds)
  })
})

pr$handle("POST", "/run-permutation-configural-precheck", function(req, res) {
  res$setHeader("Content-Type", "application/json")

  tryCatch({
    with_analysis_timeout_for({
      timings <- new_timing_collector("permutation configural precheck")
      prepared <- time_phase(timings, "prepare payload and read dataset", prepare_payload(req))
      payload <- prepared$payload
      data <- prepared$data
      assert_micom_payload_supported(payload)
      ensure_micom_loaded()
      core <- time_phase(timings, "get cached/base pls model", get_cached_pls_core(payload, data))

      step1_result <- time_phase(timings, "metis_micom_step1", metis_micom_step1(
        model = core$model,
        data = data,
        group_var = payload$groupingVariable,
        group_a = payload$groupA,
        group_b = payload$groupB
      ))

      response <- time_phase(timings, "assemble MICOM configural precheck response", list(
        success = TRUE,
        results = map_micom_step1_response(payload, data, step1_result, timings = timings)
      ))
      json_unbox_tree(attach_timing_metadata(response, timings))
    }, analysis_timeout_seconds)
  }, error = function(err) {
    res$status <- 500
    analysis_error_response(err, "Permutation configural precheck", analysis_timeout_seconds)
  })
})

pr$handle("POST", "/run-permutation-analysis", function(req, res) {
  res$setHeader("Content-Type", "application/json")

  tryCatch({
    with_analysis_timeout_for({
      timings <- new_timing_collector("permutation")
      prepared <- time_phase(timings, "prepare payload and read dataset", prepare_payload(req))
      payload <- prepared$payload
      data <- prepared$data
      assert_micom_payload_supported(payload)
      ensure_micom_loaded()
      core <- time_phase(timings, "get cached/base pls model", get_cached_pls_core(payload, data))
      core_plan <- analysis_core_plan()
      cores <- core_plan$cores

      micom_result <- time_phase(timings, "metis_micom", metis_micom(
        model = core$model,
        data = data,
        group_var = payload$groupingVariable,
        group_a = payload$groupA,
        group_b = payload$groupB,
        permutations = payload$permutations,
        alpha = payload$alpha,
        seed = payload$seed,
        quick = FALSE,
        cores = cores
      ), details = list(
        permutations = payload$permutations,
        cores = cores,
        detected_cores = core_plan$detected_cores,
        reserved_cores = core_plan$reserved_cores,
        core_policy = core_plan$policy
      ))

      response <- time_phase(timings, "assemble MICOM response", list(
        success = TRUE,
        results = map_micom_response(payload, data, micom_result, timings = timings)
      ))
      json_unbox_tree(attach_timing_metadata(response, timings))
    }, permutation_analysis_timeout_seconds)
  }, error = function(err) {
    res$status <- 500
    analysis_error_response(err, "Permutation analysis", permutation_analysis_timeout_seconds)
  })
})

pr$handle("POST", "/run-multi-group-analysis", function(req, res) {
  res$setHeader("Content-Type", "application/json")

  tryCatch({
    with_analysis_timeout_for({
      timings <- new_timing_collector("mga")
      prepared <- time_phase(timings, "prepare payload and read dataset", prepare_payload(req))
      payload <- prepared$payload
      data <- prepared$data
      mga_data <- time_phase(timings, "filter selected MGA groups", selected_group_rows(
        data,
        payload$groupingVariable,
        payload$groupA,
        payload$groupB
      ))
      if (!nrow(mga_data)) {
        stop("Multi-group analysis found no rows for the selected groups.")
      }
      if (micom_group_count(mga_data, payload$groupingVariable, payload$groupA) < 2L ||
          micom_group_count(mga_data, payload$groupingVariable, payload$groupB) < 2L) {
        stop("Multi-group analysis requires at least two observations in each selected group.")
      }

      core_plan <- analysis_core_plan()
      cores <- core_plan$cores
      set.seed(payload$seed)

      if (has_higher_order_construct(payload)) {
        mga_result <- time_phase(
          timings,
          "group-first HOC bootstrap MGA tables",
          run_hoc_mga_bootstrap_tables(mga_data, payload, cores = cores, timings = timings),
          details = list(
            nboot = payload$nboot,
            hoc_method = hoc_method_label(payload$algorithmSettings, TRUE),
            cores = cores,
            detected_cores = core_plan$detected_cores,
            reserved_cores = core_plan$reserved_cores,
            core_policy = core_plan$policy
          )
        )
      } else {
        mga_core <- time_phase(timings, "estimate selected-group pls model", run_pls_core(payload, mga_data))
        mga_condition <- mga_group_condition(mga_data, payload$groupingVariable, payload$groupA)
        mga_result <- time_phase(
          timings,
          "seminr bootstrap MGA tables",
          run_mga_bootstrap_tables(
            pls_model = mga_core$model,
            condition = mga_condition,
            payload = payload,
            cores = cores
          ),
          details = list(
            nboot = payload$nboot,
            cores = cores,
            detected_cores = core_plan$detected_cores,
            reserved_cores = core_plan$reserved_cores,
            core_policy = core_plan$policy
          )
        )
      }

      response <- time_phase(timings, "assemble MGA response", list(
        success = TRUE,
        results = map_mga_response(payload, mga_data, mga_result, timings = timings)
      ))
      json_unbox_tree(attach_timing_metadata(response, timings))
    }, multi_group_analysis_timeout_seconds)
  }, error = function(err) {
    res$status <- 500
    analysis_error_response(err, "Multi-group analysis", multi_group_analysis_timeout_seconds)
  })
})

message(sprintf("Starting metis Plumber on %s:%s", host, port))
pr$run(host = host, port = port)
