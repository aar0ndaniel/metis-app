suppressPackageStartupMessages(library(plumber))

host <- Sys.getenv("METIS_PLUMBER_HOST", "127.0.0.1")
port <- as.integer(Sys.getenv("METIS_PLUMBER_PORT", "8765"))
metis_token <- Sys.getenv("METIS_PLUMBER_TOKEN", "")
trusted_metis_dataset_roots_raw <- Sys.getenv("METIS_ALLOWED_DATA_ROOTS", "")
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

pr <- plumber$new()

`%||%` <- function(x, y) if (is.null(x)) y else x

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
    reserve <- if (detected <= 4L) {
      1L
    } else if (detected <= 16L) {
      2L
    } else {
      4L
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

trusted_metis_dataset_roots <- {
  if (!nzchar(trimws(trusted_metis_dataset_roots_raw))) {
    character(0)
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
    return(list(success = FALSE, error = message))
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
  message
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

    indicators <- unique(require_string_array(
      construct$indicators,
      sprintf("constructs[%s].indicators", idx),
      min_len = 1L,
      max_len = max_indicators_per_construct,
      max_chars = 120
    ))

    if (tolower(con_name) %in% tolower(seen_names)) {
      stop(sprintf("Duplicate construct name: %s", con_name))
    }
    seen_names <- c(seen_names, con_name)

    normalized[[idx]] <- list(
      name = con_name,
      type = if (identical(con_type, "formative")) "Formative" else "Reflective",
      indicators = as.list(indicators)
    )
  }

  normalized
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

validate_payload_object <- function(payload) {
  if (!is.list(payload) || is.null(names(payload))) {
    stop("Request body must be a JSON object.")
  }

  dataset_path <- require_scalar_string(payload$datasetPath, "datasetPath", max_chars = 1000)
  constructs <- validate_constructs_payload(payload$constructs)
  construct_names <- vapply(constructs, function(con) con$name, character(1), USE.NAMES = FALSE)
  paths <- validate_paths_payload(payload$paths, construct_names)
  interactions <- validate_interactions_payload(payload$interactions %||% list(), construct_names)
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

build_measurement <- function(constructs_payload, algorithm = "standard", interactions_payload = list()) {
  algorithm <- tolower(as.character(algorithm))
  if (!(algorithm %in% c("standard", "consistent"))) {
    algorithm <- "standard"
  }

  defs <- lapply(constructs_payload, function(con) {
    con_name <- as.character(con$name)
    con_type <- tolower(as.character(con$type))
    items <- unlist(lapply(con$indicators, function(it) as.character(it)), use.names = FALSE)
    items <- items[!is.na(items) & nzchar(items)]

    if (!length(items)) {
      stop(sprintf("Construct '%s' has no indicators.", con_name))
    }

    if (con_type == "formative") {
      seminr::composite(con_name, items)
    } else {
      if (algorithm == "consistent") {
        seminr::reflective(con_name, items)
      } else {
        seminr::composite(con_name, items, weights = seminr::mode_A)
      }
    }
  })

  interaction_defs <- lapply(interactions_payload %||% list(), function(interaction) {
    iv <- as.character(interaction$iv %||% interaction$from %||% "")
    moderator <- as.character(interaction$moderator %||% "")
    if (!nzchar(iv) || !nzchar(moderator)) return(NULL)

    seminr::interaction_term(
      iv = iv,
      moderator = moderator,
      method = seminr::two_stage
    )
  })

  interaction_defs <- Filter(Negate(is.null), interaction_defs)
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

  payload <- validate_payload_object(jsonlite::fromJSON(request_body, simplifyVector = FALSE))
  dataset_path <- as.character(payload$datasetPath)
  data <- read_dataset(dataset_path)

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

run_pls_core <- function(payload, data) {
  algorithm <- if (!is.null(payload$algorithm)) as.character(payload$algorithm) else "standard"
  measurement_model <- build_measurement(
    payload$constructs,
    algorithm = algorithm,
    interactions_payload = payload$interactions %||% list()
  )
  structural_model <- build_structural(payload$paths)

  model <- seminr::estimate_pls(
    data = data,
    measurement_model = measurement_model,
    structural_model = structural_model
  )

  summary_obj <- summary(model)
  list(model = model, summary = summary_obj)
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
            product <- product * suppressWarnings(as.numeric(boot_model$boot_paths[from_node, to_node, k]))
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

compute_vif_from_data <- function(payload, data) {
  if (is.null(data) || !nrow(data)) return(list())

  raw_df <- to_numeric_frame(as.data.frame(data))

  construct_defs <- payload$constructs %||% list()
  construct_scores <- list()
  for (con in construct_defs) {
    con_name <- as.character(con$name %||% "")
    if (!nzchar(con_name)) next
    indicators <- unique(unlist(lapply(con$indicators, as.character), use.names = FALSE))
    indicators <- indicators[indicators %in% names(raw_df)]
    if (!length(indicators)) next

    if (length(indicators) == 1) {
      construct_scores[[con_name]] <- suppressWarnings(as.numeric(raw_df[[indicators[1]]]))
    } else {
      sub_df <- raw_df[, indicators, drop = FALSE]
      construct_scores[[con_name]] <- suppressWarnings(rowMeans(sub_df, na.rm = TRUE))
    }
  }

  score_df <- as.data.frame(construct_scores, stringsAsFactors = FALSE)
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
      residuals = extract_construct_residuals(summary_obj, model)
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

normalize_bottleneck_rows <- function(summary_obj, method_keys = c("ce_fdh", "cr_fdh")) {
  bottleneck <- summary_obj$bottleneck %||% list()
  rows <- list()
  for (method_key in method_keys) {
    method_rows <- as_rows(bottleneck[[method_key]])
    if (!length(method_rows)) next
    for (row in method_rows) {
      rows[[length(rows) + 1L]] <- c(
        list(Method = nca_method_label(method_key), Ceiling = method_key),
        row
      )
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

  if (isTRUE(analyses$ipma)) {
    ipma_result <- timed_or_direct(timings, "advanced assess_ipma", seminrExtras::assess_ipma(
      seminr_model = core$model,
      target = target_construct,
      scale_min = 1,
      scale_max = 7,
      seed = 123
    ))
    ipma_summary <- timed_or_direct(timings, "advanced summary ipma", summary(ipma_result))
    append_log(sprintf("IPMA completed for target '%s'.", target_construct))
  }

  if (isTRUE(analyses$nca) && !isTRUE(analyses$cipma)) {
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
  }

  if (isTRUE(analyses$cipma)) {
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
    normalize_bottleneck_rows(bottleneck_source)
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
    list(
      success = FALSE,
      error = format_analysis_error_message(err, "PLS-SEM analysis", analysis_timeout_seconds)
    )
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
    list(success = FALSE, error = format_analysis_error_message(err, "Bootstrap analysis", bootstrap_timeout_seconds))
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

      # Use defaults if not provided by the frontend
      folds <- if (!is.null(payload$folds)) as.integer(payload$folds) else 5
      reps <- if (!is.null(payload$repetitions)) as.integer(payload$repetitions) else 3
      if (is.na(folds) || folds < 2) folds <- 2
      if (is.na(reps) || reps < 1) reps <- 1
      if (folds > max_predict_folds) folds <- max_predict_folds
      if (reps > max_predict_repetitions) reps <- max_predict_repetitions

      # Execute ACTUAL k-fold out-of-sample prediction
      predict_model <- time_phase(timings, "seminr predict_pls", seminr::predict_pls(
        model = core$model,
        technique = seminr::predict_DA,
        noFolds = folds,
        reps = reps
      ), details = list(folds = folds, repetitions = reps))

      # Note: We are passing predict_model instead of pred_summary now!
      results <- time_phase(
        timings,
        "extract plspredict response sections",
        extract_plspredict_sections(payload, data, core, predict_model, folds, reps, timings = timings)
      )
      attach_timing_metadata(list(success = TRUE, results = results), timings)
    }, plspredict_timeout_seconds)
  }, error = function(err) {
    res$status <- 500
    list(success = FALSE, error = format_analysis_error_message(err, "PLSpredict analysis", plspredict_timeout_seconds))
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
      core <- time_phase(timings, "get cached/base pls model", get_cached_pls_core(payload, data))

      results <- time_phase(timings, "run advanced response sections", run_advanced_sections(payload, data, core, timings = timings))
      attach_timing_metadata(list(success = TRUE, results = results), timings)
    }, advanced_analysis_timeout_seconds)
  }, error = function(err) {
    res$status <- 500
    list(success = FALSE, error = format_analysis_error_message(err, "Advanced analysis", advanced_analysis_timeout_seconds))
  })
})

message(sprintf("Starting metis Plumber on %s:%s", host, port))
pr$run(host = host, port = port)
