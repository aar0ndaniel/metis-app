library(seminr)

mobi <- mobi
# Create some constructs
measurements <- constructs(
  composite("Image",        multi_items("IMAG", 1:5)),
  composite("Expectation",  multi_items("CUEX", 1:3)),
  composite("Value",        multi_items("PERV", 1:2)),
  interaction_term(iv = "Image", moderator = "Expectation", method = orthogonal)
)

# Test with "*" 
tryCatch({
  struc <- relationships(
    paths(from = c("Image", "Expectation", "Image*Expectation"), to = "Value")
  )
  print("Success with *")
  print(struc)
}, error = function(e) {
  print(paste("Error with *:", e$message))
})

# Test with "_x_"
tryCatch({
  struc <- relationships(
    paths(from = c("Image", "Expectation", "Image_x_Expectation"), to = "Value")
  )
  print("Success with _x_")
  print(struc)
}, error = function(e) {
  print(paste("Error with _x_:", e$message))
})

# Estimate to see what the path coefficient row names are
struc <- relationships(
  paths(from = c("Image", "Expectation", "Image_x_Expectation"), to = "Value")
)
model <- estimate_pls(data = mobi, measurement_model = measurements, structural_model = struc)
print(rownames(model$path_coef))
