# Test Bootstrap Interval Calculations, BCa, Tails, and Sign Changes
suppressPackageStartupMessages({
  library(seminr)
})

Sys.setenv(METIS_ALLOWED_DATA_ROOTS = getwd(), METIS_ANALYSIS_CORES = "1")

exprs <- parse("r-api/plumber.R")
env <- new.env(parent = globalenv())
for (i in seq_len(length(exprs) - 2L)) eval(exprs[[i]], envir = env)

cat("Running Bootstrap Confidence Interval Test Suite...\n")

# Test 1: calculate_bootstrap_ci function exists
stopifnot(!is.null(env$calculate_bootstrap_ci), is.function(env$calculate_bootstrap_ci))
cat("PASS: calculate_bootstrap_ci function is defined in plumber.R\n")

# Test 2: Calculate Percentile, BC, and BCa intervals on synthetic bootstrap distribution
set.seed(42)
true_val <- 0.5
boot_vals <- rnorm(1000, mean = 0.52, sd = 0.08) # slight positive bias

# Percentile CI
ci_perc <- env$calculate_bootstrap_ci(boot_vals, true_val, a = 0, ci_type = "Percentile", alpha = 0.05)
expected_perc <- as.numeric(quantile(boot_vals, probs = c(0.025, 0.975), type = 6))
stopifnot(isTRUE(all.equal(ci_perc, expected_perc, tolerance = 1e-6)))
cat("PASS: Percentile CI matches empirical quantiles\n")

# BC CI (Bias-Corrected, a = 0)
ci_bc <- env$calculate_bootstrap_ci(boot_vals, true_val, a = 0, ci_type = "BC", alpha = 0.05)
stopifnot(length(ci_bc) == 2, ci_bc[1] < ci_bc[2])
# Since mean(boot_vals < true_val) is ~0.40 (less than 0.5), z0 is negative, shifting quantiles downward
stopifnot(ci_bc[1] < ci_perc[1])
cat("PASS: BC CI shifts quantiles correctly for median bias\n")

# BCa CI (Bias-Corrected and Accelerated, a != 0)
ci_bca <- env$calculate_bootstrap_ci(boot_vals, true_val, a = 0.05, ci_type = "BCa", alpha = 0.05)
stopifnot(length(ci_bca) == 2, ci_bca[1] < ci_bca[2])
# Non-zero acceleration adjusts interval endpoints
stopifnot(!identical(ci_bca, ci_bc))
cat("PASS: BCa CI applies jackknife acceleration parameter\n")

# Test 3: One-tailed vs Two-tailed tests
ci_one_tail <- env$calculate_bootstrap_ci(boot_vals, true_val, a = 0, ci_type = "Percentile", alpha = 0.05, test_type = "one-tailed")
expected_one_tail <- as.numeric(quantile(boot_vals, probs = c(0.05, 0.95), type = 6))
stopifnot(isTRUE(all.equal(ci_one_tail, expected_one_tail, tolerance = 1e-6)))
cat("PASS: One-tailed test uses 5% and 95% critical thresholds\n")

# Test 4: Jackknife acceleration on SEMinR empirical model
data(mobi)
mm <- constructs(
  composite("Image", multi_items("IMAG", 1:5)),
  composite("Expectation", multi_items("CUEX", 1:3)),
  composite("Value", multi_items("PERV", 1:2))
)
sm <- relationships(
  paths(from = c("Image", "Expectation"), to = "Value")
)

pls_model <- estimate_pls(data = mobi, measurement_model = mm, structural_model = sm)
jack_acc <- env$compute_jackknife_acceleration(mobi, mm, sm, list(inner_weights = seminr::path_weighting, maxIt = 300, stopCriterion = 7, missing = seminr::mean_replacement))

stopifnot(!is.null(jack_acc$paths))
stopifnot(is.matrix(jack_acc$paths))
stopifnot(is.finite(jack_acc$paths["Image", "Value"]))
cat(sprintf("PASS: Jackknife acceleration computed successfully (a_Image->Value = %.6f)\n", jack_acc$paths["Image", "Value"]))

# Test 5: Sign-change corrections
boot_model <- bootstrap_model(pls_model, nboot = 100, cores = 1)
corrected_boot <- env$apply_sign_change_corrections(boot_model, pls_model, method = "construct")
stopifnot(!is.null(corrected_boot$boot_paths))
stopifnot(dim(corrected_boot$boot_paths) == dim(boot_model$boot_paths))
cat("PASS: Construct-level sign change correction executed cleanly\n")

cat("\nALL BOOTSTRAP INTERVAL TESTS PASSED!\n")
