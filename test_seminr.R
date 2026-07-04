library(seminr)

data(mobi)

mobi_mm <- constructs(
  reflective("Image",        multi_items("IMAG", 1:5)),
  reflective("Expectation",  multi_items("CUEX", 1:3)),
  reflective("Value",        multi_items("PERV", 1:2)),
  reflective("Satisfaction", multi_items("CUSA", 1:3)),
  interaction_term(iv = "Image", moderator = "Expectation", method = two_stage)
)

mobi_sm <- relationships(
  paths(from = "Image",        to = c("Expectation", "Satisfaction")),
  paths(from = "Expectation",  to = c("Value", "Satisfaction")),
  paths(from = "Value",        to = c("Satisfaction")),
  paths(from = "Image*Expectation", to = c("Satisfaction"))
)

mobi_pls <- estimate_pls(data = mobi,
                         measurement_model = mobi_mm,
                         structural_model = mobi_sm)

print("path_coef rownames:")
print(rownames(mobi_pls$path_coef))

boot_pls <- bootstrap_model(mobi_pls, nboot = 100, cores = 1)
print("boot_paths dimnames:")
print(dimnames(boot_pls$boot_paths))

