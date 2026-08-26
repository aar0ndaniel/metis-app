Sys.setenv(METIS_ALLOWED_DATA_ROOTS = getwd(), METIS_ANALYSIS_CORES = "1")

exprs <- parse("r-api/plumber.R")
env <- new.env(parent = globalenv())
for (index in seq_len(length(exprs) - 2L)) eval(exprs[[index]], envir = env)

for (marker in c("NA", "Empty cells / NA", "-99", "999", "custom-missing")) {
  validated <- env$validate_algorithm_settings_payload(list(missingValue = marker))
  stopifnot(identical(validated$missingValue, marker))
}
cat("PASS: R request validation accepts built-in and custom missing markers\n")

numeric_marker_data <- data.frame(
  Indicator = c("1", "-99", "3"),
  Control = c("4", "5", "6"),
  stringsAsFactors = FALSE,
  check.names = FALSE
)
numeric_marker_result <- env$normalize_dataset_missing_values(numeric_marker_data, "-99")
stopifnot(is.numeric(numeric_marker_result$Indicator))
stopifnot(identical(which(is.na(numeric_marker_result$Indicator)), 2L))
stopifnot(identical(numeric_marker_result$Control, numeric_marker_data$Control))
cat("PASS: custom numeric markers become R NA without changing unrelated columns\n")

text_marker_data <- data.frame(
  Indicator = c("1", "CUSTOM-MISSING", "3"),
  stringsAsFactors = FALSE,
  check.names = FALSE
)
text_marker_result <- env$normalize_dataset_missing_values(text_marker_data, "custom-missing")
stopifnot(is.numeric(text_marker_result$Indicator))
stopifnot(identical(which(is.na(text_marker_result$Indicator)), 2L))
cat("PASS: custom text markers are matched case-insensitively and restore numeric columns\n")

default_marker_data <- data.frame(
  Indicator = c("1", "n/a", ".", "null", "3"),
  stringsAsFactors = FALSE,
  check.names = FALSE
)
default_marker_result <- env$normalize_dataset_missing_values(default_marker_data, "Empty cells / NA")
stopifnot(is.numeric(default_marker_result$Indicator))
stopifnot(identical(which(is.na(default_marker_result$Indicator)), 2:4))
cat("PASS: the Import Step 1 default marker maps supported tokens to R NA\n")

none_marker_result <- env$normalize_dataset_missing_values(numeric_marker_data, "None (all valid)")
stopifnot(identical(none_marker_result, numeric_marker_data))
cat("PASS: None (all valid) does not apply marker replacement\n")

dataset_path <- tempfile(pattern = "metis-missing-marker-", tmpdir = getwd(), fileext = ".csv")
on.exit(unlink(dataset_path), add = TRUE)
writeLines(c(
  "IndicatorA,IndicatorB",
  "1,4",
  "-99,5",
  "3,6"
), dataset_path, useBytes = TRUE)

payload <- list(
  datasetPath = dataset_path,
  constructs = list(
    list(name = "Construct A", type = "Reflective", indicators = list("IndicatorA")),
    list(name = "Construct B", type = "Reflective", indicators = list("IndicatorB"))
  ),
  paths = list(list(from = "Construct A", to = "Construct B")),
  interactions = list(),
  algorithm = "standard",
  algorithmSettings = list(
    missingData = "Mean replacement",
    missingValue = "-99"
  )
)
request <- new.env(parent = emptyenv())
request$postBody <- jsonlite::toJSON(payload, auto_unbox = TRUE)
prepared <- env$prepare_payload(request)

stopifnot(identical(prepared$payload$algorithmSettings$missingValue, "-99"))
stopifnot(is.numeric(prepared$data$IndicatorA))
stopifnot(identical(which(is.na(prepared$data$IndicatorA)), 2L))
stopifnot(is.na(env$resolve_pls_estimation_settings(prepared$payload)$missing_value))
cat("PASS: prepare_payload converts the selected marker while SEMinR keeps R NA internally\n")
