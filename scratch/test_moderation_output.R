library(seminr)

data(mobi)

mobi_mm <- constructs(
  reflective("Image",        multi_items("IMAG", 1:5)),
  reflective("Expectation",  multi_items("CUEX", 1:3)),
  reflective("Satisfaction", multi_items("CUSA", 1:3)),
  interaction_term(iv = "Image", moderator = "Expectation", method = two_stage)
)

mobi_sm <- relationships(
  paths(from = "Image",        to = "Satisfaction"),
  paths(from = "Expectation",  to = "Satisfaction"),
  paths(from = "Image*Expectation", to = "Satisfaction")
)

mobi_pls <- estimate_pls(data = mobi, measurement_model = mobi_mm, structural_model = mobi_sm)

cat("=== PLS-SEM path_coef matrix ===\n")
print(mobi_pls$path_coef)

cat("\n=== PLS-SEM summary path_coefficients ===\n")
sum_pls <- summary(mobi_pls)
print(sum_pls$paths)

boot_pls <- bootstrap_model(mobi_pls, nboot = 50, cores = 1)
sum_boot <- summary(boot_pls)

cat("\n=== Bootstrap summary bootstrapped_paths ===\n")
print(sum_boot$bootstrapped_paths)
