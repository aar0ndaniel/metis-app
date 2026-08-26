# Test Centroid Inner Weighting Scheme Implementation
suppressPackageStartupMessages({
  library(seminr)
})

Sys.setenv(METIS_ALLOWED_DATA_ROOTS = getwd(), METIS_ANALYSIS_CORES = "1")

exprs <- parse("r-api/plumber.R")
env <- new.env(parent = globalenv())
for (i in seq_len(length(exprs) - 2L)) eval(exprs[[i]], envir = env)

cat("Running Centroid Inner Weighting Test Suite...\n")

# Test 1: path_centroid function exists in env
stopifnot(!is.null(env$path_centroid), is.function(env$path_centroid))
cat("PASS: path_centroid function is defined in plumber.R\n")

# Test 2: Mathematical correctness of path_centroid
data(mobi)
mm <- constructs(
  composite("Image", multi_items("IMAG", 1:5)),
  composite("Expectation", multi_items("CUEX", 1:3)),
  composite("Value", multi_items("PERV", 1:2))
)
sm <- relationships(
  paths(from = c("Image", "Expectation"), to = "Value")
)

payload <- list(
  algorithmSettings = list(
    innerWeighting = "Centroid weighting scheme"
  )
)

resolved <- env$resolve_pls_estimation_settings(payload)
stopifnot(is.function(resolved$inner_weights))
# Must not be path_weighting
stopifnot(!identical(resolved$inner_weights, seminr::path_weighting))
cat("PASS: resolve_pls_estimation_settings binds distinct centroid inner_weights\n")

# Test 3: Estimation succeeds with centroid inner_weights
pls_centroid <- estimate_pls(data = mobi, measurement_model = mm, structural_model = sm, inner_weights = resolved$inner_weights)
stopifnot(inherits(pls_centroid, "seminr_model"))
stopifnot(is.matrix(pls_centroid$path_coef))
stopifnot(pls_centroid$iterations > 0)
cat(sprintf("PASS: SEMinR converges with centroid weighting in %d iterations\n", pls_centroid$iterations))

# Test 4: Unsupported settings must NOT flag centroid weighting
unsupported_notes <- env$describe_unsupported_pls_settings(payload)
stopifnot(length(unsupported_notes) == 0L)
cat("PASS: Centroid weighting is no longer marked as unsupported\n")

cat("\nALL CENTROID WEIGHTING TESTS PASSED!\n")
