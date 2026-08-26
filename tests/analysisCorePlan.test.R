Sys.setenv(METIS_ANALYSIS_CORES = "")
plumber_source <- readLines(file.path("r-api", "plumber.R"), warn = FALSE)
server_start <- grep('^message\\(sprintf\\("Starting metis Plumber', plumber_source)
stopifnot(length(server_start) == 1L)
eval(parse(text = plumber_source[seq_len(server_start[[1]] - 1L)]), envir = .GlobalEnv)

with_detected_cores <- function(detected_cores, callback) {
  parallel_namespace <- asNamespace("parallel")
  original_detect_cores <- get("detectCores", envir = parallel_namespace)
  unlockBinding("detectCores", parallel_namespace)
  assign("detectCores", function(logical = TRUE) as.integer(detected_cores), envir = parallel_namespace)
  lockBinding("detectCores", parallel_namespace)
  on.exit({
    unlockBinding("detectCores", parallel_namespace)
    assign("detectCores", original_detect_cores, envir = parallel_namespace)
    lockBinding("detectCores", parallel_namespace)
  }, add = TRUE)
  callback()
}

six_core_plan <- with_detected_cores(6L, analysis_core_plan)
stopifnot(
  identical(six_core_plan$cores, 5L),
  identical(six_core_plan$detected_cores, 6L),
  identical(six_core_plan$reserved_cores, 1L),
  identical(six_core_plan$policy, "dynamic-stepped-cap")
)

current_plan <- analysis_core_plan()
cat(sprintf(
  "PASS analysis core plan: simulated 6-core machine uses 5 workers and reserves 1; current machine uses %d of %d cores (%s)\n",
  current_plan$cores,
  current_plan$detected_cores,
  current_plan$policy
))
