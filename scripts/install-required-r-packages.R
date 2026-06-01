repos <- "https://cloud.r-project.org"
required_packages <- c("jsonlite", "Matrix", "plumber", "readxl", "seminr", "seminrExtras", "semPower")
cran_dependencies <- c("Depends", "Imports", "LinkingTo")
max_attempts <- 3
ncpus <- suppressWarnings(as.integer(Sys.getenv("METIS_R_INSTALL_NCPUS", "2")))
if (is.na(ncpus) || ncpus < 1L) ncpus <- 2L

missing_packages <- function() {
  required_packages[!vapply(required_packages, requireNamespace, logical(1), quietly = TRUE)]
}

install_cran_packages <- function(packages) {
  packages <- setdiff(packages, "seminrExtras")
  if (!length(packages)) return(invisible(NULL))

  message("Installing required CRAN packages: ", paste(packages, collapse = ", "))
  install.packages(
    packages,
    repos = repos,
    dependencies = c("Depends", "Imports", "LinkingTo"),
    Ncpus = ncpus
  )
}

install_seminr_extras <- function() {
  if (!requireNamespace("remotes", quietly = TRUE)) {
    install.packages(
      "remotes",
      repos = repos,
      dependencies = cran_dependencies,
      Ncpus = ncpus
    )
  }

  result <- try(remotes::install_github(
    "sem-in-r/seminrExtras",
    dependencies = cran_dependencies
  ), silent = TRUE)

  if (!requireNamespace("seminrExtras", quietly = TRUE)) {
    if (inherits(result, "try-error")) {
      message("seminrExtras direct install failed; trying repository subdir fallback.")
    }
    remotes::install_github(
      "sem-in-r/seminr",
      subdir = "seminrExtras",
      dependencies = cran_dependencies
    )
  }
}

for (attempt in seq_len(max_attempts)) {
  missing <- missing_packages()
  if (!length(missing)) break

  message(sprintf(
    "R package install attempt %s/%s. Missing: %s",
    attempt,
    max_attempts,
    paste(missing, collapse = ", ")
  ))

  install_cran_packages(missing)
  if ("seminrExtras" %in% missing) install_seminr_extras()
}

missing <- missing_packages()
if (length(missing)) {
  stop("Missing required R packages after install attempts: ", paste(missing, collapse = ", "))
}

message("Verified required R packages: ", paste(required_packages, collapse = ", "))
