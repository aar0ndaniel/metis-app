exprs <- parse("r-api/plumber.R")
env <- new.env(parent = globalenv())
for (i in seq_len(length(exprs) - 2L)) eval(exprs[[i]], envir = env)

comparison <- env$mga_parameter_comparison(
  list(
    identity = list(path = "A -> B"),
    estimate_a = 0.42,
    estimate_b = 0.18,
    boot_a = c(0.30, 0.40, 0.50, NA_real_, Inf),
    boot_b = c(0.10, 0.20, 0.25, 0.35)
  ),
  group_a_n = 31L,
  group_b_n = 47L
)

stopifnot(identical(comparison$label, "A -> B"))
stopifnot(identical(comparison$original_a, 0.42))
stopifnot(identical(comparison$original_b, 0.18))
stopifnot(identical(comparison$bootstrap_a, c(0.30, 0.40, 0.50)))
stopifnot(identical(comparison$bootstrap_b, c(0.10, 0.20, 0.25, 0.35)))
stopifnot(identical(comparison$n_a, 31))
stopifnot(identical(comparison$n_b, 47))

centered_a <- comparison$bootstrap_a - mean(comparison$bootstrap_a) + comparison$original_a
centered_b <- comparison$bootstrap_b - mean(comparison$bootstrap_b) + comparison$original_b
expected_henseler <- mean(outer(
  centered_b,
  centered_a,
  function(group_b, group_a) (1 + sign(group_b - group_a)) / 2
))
actual_henseler <- env$mga_pls_mga_p(comparison)
stopifnot(isTRUE(all.equal(actual_henseler, expected_henseler, tolerance = 1e-12)))

tied_comparison <- env$mga_parameter_comparison(
  list(
    identity = list(path = "Tie -> Test"),
    estimate_a = 0.5,
    estimate_b = 0.5,
    boot_a = c(0, 1),
    boot_b = c(0, 1)
  ),
  group_a_n = 20L,
  group_b_n = 20L
)
stopifnot(identical(env$mga_pls_mga_p(tied_comparison), 0.5))
stopifnot(!env$mga_pls_mga_significant(0.05, 0.05))
stopifnot(!env$mga_pls_mga_significant(0.95, 0.05))
stopifnot(env$mga_pls_mga_significant(0.0499, 0.05))
stopifnot(env$mga_pls_mga_significant(0.9501, 0.05))

se_a <- stats::sd(comparison$bootstrap_a)
se_b <- stats::sd(comparison$bootstrap_b)
expected_keil_se <- sqrt(
  ((comparison$n_a - 1)^2 / (comparison$n_a + comparison$n_b - 2)) * se_a^2 +
    ((comparison$n_b - 1)^2 / (comparison$n_a + comparison$n_b - 2)) * se_b^2
) * sqrt((1 / comparison$n_a) + (1 / comparison$n_b))
keil <- env$mga_parametric_stats(comparison, alpha = 0.05, welch = FALSE)
stopifnot(isTRUE(all.equal(keil$standard_error, expected_keil_se, tolerance = 1e-12)))
stopifnot(isTRUE(all.equal(keil$t_value, comparison$difference / expected_keil_se, tolerance = 1e-12)))
stopifnot(identical(keil$df, comparison$n_a + comparison$n_b - 2))

component_a <- ((comparison$n_a - 1) / comparison$n_a) * se_a^2
component_b <- ((comparison$n_b - 1) / comparison$n_b) * se_b^2
expected_welch_se <- sqrt(component_a + component_b)
expected_welch_df <- ((component_a + component_b)^2 /
  ((component_a^2 / (comparison$n_a - 1)) + (component_b^2 / (comparison$n_b - 1)))) - 2
welch <- env$mga_parametric_stats(comparison, alpha = 0.05, welch = TRUE)
stopifnot(isTRUE(all.equal(welch$standard_error, expected_welch_se, tolerance = 1e-12)))
stopifnot(isTRUE(all.equal(welch$t_value, comparison$difference / expected_welch_se, tolerance = 1e-12)))
stopifnot(isTRUE(all.equal(welch$df, expected_welch_df, tolerance = 1e-12)))

raw_mga_payload <- list(
  constructs = list(list(name = "HOC", isHigherOrder = TRUE)),
  algorithmSettings = list(hocMethod = "Two-stage", hocTwoStage = "Embedded"),
  groupingVariable = "Group",
  groupA = "A",
  groupB = "B",
  nboot = 50L,
  alpha = 0.05,
  seed = 123L
)
normalized_constructs <- list(list(name = "HOC", is_higher_order = TRUE))
validated <- env$validate_multi_group_analysis_payload(
  raw_mga_payload,
  construct_names = "HOC",
  data_columns = "Group",
  normalized_constructs = normalized_constructs
)
stopifnot(identical(validated$baseHocMethod, "Embedded Two-stage"))

validated_raw_fallback <- env$validate_multi_group_analysis_payload(
  raw_mga_payload,
  construct_names = "HOC",
  data_columns = "Group"
)
stopifnot(identical(validated_raw_fallback$baseHocMethod, "Embedded Two-stage"))

cat("PASS MGA statistical formulas and HOC metadata validation\n")
