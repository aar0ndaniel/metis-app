renv_activate <- file.path(getwd(), "renv", "activate.R")
renv_lock <- file.path(getwd(), "renv.lock")
if (file.exists(renv_activate) && file.exists(renv_lock)) {
  try(source(renv_activate, local = TRUE), silent = TRUE)
}
