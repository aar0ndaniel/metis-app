library(seminr)

data(mobi)

mobi_mm <- constructs(
  reflective("Image",        multi_items("IMAG", 1:5)),
  reflective("Expectation",  multi_items("CUEX", 1:3)),
  reflective("Satisfaction", multi_items("CUSA", 1:3)),
  interaction_term(iv = "Image", moderator = "Expectation", method = two_stage)
)

mobi_sm <- relationships(
  paths(from = "Image",        to = c("Expectation", "Satisfaction")),
  paths(from = "Image*Expectation", to = c("Satisfaction"))
)

mobi_pls <- estimate_pls(data = mobi,
                         measurement_model = mobi_mm,
                         structural_model = mobi_sm)

summary_obj <- summary(mobi_pls)

print("SUCCESS")
