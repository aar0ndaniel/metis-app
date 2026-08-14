Sys.setenv(METIS_ALLOWED_DATA_ROOTS = getwd(), METIS_ANALYSIS_CORES = "1")

exprs <- parse("r-api/plumber.R")
env <- new.env(parent = globalenv())
for (i in seq_len(length(exprs) - 2L)) eval(exprs[[i]], envir = env)

expected <- "MICOM is currently not available for models containing higher-order constructs. Run MICOM on a model without higher-order constructs."
hoc_payload <- list(constructs = list(list(name = "HOC", is_higher_order = TRUE)))
ordinary_payload <- list(constructs = list(list(name = "Image", is_higher_order = FALSE)))

message <- tryCatch({
  env$assert_micom_payload_supported(hoc_payload)
  ""
}, error = function(err) conditionMessage(err))

stopifnot(identical(message, expected))
stopifnot(isTRUE(env$assert_micom_payload_supported(ordinary_payload)))

cat("PASS MICOM HOC backend guard\n")
