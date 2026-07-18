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
max_cvpat_bootstrap_samples <- suppressWarnings(as.integer(Sys.getenv("METIS_MAX_CVPAT_BOOTSTRAP_SAMPLES", "500")))
max_analysis_cores <- suppressWarnings(as.integer(Sys.getenv("METIS_ANALYSIS_CORES", "")))
max_cached_pls_cores <- suppressWarnings(as.integer(Sys.getenv("METIS_MAX_PLS_CORE_CACHE_ENTRIES", "2")))

read_timeout_seconds <- function(env_name, default_value) {
  value <- suppressWarnings(as.numeric(Sys.getenv(env_name, as.character(default_value))))
  if (is.na(value) || value < 1) default_value else value
}

analysis_timeout_seconds <- read_timeout_seconds("METIS_ANALYSIS_TIMEOUT_SECONDS", 180)
bootstrap_timeout_seconds <- read_timeout_seconds("METIS_BOOTSTRAP_TIMEOUT_SECONDS", max(analysis_timeout_seconds, 900))
plspredict_timeout_seconds <- read_timeout_seconds("METIS_PLSPREDICT_TIMEOUT_SECONDS", max(analysis_timeout_seconds, 600))
advanced_analysis_timeout_seconds <- read_timeout_seconds("METIS_ADVANCED_ANALYSIS_TIMEOUT_SECONDS", max(analysis_timeout_seconds, 600))
permutation_analysis_timeout_seconds <- read_timeout_seconds("METIS_PERMUTATION_ANALYSIS_TIMEOUT_SECONDS", max(analysis_timeout_seconds, 900))
multi_group_analysis_timeout_seconds <- read_timeout_seconds("METIS_MULTI_GROUP_ANALYSIS_TIMEOUT_SECONDS", max(bootstrap_timeout_seconds, 900))

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
if (is.na(max_cvpat_bootstrap_samples) || max_cvpat_bootstrap_samples < 50L) max_cvpat_bootstrap_samples <- 500L
if (is.na(max_cached_pls_cores) || max_cached_pls_cores < 0L) max_cached_pls_cores <- 8L

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
    reserve <- if (detected > 16L) {
      4L
    } else if (detected > 10L) {
      2L
    } else {
      1L
    }
    requested <- detected - reserve
    policy <- "dynamic-reserve"
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
  if (grepl("plspredict could not be computed|seminr returned no prediction", message)) return("PLSPREDICT_UNSUPPORTED")
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
  value <- tolower(require_scalar_string(x, field_name, allow_empty = FALSE, max_chars = 40))
  if (!(value %in% allowed)) {
    stop(sprintf("%s must be one of: %s.", field_name, paste(allowed, collapse = ", ")))
  }
  value
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

validate_algorithm_settings_payload <- function(settings_payload) {
  if (is.null(settings_payload)) return(NULL)
  if (!is.list(settings_payload) || is.null(names(settings_payload)) || any(names(settings_payload) == "")) {
    stop("algorithmSettings must be an object.")
  }

  normalized <- list()
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

validate_multi_group_analysis_payload <- function(payload, construct_names, data_columns) {
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

  list(
    groupingVariable = grouping_variable,
    groupA = group_a,
    groupB = group_b,
    nboot = nboot,
    alpha = as.numeric(payload$alpha),
    seed = seed
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
  if (!is.null(payload$repetitions)) {
    normalized$repetitions <- require_scalar_integer(payload$repetitions, "repetitions", 1L, max_predict_repetitions)
  }
  if (!is.null(payload$cvpatEnabled)) {
    if (!is_scalar_logical(payload$cvpatEnabled)) {
      stop("cvpatEnabled must be true or false.")
    }
    normalized$cvpatEnabled <- isTRUE(payload$cvpatEnabled)
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

run_cvpat_assessment <- function(core, folds, reps, payload = NULL) {
  if (!requireNamespace("seminrExtras", quietly = TRUE)) {
    return(list(
      status = "missing-seminrextras",
      lv_rows = list(),
      mv_rows = list(),
      execution_log = list(list(message = "CVPAT skipped because the R backend does not have seminrExtras installed."))
    ))
  }

  nboot <- max_cvpat_bootstrap_samples
  result <- tryCatch({
    seminrExtras::assess_cvpat(
      seminr_model = core$model,
      testtype = "two.sided",
      nboot = nboot,
      seed = 123,
      technique = seminr::predict_DA,
      noFolds = folds,
      reps = reps,
      cores = 1
    )
  }, error = function(err) {
    list(.metis_error = conditionMessage(err))
  })

  if (!is.null(result$.metis_error)) {
    return(list(
      status = "error",
      lv_rows = list(),
      mv_rows = list(),
      execution_log = list(list(message = paste("CVPAT failed:", result$.metis_error)))
    ))
  }

  label_map <- build_construct_display_name_map(payload %||% list())

  if (is.matrix(result) || is.data.frame(result)) {
    lv_rows <- cvpat_matrix_to_rows(result, "CVPAT", label_map)
  } else {
    lv_rows <- c(
      cvpat_matrix_to_rows(result$CVPAT_compare_LM %||% result$cvpat_compare_lm, "Linear model", label_map),
      cvpat_matrix_to_rows(result$CVPAT_compare_IA %||% result$cvpat_compare_ia, "Item average", label_map)
    )
  }

  cvpat_log <- if (length(lv_rows)) {
    sprintf("CVPAT completed via seminrExtras::assess_cvpat with %s bootstrap subsamples.", nboot)
  } else {
    "CVPAT ran, but seminrExtras returned no comparison rows. Check whether the model has supported endogenous constructs and no unsupported higher-order prediction setup."
  }

  list(
    status = if (length(lv_rows)) "computed" else "empty",
    lv_rows = lv_rows,
    mv_rows = list(),
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
# dimensions of higher-order constructs. Used to build a repeated-indicators
# representation of a HOC for PLSpredict (seminr cannot predict two-stage HOCs).
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

build_measurement <- function(constructs_payload, algorithm = "standard", interactions_payload = list(), for_prediction = FALSE) {
  algorithm <- tolower(as.character(algorithm))
  if (!(algorithm %in% c("standard", "consistent"))) {
    algorithm <- "standard"
  }

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

      if (isTRUE(for_prediction)) {
        # seminr's predict_pls() has no published solution for two-stage higher-order
        # models, so for prediction we represent each HOC with the repeated-indicators
        # approach: a composite over the leaf indicators of all its dimensions.
        leaf_items <- gather_leaf_indicators(con_name, by_name)
        if (!length(leaf_items)) {
          stop(sprintf("Higher-order construct '%s' has no indicators to predict.", con_name))
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
        seminr::composite(con_name, items)
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
  lapply(input_paths, function(p) {
    from <- as.character(p$from)
    to <- as.character(p$to)

    coef <- NA_real_
    if (!is.null(path_matrix)) {
      # seminr::estimate_pls stores path coefficients as rows = source, cols = target.
      if (from %in% rownames(path_matrix) && to %in% colnames(path_matrix)) {
        coef <- safe_num(path_matrix[from, to])
      }
      if ((is.null(coef) || is.na(coef)) && to %in% rownames(path_matrix) && from %in% colnames(path_matrix)) {
        coef <- safe_num(path_matrix[to, from])
      }
    }
    if (is.null(coef) || is.na(coef)) coef <- NULL

    list(from = from, to = to, coefficient = coef)
  })
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
    payload <- c(payload, validate_multi_group_analysis_payload(raw_payload, construct_names, colnames(data)))
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

has_higher_order_construct <- function(payload) {
  constructs <- payload$constructs %||% list()
  any(vapply(constructs, function(con) isTRUE(con$is_higher_order), logical(1)))
}

run_pls_core <- function(payload, data, for_prediction = FALSE) {
  algorithm <- if (!is.null(payload$algorithm)) as.character(payload$algorithm) else "standard"
  measurement_model <- build_measurement(
    payload$constructs,
    algorithm = algorithm,
    interactions_payload = payload$interactions %||% list(),
    for_prediction = for_prediction
  )
  # two_stage interactions require the moderator to have a direct structural path to the
  # outcome. The frontend always includes it, but this guard prevents "subscript out of
  # bounds" from seminr if the path is ever absent.
  safe_paths <- ensure_moderator_main_effects(payload$paths, payload$interactions %||% list())
  structural_model <- build_structural(safe_paths)

  model <- seminr::estimate_pls(
    data = data,
    measurement_model = measurement_model,
    structural_model = structural_model
  )

  summary_obj <- summary(model)
  list(model = model, summary = summary_obj)
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

extract_quality_criteria <- function(payload, data, core) {
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

  list(
    r_square = extract_r2_results(summary_obj, payload$constructs, payload$paths, data),
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
      loading_val <- NA_real_
      weight_val <- NA_real_
      vif_val <- NA_real_

      if (!is.null(ol) && dim_name %in% rownames(ol) && hoc_name %in% colnames(ol)) {
        loading_val <- safe_num(ol[dim_name, hoc_name])
      }

      if (!is.null(ow) && dim_name %in% rownames(ow) && hoc_name %in% colnames(ow)) {
        weight_val <- safe_num(ow[dim_name, hoc_name])
      }

      if (!is.null(vif_items)) {
        if (is.list(vif_items) && !is.null(vif_items[[hoc_name]]) && dim_name %in% names(vif_items[[hoc_name]])) {
          vif_val <- safe_num(vif_items[[hoc_name]][[dim_name]])
        } else if (is.matrix(vif_items) || is.data.frame(vif_items)) {
          if (dim_name %in% rownames(vif_items) && hoc_name %in% colnames(vif_items)) {
            vif_val <- safe_num(vif_items[dim_name, hoc_name])
          } else if (dim_name %in% names(vif_items)) {
            vif_val <- safe_num(vif_items[[dim_name]])
          }
        } else if (dim_name %in% names(vif_items)) {
          vif_val <- safe_num(vif_items[[dim_name]])
        }
      }

      loc_con <- Filter(function(c) as.character(c$name) == dim_name, constructs)
      loc_type <- if (length(loc_con) > 0) tolower(as.character(loc_con[[1]]$type %||% "reflective")) else "reflective"

      hoc_rows[[length(hoc_rows) + 1]] <- list(
        hoc_construct = hoc_name,
        loc_construct = dim_name,
        hoc_type = hoc_type,
        loc_type = loc_type,
        loading = loading_val,
        weight = weight_val,
        vif = vif_val
      )
    }
  }

  hoc_rows
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
        algorithm_label = algorithm_label
      ),
      stop_criterion_changes = extract_stop_criterion(summary_obj),
      post_hoc_power_analysis = extract_post_hoc_power_analysis(payload, data),
      execution_log = list(list(message = "PLS-SEM estimation completed"))
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

extract_plspredict_sections <- function(payload, data, core, predict_model, folds = NULL, reps = NULL, timings = NULL) {
  model <- core$model
  pred_summary <- timed_or_direct(timings, "plspredict summary predict_model", summary(predict_model))

  effective_folds <- folds %||% pred_summary$noFolds %||% payload$folds
  effective_reps <- reps %||% pred_summary$reps %||% payload$repetitions
  cvpat_enabled <- isTRUE(payload$cvpatEnabled)
  cvpat <- if (cvpat_enabled) {
    timed_or_direct(
      timings,
      "plspredict cvpat assessment",
      run_cvpat_assessment(core, effective_folds, effective_reps, payload),
      details = list(folds = effective_folds, repetitions = effective_reps)
    )
  } else {
    list(
      status = "disabled",
      lv_rows = list(),
      mv_rows = list(),
      execution_log = list()
    )
  }
  cvpat_status <- cvpat$status

  algorithm <- if (!is.null(payload$algorithm)) tolower(as.character(payload$algorithm)) else "standard"
  if (!(algorithm %in% c("standard", "consistent"))) algorithm <- "standard"
  algorithm_label <- if (algorithm == "consistent") "Consistent PLS (PLSc)" else "Standard PLS"

  # seminr capitalizes these differently across versions
  pls_oos <- pred_summary$PLS_out_of_sample
  if (is.null(pls_oos)) pls_oos <- pred_summary$pls_out_of_sample

  lm_oos <- pred_summary$LM_out_of_sample
  if (is.null(lm_oos)) lm_oos <- pred_summary$lm_out_of_sample

  to_numeric_scalar <- function(v) {
    vv <- suppressWarnings(as.numeric(unlist(v)))
    if (!length(vv) || is.na(vv[1])) return(NULL)
    vv[1]
  }

  sanitize_scalar <- function(v) {
    if (is.null(v)) return(NULL)
    if (is.atomic(v) && length(v) == 1 && !is.na(v)) return(as.numeric(v))
    to_numeric_scalar(v)
  }

  find_metric_row <- function(df, metric_pattern) {
    if (is.null(df) || is.null(rownames(df))) return(NULL)
    rn <- rownames(df)
    if (!length(rn)) return(NULL)
    idx <- grep(metric_pattern, rn, ignore.case = TRUE)
    if (!length(idx)) return(NULL)
    rn[idx[1]]
  }

  find_metric_col <- function(df, metric_pattern) {
    if (is.null(df) || is.null(colnames(df))) return(NULL)
    cn <- colnames(df)
    if (!length(cn)) return(NULL)
    idx <- grep(metric_pattern, cn, ignore.case = TRUE)
    if (!length(idx)) return(NULL)
    cn[idx[1]]
  }

  as_df <- function(x) {
    if (is.null(x)) return(NULL)
    if (is.matrix(x)) return(as.data.frame(x, stringsAsFactors = FALSE))
    if (is.data.frame(x)) return(x)
    if (is.list(x)) {
      nn <- names(x)
      if (!is.null(nn) && length(nn)) {
        # Typical list-of-metrics shape: $RMSE, $MAE, $Q2_predict (named by indicator)
        metric_like <- vapply(nn, function(n) grepl("q2|rmse|mae", n, ignore.case = TRUE), logical(1))
        if (any(metric_like)) {
          sub <- x[metric_like]
          ind_names <- unique(unlist(lapply(sub, names), use.names = FALSE))
          ind_names <- ind_names[!is.na(ind_names) & nzchar(ind_names)]
          if (length(ind_names)) {
            out <- data.frame(row.names = ind_names)
            for (metric in names(sub)) {
              vals <- sub[[metric]]
              out[[metric]] <- vapply(ind_names, function(ind) {
                if (!is.null(vals[[ind]])) return(to_numeric_scalar(vals[[ind]]) %||% NA_real_)
                if (!is.null(vals[ind])) return(to_numeric_scalar(vals[ind]) %||% NA_real_)
                NA_real_
              }, numeric(1))
            }
            return(out)
          }
        }
      }
    }
    NULL
  }

  `%||%` <- function(a, b) if (is.null(a)) b else a

  pick_first_non_null <- function(...) {
    vals <- list(...)
    for (v in vals) {
      if (!is.null(v)) return(v)
    }
    NULL
  }

  collect_tabular_leaves <- function(x) {
    out <- list()
    walk <- function(node) {
      if (is.null(node)) return()
      if (is.matrix(node) || is.data.frame(node)) {
        out[[length(out) + 1]] <<- as.data.frame(node, stringsAsFactors = FALSE)
        return()
      }
      if (is.list(node)) {
        for (item in node) walk(item)
      }
    }
    walk(x)
    out
  }

  to_case_df <- function(x) {
    if (is.null(x)) return(NULL)
    if (is.matrix(x) || is.data.frame(x)) return(as.data.frame(x, stringsAsFactors = FALSE))

    # Try direct coercion first (works for list-of-equal-length vectors)
    direct <- tryCatch(as.data.frame(x, stringsAsFactors = FALSE), error = function(e) NULL)
    if (!is.null(direct) && nrow(direct) > 0 && ncol(direct) > 0) return(direct)

    leaves <- collect_tabular_leaves(x)
    if (!length(leaves)) return(NULL)

    all_cols <- unique(unlist(lapply(leaves, names), use.names = FALSE))
    if (!length(all_cols)) return(NULL)

    aligned <- lapply(leaves, function(df) {
      miss <- setdiff(all_cols, names(df))
      for (m in miss) df[[m]] <- NA
      df <- df[all_cols]
      rownames(df) <- NULL
      df
    })

    out <- do.call(rbind, aligned)
    rownames(out) <- NULL
    out
  }

  get_metric_by_indicator <- function(df, indicator, metric_pattern) {
    if (is.null(df)) return(NULL)

    # Orientation A: indicators in rows, metrics in columns
    if (!is.null(rownames(df)) && indicator %in% rownames(df)) {
      col_name <- find_metric_col(df, metric_pattern)
      if (!is.null(col_name)) {
        return(to_numeric_scalar(df[indicator, col_name]))
      }
    }

    # Orientation B: metrics in rows, indicators in columns
    if (!is.null(colnames(df)) && indicator %in% colnames(df)) {
      row_name <- find_metric_row(df, metric_pattern)
      if (!is.null(row_name)) {
        return(to_numeric_scalar(df[row_name, indicator]))
      }
    }

    NULL
  }

  pls_df <- as_df(pls_oos)
  lm_df <- as_df(lm_oos)

  predict_items <- predict_model$items %||% list()
  pls_oos_residuals <- pick_first_non_null(
    predict_items$PLS_out_of_sample_residuals,
    predict_items$pls_out_of_sample_residuals,
    predict_model$PLS_out_of_sample_residuals,
    predict_model$pls_out_of_sample_residuals
  )
  lm_oos_residuals <- pick_first_non_null(
    predict_items$lm_out_of_sample_residuals,
    predict_items$LM_out_of_sample_residuals,
    predict_model$lm_out_of_sample_residuals,
    predict_model$LM_out_of_sample_residuals
  )
  item_actuals <- pick_first_non_null(
    predict_items$item_actuals,
    predict_items$items_actuals,
    predict_model$item_actuals,
    predict_model$items_actuals
  )

  pls_oos_resids_df <- to_case_df(pls_oos_residuals)
  lm_oos_resids_df <- to_case_df(lm_oos_residuals)
  item_actuals_df <- to_case_df(item_actuals)

  numeric_column <- function(df, col, n = NULL) {
    if (is.null(df) || !(col %in% colnames(df))) return(NULL)
    values <- suppressWarnings(as.numeric(unlist(df[[col]], use.names = FALSE)))
    if (!is.null(n)) values <- values[seq_len(min(length(values), n))]
    values
  }

  residual_metric <- function(residual_df, indicator, metric) {
    res <- numeric_column(residual_df, indicator)
    if (is.null(res)) return(NULL)
    res <- res[is.finite(res)]
    if (!length(res)) return(NULL)
    if (identical(metric, "rmse")) return(sqrt(mean(res^2, na.rm = TRUE)))
    if (identical(metric, "mae")) return(mean(abs(res), na.rm = TRUE))
    NULL
  }

  calculate_q2_predict <- function(indicator) {
    if (is.null(pls_oos_resids_df) || is.null(item_actuals_df)) return(NULL)
    if (!(indicator %in% colnames(pls_oos_resids_df)) || !(indicator %in% colnames(item_actuals_df))) return(NULL)
    n <- min(nrow(pls_oos_resids_df), nrow(item_actuals_df))
    if (!is.finite(n) || n < 1L) return(NULL)

    residuals <- numeric_column(pls_oos_resids_df, indicator, n)
    actuals <- numeric_column(item_actuals_df, indicator, n)
    if (is.null(residuals) || is.null(actuals)) return(NULL)

    valid <- is.finite(residuals) & is.finite(actuals)
    if (!any(valid)) return(NULL)

    residuals <- residuals[valid]
    actuals <- actuals[valid]
    benchmark <- NULL
    if (!is.null(model$meanData) && indicator %in% names(model$meanData)) {
      benchmark <- suppressWarnings(as.numeric(model$meanData[[indicator]]))
    }
    if (is.null(benchmark) || !length(benchmark) || !is.finite(benchmark[[1]])) {
      benchmark <- mean(actuals, na.rm = TRUE)
    } else {
      benchmark <- benchmark[[1]]
    }

    denom <- sum((actuals - benchmark)^2, na.rm = TRUE)
    if (!is.finite(denom) || denom <= 0) return(NULL)

    1 - (sum(residuals^2, na.rm = TRUE) / denom)
  }

  # 1. MV Predictions Summary
  mv_rows <- list()
  indicator_names <- character(0)
  if (!is.null(pls_df)) {
    row_ids <- rownames(pls_df)
    col_ids <- colnames(pls_df)
    if (!is.null(row_ids) && identical(row_ids, as.character(seq_len(length(row_ids))))) {
      row_ids <- character(0)
    }

    # Prefer dimension that does NOT look like metric labels
    row_metric_like <- !is.null(row_ids) && any(grepl("q2|rmse|mae", row_ids, ignore.case = TRUE))
    col_metric_like <- !is.null(col_ids) && any(grepl("q2|rmse|mae", col_ids, ignore.case = TRUE))

    if (row_metric_like && !col_metric_like) {
      indicator_names <- col_ids
    } else if (length(row_ids)) {
      indicator_names <- row_ids
    } else if (!col_metric_like) {
      indicator_names <- col_ids
    }
  }

  if (!length(indicator_names) && !is.null(pls_oos_resids_df)) {
    indicator_names <- colnames(pls_oos_resids_df)
  }
  if (!length(indicator_names) && !is.null(item_actuals_df)) {
    indicator_names <- colnames(item_actuals_df)
  }

  indicator_names <- indicator_names[!is.na(indicator_names) & nzchar(indicator_names)]

  for (ind in indicator_names) {
    q2_predict <- sanitize_scalar(get_metric_by_indicator(pls_df, ind, "q2"))
    if (is.null(q2_predict)) q2_predict <- sanitize_scalar(calculate_q2_predict(ind))

    pls_rmse <- sanitize_scalar(get_metric_by_indicator(pls_df, ind, "rmse"))
    if (is.null(pls_rmse)) pls_rmse <- sanitize_scalar(residual_metric(pls_oos_resids_df, ind, "rmse"))

    pls_mae <- sanitize_scalar(get_metric_by_indicator(pls_df, ind, "mae"))
    if (is.null(pls_mae)) pls_mae <- sanitize_scalar(residual_metric(pls_oos_resids_df, ind, "mae"))

    row <- list(
      Indicator = ind,
      Q2predict = q2_predict,
      `PLS-SEM_RMSE` = pls_rmse,
      `PLS-SEM_MAE` = pls_mae
    )

    lm_rmse <- sanitize_scalar(get_metric_by_indicator(lm_df, ind, "rmse"))
    if (is.null(lm_rmse)) lm_rmse <- sanitize_scalar(residual_metric(lm_oos_resids_df, ind, "rmse"))
    lm_mae <- sanitize_scalar(get_metric_by_indicator(lm_df, ind, "mae"))
    if (is.null(lm_mae)) lm_mae <- sanitize_scalar(residual_metric(lm_oos_resids_df, ind, "mae"))

    if (!is.null(lm_rmse)) row$`LM_RMSE` <- lm_rmse
    if (!is.null(lm_mae)) row$`LM_MAE` <- lm_mae

    # Final hardening to prevent any nested list/matrix/object leakage to JSON
    row$Q2predict <- sanitize_scalar(row$Q2predict)
    row$`PLS-SEM_RMSE` <- sanitize_scalar(row$`PLS-SEM_RMSE`)
    row$`PLS-SEM_MAE` <- sanitize_scalar(row$`PLS-SEM_MAE`)
    if (!is.null(row$`LM_RMSE`)) row$`LM_RMSE` <- sanitize_scalar(row$`LM_RMSE`)
    if (!is.null(row$`LM_MAE`)) row$`LM_MAE` <- sanitize_scalar(row$`LM_MAE`)

    mv_rows[[length(mv_rows) + 1]] <- row
  }

  # 2. LV Predictions Summary (Calculated manually from residuals)
  lv_rows <- list()
  residuals_lvs <- predict_model$residuals_LVs
  if (is.null(residuals_lvs)) residuals_lvs <- predict_model$residuals_lvs

  if (!is.null(residuals_lvs) && !is.null(core$summary$composite_scores)) {
    lv_resids <- as.data.frame(residuals_lvs)
    actual_lvs <- as.data.frame(core$summary$composite_scores)

    for (lv in colnames(lv_resids)) {
      if (lv %in% colnames(actual_lvs)) {
        res <- unlist(lv_resids[[lv]])
        act <- unlist(actual_lvs[[lv]])

        rmse <- sqrt(mean(res^2, na.rm = TRUE))
        mae <- mean(abs(res), na.rm = TRUE)
        q2 <- 1 - (sum(res^2, na.rm = TRUE) / sum((act - mean(act, na.rm = TRUE))^2, na.rm = TRUE))

        lv_rows[[length(lv_rows) + 1]] <- list(
          Construct = lv,
          Q2predict = sanitize_scalar(q2),
          `PLS-SEM_RMSE` = sanitize_scalar(rmse),
          `PLS-SEM_MAE` = sanitize_scalar(mae)
        )
      }
    }
  }

  # Fallback LV predictive summary when explicit PLSpredict LV residual slots are unavailable
  if (!length(lv_rows) && !is.null(core$summary$composite_scores) && !is.null(model$path_coef)) {
    score_df <- as.data.frame(core$summary$composite_scores)
    path_matrix <- model$path_coef

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

      act <- score_df[[target]]
      res <- act - pred_val
      rmse <- sqrt(mean(res^2, na.rm = TRUE))
      mae <- mean(abs(res), na.rm = TRUE)
      denom <- sum((act - mean(act, na.rm = TRUE))^2, na.rm = TRUE)
      q2 <- if (is.na(denom) || denom <= 0) NULL else 1 - (sum(res^2, na.rm = TRUE) / denom)

      lv_rows[[length(lv_rows) + 1]] <- list(
        Construct = target,
        Q2predict = sanitize_scalar(q2),
        `PLS-SEM_RMSE` = sanitize_scalar(rmse),
        `PLS-SEM_MAE` = sanitize_scalar(mae)
      )
    }
  }

  # 3. MV predictions and errors per case (capped at 100 cases to save memory)
  mv_pred_err <- list()
  predicted_mvs <- pick_first_non_null(
    predict_model$predicted_MVs,
    predict_model$predicted_mvs,
    predict_model$predictions_MVs,
    predict_model$predictions_mvs,
    predict_model$predicted_values$MVs,
    predict_model$predicted_values$mvs,
    predict_model$predicted_values
  )
  residuals_mvs <- pick_first_non_null(
    predict_model$residuals_MVs,
    predict_model$residuals_mvs,
    predict_model$prediction_errors$MVs,
    predict_model$prediction_errors$mvs,
    predict_model$prediction_errors
  )

  preds_mv_df <- to_case_df(predicted_mvs)
  resids_mv_df <- to_case_df(residuals_mvs)

  # If residuals are missing but predictions exist, compute residuals from original indicator data when possible
  if (is.null(resids_mv_df) && !is.null(preds_mv_df)) {
    overlap <- intersect(colnames(preds_mv_df), colnames(data))
    if (length(overlap)) {
      n <- min(nrow(preds_mv_df), nrow(data))
      resids_mv_df <- as.data.frame(matrix(NA_real_, nrow = n, ncol = length(overlap)), stringsAsFactors = FALSE)
      names(resids_mv_df) <- overlap
      for (col in overlap) {
        pred_col <- suppressWarnings(as.numeric(unlist(preds_mv_df[seq_len(n), col])))
        act_col <- suppressWarnings(as.numeric(unlist(data[seq_len(n), col])))
        resids_mv_df[[col]] <- act_col - pred_col
      }
      preds_mv_df <- preds_mv_df[seq_len(n), , drop = FALSE]
    }
  }

  if (!is.null(preds_mv_df) && !is.null(resids_mv_df)) {
    common_cols <- intersect(colnames(preds_mv_df), colnames(resids_mv_df))
    if (length(common_cols)) {
      n <- min(100, nrow(preds_mv_df), nrow(resids_mv_df))
      for (col in common_cols) {
        for (i in seq_len(n)) {
          mv_pred_err[[length(mv_pred_err) + 1]] <- list(
            Case = i,
            Indicator = col,
            Prediction = sanitize_scalar(preds_mv_df[i, col]),
            Error = sanitize_scalar(resids_mv_df[i, col])
          )
        }
      }
    }
  }

  # Fallback: use summary-level MV prediction error tables (version-dependent names)
  if (!length(mv_pred_err)) {
    mv_err_tbl <- pick_first_non_null(
      pred_summary$PLS_MV_prediction_error,
      pred_summary$pls_mv_prediction_error,
      pred_summary$PLS_MV_prediction_errors,
      pred_summary$pls_mv_prediction_errors,
      pred_summary$MV_prediction_error,
      pred_summary$mv_prediction_error
    )
    mv_err_df <- to_case_df(mv_err_tbl)
    if (!is.null(mv_err_df) && nrow(mv_err_df) > 0) {
      n <- min(100, nrow(mv_err_df))
      mv_err_df <- mv_err_df[seq_len(n), , drop = FALSE]
      for (col in names(mv_err_df)) {
        mv_err_df[[col]] <- vapply(mv_err_df[[col]], function(v) {
          sv <- sanitize_scalar(v)
          if (is.null(sv)) NA_real_ else sv
        }, numeric(1))
      }
      mv_err_df <- cbind(Case = seq_len(n), mv_err_df, stringsAsFactors = FALSE)
      mv_pred_err <- as_rows(mv_err_df)
    }
  }

  # Final fallback: baseline MV case-level errors using indicator means
  if (!length(mv_pred_err)) {
    indicator_names_payload <- unique(unlist(
      lapply(payload$constructs, function(con) unlist(lapply(con$indicators, as.character), use.names = FALSE)),
      use.names = FALSE
    ))
    indicator_names_payload <- indicator_names_payload[!is.na(indicator_names_payload) & nzchar(indicator_names_payload)]
    indicator_cols <- intersect(indicator_names_payload, names(data))

    if (length(indicator_cols)) {
      n <- min(100, nrow(data))
      for (col in indicator_cols) {
        actual <- suppressWarnings(as.numeric(unlist(data[seq_len(n), col])))
        mu <- mean(actual, na.rm = TRUE)
        pred <- rep(mu, n)
        err <- actual - pred
        for (i in seq_len(n)) {
          mv_pred_err[[length(mv_pred_err) + 1]] <- list(
            Case = i,
            Indicator = col,
            Prediction = sanitize_scalar(pred[i]),
            Error = sanitize_scalar(err[i])
          )
        }
      }
    }
  }

  # 4. LV predictions and errors per case
  lv_pred_err <- list()
  predicted_lvs <- pick_first_non_null(
    predict_model$predicted_LVs,
    predict_model$predicted_lvs,
    predict_model$predictions_LVs,
    predict_model$predictions_lvs,
    predict_model$predicted_values$LVs,
    predict_model$predicted_values$lvs
  )

  preds_lv_df <- to_case_df(predicted_lvs)
  resids_lv_df <- to_case_df(residuals_lvs)

  # If residuals missing, derive from actual latent scores when possible
  if (is.null(resids_lv_df) && !is.null(preds_lv_df) && !is.null(core$summary$composite_scores)) {
    actual_lvs <- as.data.frame(core$summary$composite_scores)
    overlap <- intersect(colnames(preds_lv_df), colnames(actual_lvs))
    if (length(overlap)) {
      n <- min(nrow(preds_lv_df), nrow(actual_lvs))
      resids_lv_df <- as.data.frame(matrix(NA_real_, nrow = n, ncol = length(overlap)), stringsAsFactors = FALSE)
      names(resids_lv_df) <- overlap
      for (col in overlap) {
        pred_col <- suppressWarnings(as.numeric(unlist(preds_lv_df[seq_len(n), col])))
        act_col <- suppressWarnings(as.numeric(unlist(actual_lvs[seq_len(n), col])))
        resids_lv_df[[col]] <- act_col - pred_col
      }
      preds_lv_df <- preds_lv_df[seq_len(n), , drop = FALSE]
    }
  }

  if (!is.null(preds_lv_df) && !is.null(resids_lv_df)) {
    common_cols <- intersect(colnames(preds_lv_df), colnames(resids_lv_df))
    if (length(common_cols)) {
      n <- min(100, nrow(preds_lv_df), nrow(resids_lv_df))
      for (col in common_cols) {
        for (i in seq_len(n)) {
          lv_pred_err[[length(lv_pred_err) + 1]] <- list(
            Case = i,
            Construct = col,
            Prediction = sanitize_scalar(preds_lv_df[i, col]),
            Error = sanitize_scalar(resids_lv_df[i, col])
          )
        }
      }
    }
  }

  # Fallback: use summary-level LV prediction error tables (version-dependent names)
  if (!length(lv_pred_err)) {
    lv_err_tbl <- pick_first_non_null(
      pred_summary$PLS_LV_prediction_error,
      pred_summary$pls_lv_prediction_error,
      pred_summary$PLS_LV_prediction_errors,
      pred_summary$pls_lv_prediction_errors,
      pred_summary$LV_prediction_error,
      pred_summary$lv_prediction_error
    )
    lv_err_df <- to_case_df(lv_err_tbl)
    if (!is.null(lv_err_df) && nrow(lv_err_df) > 0) {
      n <- min(100, nrow(lv_err_df))
      lv_err_df <- lv_err_df[seq_len(n), , drop = FALSE]
      for (col in names(lv_err_df)) {
        lv_err_df[[col]] <- vapply(lv_err_df[[col]], function(v) {
          sv <- sanitize_scalar(v)
          if (is.null(sv)) NA_real_ else sv
        }, numeric(1))
      }
      lv_err_df <- cbind(Case = seq_len(n), lv_err_df, stringsAsFactors = FALSE)
      lv_pred_err <- as_rows(lv_err_df)
    }
  }

  # Fallback LV case-level predictions/errors when PLSpredict LV slots are unavailable
  if (!length(lv_pred_err) && !is.null(core$summary$composite_scores) && !is.null(model$path_coef)) {
    score_df <- as.data.frame(core$summary$composite_scores)
    path_matrix <- model$path_coef

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
      err <- obs - pred_val
      n <- min(100, length(obs), length(pred_val), length(err))
      for (i in seq_len(n)) {
        lv_pred_err[[length(lv_pred_err) + 1]] <- list(
          Case = i,
          Construct = target,
          Prediction = sanitize_scalar(pred_val[i]),
          Error = sanitize_scalar(err[i])
        )
      }
    }
  }

  list(
    final_results = list(
      plspredict_mv_summary = mv_rows,
      plspredict_lv_summary = lv_rows,
      cvpat_lv_summary = cvpat$lv_rows,
      mv_predictions_and_errors = mv_pred_err,
      lv_predictions_and_errors = lv_pred_err
    ),
    algorithm = list(
      settings = list(
        method = "PLSpredict (k-fold cross-validation)",
        mode = "PLS-SEM",
        algorithm = algorithm,
        algorithm_label = algorithm_label,
        folds = effective_folds,
        repetitions = effective_reps,
        cvpat_enabled = cvpat_enabled,
        cvpat_status = cvpat_status
      ),
      execution_log = c(
        list(list(message = "PLSpredict successfully ran out-of-sample k-fold cross-validation via seminr")),
        cvpat$execution_log
      )
    ),
    histograms = list(
      plsem_mv_error_histogram = list(),
      plsem_lv_error_histogram = list()
    ),
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
      rows = nrow(data),
      columns = ncol(data),
      engine = "seminr",
      analysis_settings = list(
        plspredict = list(
          folds = effective_folds,
          repetitions = effective_reps,
          cvpatEnabled = cvpat_enabled
        )
      ),
      cvpat_status = cvpat_status
    )
  )
}

pr$handle("GET", "/health", function(req, res) {
  res$setHeader("Content-Type", "application/json")
  list(status = "ok", service = "metis-plumber")
})

assemble_bootstrap_response <- function(payload, data, core, boot_model, boot_summary, nboot, confidence_level, algorithm, algorithm_label, alpha = 0.05) {
  total_indirect_matrix <- seminr:::total_indirect_effects(boot_model$path_coef)
  if (
    !is.null(total_indirect_matrix) &&
    any(total_indirect_matrix != 0, na.rm = TRUE) &&
    !is.null(boot_model$boot_total_paths) &&
    !is.null(boot_model$boot_paths)
  ) {
    boot_total_indirect <- boot_model$boot_total_paths - boot_model$boot_paths
    boot_summary$bootstrapped_total_indirect_paths <- seminr:::parse_boot_array(
      total_indirect_matrix,
      boot_total_indirect,
      alpha = alpha
    )
    boot_summary$bootstrapped_total_indirect_paths <- add_bias_corrected_intervals(
      boot_summary$bootstrapped_total_indirect_paths,
      total_indirect_matrix,
      boot_total_indirect,
      alpha = alpha
    )
  }
  specific_indirect <- extract_specific_indirect_effects(payload, boot_model, alpha = alpha)

  boot_paths <- as_rows(boot_summary$bootstrapped_paths)
  if (!length(boot_paths)) {
    boot_paths <- extract_path_results(core$model, payload$paths)
  }

  boot_total_indirect <- as_rows(
    boot_summary$bootstrapped_total_indirect_effects %||%
    boot_summary$bootstrapped_total_indirect_paths %||%
    boot_summary$total_indirect_effects
  )
  if (!length(boot_total_indirect)) {
    boot_total_indirect <- as_rows(core$summary$total_indirect_effects)
  }

  boot_total_effects <- as_rows(
    boot_summary$bootstrapped_total_effects %||%
    boot_summary$bootstrapped_total_paths %||%
    boot_summary$total_effects
  )
  if (!length(boot_total_effects)) {
    boot_total_effects <- as_rows(core$summary$total_effects)
  }

  boot_loadings <- as_rows(boot_summary$bootstrapped_loadings)
  if (!length(boot_loadings)) {
    boot_loadings <- as_rows(core$summary$loadings)
  }

  boot_weights <- as_rows(boot_summary$bootstrapped_weights)
  if (!length(boot_weights)) {
    boot_weights <- as_rows(core$summary$weights)
  }

  quality_criteria <- c(
    extract_quality_criteria(payload, data, core),
    list(htmt_confidence_intervals = as_rows(boot_summary$bootstrapped_HTMT))
  )
  execution_log <- list(
    list(message = sprintf("Bootstrap completed with %s subsamples", nboot))
  )

  results <- list(
    final_results = list(
      path_coefficients = boot_paths,
      total_indirect_effects = boot_total_indirect,
      specific_indirect_effects = specific_indirect,
      total_effects = boot_total_effects,
      outer_loadings = boot_loadings,
      outer_weights = boot_weights
    ),
    quality_criteria = quality_criteria,
    algorithm = list(
      settings = list(
        mode = "PLS-SEM",
        algorithm = algorithm,
        algorithm_label = algorithm_label,
        nboot = nboot,
        ci_type = if (!is.null(payload$ciType)) as.character(payload$ciType) else "Percentile",
        confidence_level = confidence_level
      ),
      execution_log = execution_log
    ),
    execution_log = execution_log,
    model_and_data = list(
      inner_model = as_rows(core$model$path_coef),
      outer_model = as_rows(core$model$outer_loadings),
      indicator_data_original = as_rows(utils::head(data, 200)),
      indicator_data_standardized = as_rows(utils::head(standardize_data(data), 200)),
      indicator_data_correlations = extract_indicator_correlations(data)
    ),
    meta = list(
      mode = "bootstrap",
      algorithm = algorithm,
      algorithm_label = algorithm_label,
      rows = nrow(data),
      columns = ncol(data),
      engine = "seminr"
    )
  )

  list(success = TRUE, results = results)
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
  fallback <- "MICOM was not run for this analysis. Interpret results well."
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

mga_overview_setup_rows <- function(payload, data, mga_result) {
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
    list("Analysis information" = "Measurement invariance status", Value = mga_micom_overview_message(mga_result))
  )
}

mga_boot_paths_matrix <- function(pls_boot) {
  boot_paths <- seminr:::boot_paths_df(pls_boot)
  if (is.null(dim(boot_paths))) {
    path_names <- seminr:::to_path_labels(pls_boot$smMatrix)
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

mga_pls_mga_p <- function(group_a_mean, group_b_mean, group_a_boot, group_b_boot) {
  boot_a <- mga_clean_boot_values(group_a_boot)
  boot_b <- mga_clean_boot_values(group_b_boot)
  j <- min(length(boot_a), length(boot_b))
  if (j < 1L || is.null(group_a_mean) || is.null(group_b_mean)) return(NULL)
  boot_a <- boot_a[seq_len(j)]
  boot_b <- boot_b[seq_len(j)]
  comparison <- outer(
    boot_a,
    boot_b,
    FUN = function(a, b) 2 * group_a_mean - a - 2 * group_b_mean + b
  )
  1 - (sum(ifelse(comparison > 0, 1, 0), na.rm = TRUE) / (j ^ 2))
}

mga_parametric_stats <- function(diff, group_a_boot, group_b_boot, alpha, group_a_n, group_b_n, welch = FALSE) {
  boot_a <- mga_clean_boot_values(group_a_boot)
  boot_b <- mga_clean_boot_values(group_b_boot)
  rep_a <- length(boot_a)
  rep_b <- length(boot_b)
  n_a <- suppressWarnings(as.numeric(group_a_n))[1]
  n_b <- suppressWarnings(as.numeric(group_b_n))[1]
  if (is.null(diff) || n_a < 2L || n_b < 2L) {
    return(list(t_value = NULL, df = NULL, p_value = NULL, significant = FALSE))
  }
  if (rep_a < 2L || rep_b < 2L) {
    return(list(t_value = NULL, df = NULL, p_value = NULL, significant = FALSE))
  }

  sd_a <- stats::sd(boot_a)
  sd_b <- stats::sd(boot_b)
  if (!is.finite(sd_a) || !is.finite(sd_b)) {
    return(list(t_value = NULL, df = NULL, p_value = NULL, significant = FALSE))
  }

  if (isTRUE(welch)) {
    variance_a <- (sd_a ^ 2) / n_a
    variance_b <- (sd_b ^ 2) / n_b
    se <- sqrt(variance_a + variance_b)
    df <- ((variance_a + variance_b) ^ 2) /
      (((variance_a ^ 2) / (n_a - 1L)) + ((variance_b ^ 2) / (n_b - 1L)))
  } else {
    df <- n_a + n_b - 2L
    pooled <- sqrt((((n_a - 1L) * (sd_a ^ 2)) + ((n_b - 1L) * (sd_b ^ 2))) / df)
    se <- pooled * sqrt((1 / n_a) + (1 / n_b))
  }

  if (!is.finite(se) || se <= 0 || !is.finite(df) || df <= 0) {
    return(list(t_value = NULL, df = NULL, p_value = NULL, significant = FALSE))
  }

  t_value <- diff / se
  p_value <- 2 * stats::pt(-abs(t_value), df = df)
  list(
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

  for (entry in entries) {
    estimate_a <- mga_number(entry$estimate_a)
    estimate_b <- mga_number(entry$estimate_b)
    diff <- if (!is.null(estimate_a) && !is.null(estimate_b)) estimate_a - estimate_b else NULL
    boot_a <- mga_clean_boot_values(entry$boot_a)
    boot_b <- mga_clean_boot_values(entry$boot_b)
    mean_a <- if (length(boot_a)) mean(boot_a) else NULL
    mean_b <- if (length(boot_b)) mean(boot_b) else NULL
    pls_mga_p <- mga_pls_mga_p(mean_a, mean_b, boot_a, boot_b)
    p_value_inverse <- if (!is.null(pls_mga_p)) 1 - pls_mga_p else NULL
    pls_significant <- !is.null(pls_mga_p) && (
      pls_mga_p <= alpha ||
      (!is.null(p_value_inverse) && p_value_inverse <= alpha)
    )
    direction <- mga_direction(diff, payload$groupA, payload$groupB)
    a_ci <- mga_ci_values(boot_a, estimate_a, alpha)
    b_ci <- mga_ci_values(boot_b, estimate_b, alpha)
    ci_overlap <- mga_ci_overlap(a_ci, b_ci)
    ci_significant <- !is.null(ci_overlap) && !isTRUE(ci_overlap)
    parametric <- mga_parametric_stats(diff, boot_a, boot_b, alpha, group_a_n, group_b_n, welch = FALSE)

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
        t_value = parametric$t_value,
        p_value = parametric$p_value,
        significant = parametric$significant,
        result = mga_result_label(parametric$significant)
      )
    )
  }

  list(
    biasCorrectedConfidenceIntervals = ci_rows,
    henselerPlsMga = henseler_rows,
    parametricTest = parametric_rows
  )
}

mga_path_entries <- function(pls_model, group1_model, group2_model, group1_boot, group2_boot) {
  sm_matrix <- pls_model$smMatrix
  sources <- seminr:::path_sources(sm_matrix)
  targets <- seminr:::path_targets(sm_matrix)
  path_names <- seminr:::to_path_labels(sm_matrix)
  boot1_betas <- mga_boot_paths_matrix(group1_boot)
  boot2_betas <- mga_boot_paths_matrix(group2_boot)
  lookup_paths <- function(path_coef) {
    mapply(function(s, t) path_coef[s, t], sources, targets)
  }
  group1_betas <- lookup_paths(group1_model$path_coef)
  group2_betas <- lookup_paths(group2_model$path_coef)

  lapply(seq_along(path_names), function(index) {
    path_name <- path_names[[index]]
    boot1_index <- match(path_name, colnames(boot1_betas))
    boot2_index <- match(path_name, colnames(boot2_betas))
    if (is.na(boot1_index)) boot1_index <- index
    if (is.na(boot2_index)) boot2_index <- index
    list(
      identity = list(
        source = as.character(sources[[index]] %||% ""),
        target = as.character(targets[[index]] %||% ""),
        path = as.character(path_name %||% "")
      ),
      estimate_a = group1_betas[[index]],
      estimate_b = group2_betas[[index]],
      boot_a = boot1_betas[, boot1_index],
      boot_b = boot2_betas[, boot2_index]
    )
  })
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

mga_group_bootstrap_sections <- function(payload, group_data, group_model, group_boot) {
  alpha <- payload$alpha
  algorithm <- if (!is.null(payload$algorithm)) tolower(as.character(payload$algorithm)) else "standard"
  if (!(algorithm %in% c("standard", "consistent"))) algorithm <- "standard"
  algorithm_label <- if (algorithm == "consistent") "Consistent PLS (PLSc)" else "Standard PLS"
  confidence_level <- sprintf("%g%%", (1 - alpha) * 100)
  group_core <- list(model = group_model, summary = summary(group_model))
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
    alpha = alpha
  )
  group_response$results %||% group_response
}

run_mga_bootstrap_tables <- function(pls_model, condition, payload, ...) {
  pls_data <- pls_model$rawdata
  group1_data <- pls_data[condition, , drop = FALSE]
  group2_data <- pls_data[!condition, , drop = FALSE]
  group1_n <- nrow(group1_data)
  group2_n <- nrow(group2_data)
  nboot <- payload$nboot

  message("Estimating and bootstrapping selected MGA groups...")
  group1_model <- seminr:::rerun(pls_model, data = group1_data)
  group2_model <- seminr:::rerun(pls_model, data = group2_data)
  group1_summary <- summary(group1_model)
  group2_summary <- summary(group2_model)
  group1_boot <- seminr::bootstrap_model(seminr_model = group1_model, nboot = nboot, ...)
  group2_boot <- seminr::bootstrap_model(seminr_model = group2_model, nboot = nboot, ...)

  path_entries <- mga_path_entries(pls_model, group1_model, group2_model, group1_boot, group2_boot)
  specific_indirect_entries <- mga_specific_indirect_entries(payload, group1_model, group2_model, group1_boot, group2_boot)
  group1_total_indirect <- seminr:::total_indirect_effects(group1_model$path_coef)
  group2_total_indirect <- seminr:::total_indirect_effects(group2_model$path_coef)
  group1_boot_total_indirect <- mga_boot_total_indirect_array(group1_boot)
  group2_boot_total_indirect <- mga_boot_total_indirect_array(group2_boot)
  total_indirect_entries <- mga_effect_matrix_entries(
    group1_total_indirect,
    group2_total_indirect,
    group1_boot_total_indirect,
    group2_boot_total_indirect
  )
  total_effect_entries <- mga_effect_matrix_entries(
    seminr:::total_effects(group1_model$path_coef),
    seminr:::total_effects(group2_model$path_coef),
    group1_boot$boot_total_paths,
    group2_boot$boot_total_paths
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
      groupA = mga_group_bootstrap_sections(payload, group1_data, group1_model, group1_boot),
      groupB = mga_group_bootstrap_sections(payload, group2_data, group2_model, group2_boot)
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

map_mga_response <- function(payload, data, mga_result, timings = NULL) {
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
        parametricTest = mga_result$pathCoefficients$parametricTest %||% list()
      ),
      specificIndirectEffects = list(
        biasCorrectedConfidenceIntervals = mga_result$specificIndirectEffects$biasCorrectedConfidenceIntervals %||% list(),
        henselerPlsMga = mga_result$specificIndirectEffects$henselerPlsMga %||% list(),
        parametricTest = mga_result$specificIndirectEffects$parametricTest %||% list()
      ),
      totalIndirectEffects = list(
        biasCorrectedConfidenceIntervals = mga_result$totalIndirectEffects$biasCorrectedConfidenceIntervals %||% list(),
        henselerPlsMga = mga_result$totalIndirectEffects$henselerPlsMga %||% list(),
        parametricTest = mga_result$totalIndirectEffects$parametricTest %||% list()
      ),
      totalEffects = list(
        biasCorrectedConfidenceIntervals = mga_result$totalEffects$biasCorrectedConfidenceIntervals %||% list(),
        henselerPlsMga = mga_result$totalEffects$henselerPlsMga %||% list(),
        parametricTest = mga_result$totalEffects$parametricTest %||% list()
      ),
      outerLoadings = list(
        biasCorrectedConfidenceIntervals = mga_result$outerLoadings$biasCorrectedConfidenceIntervals %||% list(),
        henselerPlsMga = mga_result$outerLoadings$henselerPlsMga %||% list(),
        parametricTest = mga_result$outerLoadings$parametricTest %||% list()
      ),
      outerWeights = list(
        biasCorrectedConfidenceIntervals = mga_result$outerWeights$biasCorrectedConfidenceIntervals %||% list(),
        henselerPlsMga = mga_result$outerWeights$henselerPlsMga %||% list(),
        parametricTest = mga_result$outerWeights$parametricTest %||% list()
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
      seed = payload$seed
    ),
    execution_log = execution_log,
    algorithm = list(
      settings = list(
        method = "MGA",
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
      engine = "seminr::bootstrap_model PLS-MGA",
      rows = nrow(data),
      columns = ncol(data),
      analysis_settings = list(
        mga = list(
          groupingVariable = payload$groupingVariable,
          groupA = payload$groupA,
          groupB = payload$groupB,
          nboot = payload$nboot,
          alpha = payload$alpha,
          seed = payload$seed
        )
      )
    )
  ))
}

pr$handle("POST", "/run-pls", function(req, res) {
  res$setHeader("Content-Type", "application/json")

  tryCatch({
    with_analysis_timeout_for({
      prepared <- prepare_payload(req)
      payload <- prepared$payload
      data <- prepared$data
      algorithm <- if (!is.null(payload$algorithm)) tolower(as.character(payload$algorithm)) else "standard"
      if (!(algorithm %in% c("standard", "consistent"))) algorithm <- "standard"
      algorithm_label <- if (algorithm == "consistent") "Consistent PLS (PLSc)" else "Standard PLS"
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

      nboot <- if (!is.null(payload$nboot)) as.integer(payload$nboot) else 500
      if (is.na(nboot) || nboot < 50) nboot <- 50
      confidence_level <- if (!is.null(payload$confidenceLevel)) as.character(payload$confidenceLevel) else "95%"
      alpha <- parse_confidence_level_alpha(confidence_level)
      core_plan <- analysis_core_plan()
      cores <- core_plan$cores

      boot_model <- time_phase(
        timings,
        "seminr bootstrap_model",
        seminr::bootstrap_model(core$model, nboot = nboot, cores = cores),
        details = list(
          nboot = nboot,
          cores = cores,
          detected_cores = core_plan$detected_cores,
          reserved_cores = core_plan$reserved_cores,
          core_policy = core_plan$policy
        )
      )
      boot_summary <- time_phase(timings, "summary boot_model", summary(boot_model, alpha = alpha))
      boot_summary$bootstrapped_paths <- time_phase(timings, "bias-corrected path intervals", add_bias_corrected_intervals(
        boot_summary$bootstrapped_paths,
        boot_model$path_coef,
        boot_model$boot_paths,
        alpha = alpha
      ))
      boot_summary$bootstrapped_loadings <- time_phase(timings, "bias-corrected loading intervals", add_bias_corrected_intervals(
        boot_summary$bootstrapped_loadings,
        boot_model$outer_loadings,
        boot_model$boot_loadings,
        alpha = alpha
      ))
      boot_summary$bootstrapped_weights <- time_phase(timings, "bias-corrected weight intervals", add_bias_corrected_intervals(
        boot_summary$bootstrapped_weights,
        boot_model$outer_weights,
        boot_model$boot_weights,
        alpha = alpha
      ))
      boot_summary$bootstrapped_total_paths <- time_phase(timings, "bias-corrected total-effect intervals", add_bias_corrected_intervals(
        boot_summary$bootstrapped_total_paths,
        seminr:::total_effects(boot_model$path_coef),
        boot_model$boot_total_paths,
        alpha = alpha
      ))
      response <- time_phase(timings, "assemble bootstrap response", assemble_bootstrap_response(
        payload,
        data,
        core,
        boot_model,
        boot_summary,
        nboot,
        confidence_level,
        algorithm,
        algorithm_label,
        alpha = alpha
      ))
      attach_timing_metadata(response, timings)
    }, bootstrap_timeout_seconds)
  }, error = function(err) {
    res$status <- 500
    analysis_error_response(err, "Bootstrap analysis", bootstrap_timeout_seconds)
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

      # seminr::predict_pls() has no published solution for two-stage higher-order
      # models and returns NULL for them. When the model has a HOC, build a
      # prediction-only core that represents each HOC with the repeated-indicators
      # approach so out-of-sample prediction can actually run.
      uses_hoc <- has_higher_order_construct(payload)
      predict_core <- core
      predict_note <- NULL
      if (uses_hoc) {
        predict_core <- time_phase(timings, "build prediction (repeated-indicators) model",
          run_pls_core(payload, data, for_prediction = TRUE))
        hoc_names <- vapply(
          Filter(function(con) isTRUE(con$is_higher_order), payload$constructs %||% list()),
          function(con) as.character(con$name), character(1), USE.NAMES = FALSE
        )
        predict_note <- sprintf(
          "PLSpredict used the repeated-indicators representation of higher-order construct(s) %s because seminr has no published method for predicting two-stage higher-order models.",
          paste(hoc_names, collapse = ", ")
        )
      }

      # Use defaults if not provided by the frontend
      folds <- if (!is.null(payload$folds)) as.integer(payload$folds) else 5
      reps <- if (!is.null(payload$repetitions)) as.integer(payload$repetitions) else 3
      if (is.na(folds) || folds < 2) folds <- 2
      if (is.na(reps) || reps < 1) reps <- 1
      if (folds > max_predict_folds) folds <- max_predict_folds
      if (reps > max_predict_repetitions) reps <- max_predict_repetitions

      # Execute ACTUAL k-fold out-of-sample prediction
      predict_model <- time_phase(timings, "seminr predict_pls", seminr::predict_pls(
        model = predict_core$model,
        technique = seminr::predict_DA,
        noFolds = folds,
        reps = reps
      ), details = list(folds = folds, repetitions = reps))

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
            settings = list(method = "PLSpredict (k-fold cross-validation)", mode = "PLS-SEM"),
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
          extract_plspredict_sections(payload, data, predict_core, predict_model, folds, reps, timings = timings)
        )
        if (!is.null(predict_note)) {
          results$algorithm$execution_log <- c(
            list(list(message = predict_note)),
            results$algorithm$execution_log %||% list()
          )
        }
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
      ensure_micom_loaded()
      prepared <- time_phase(timings, "prepare payload and read dataset", prepare_payload(req))
      payload <- prepared$payload
      data <- prepared$data
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
      ensure_micom_loaded()
      prepared <- time_phase(timings, "prepare payload and read dataset", prepare_payload(req))
      payload <- prepared$payload
      data <- prepared$data
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

      mga_core <- time_phase(timings, "estimate selected-group pls model", run_pls_core(payload, mga_data))
      mga_condition <- mga_group_condition(mga_data, payload$groupingVariable, payload$groupA)
      core_plan <- analysis_core_plan()
      cores <- core_plan$cores
      set.seed(payload$seed)

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
