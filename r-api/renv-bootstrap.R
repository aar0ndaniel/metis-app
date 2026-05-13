required_packages <- c("jsonlite", "Matrix", "plumber", "readxl", "seminr", "seminrExtras", "semPower")
github_required_packages <- c("seminrExtras")

args <- commandArgs(trailingOnly = FALSE)
file_arg <- grep("^--file=", args, value = TRUE)
script_dir <- if (length(file_arg)) {
  normalizePath(dirname(sub("^--file=", "", file_arg[[1]])), winslash = "/", mustWork = TRUE)
} else {
  normalizePath(getwd(), winslash = "/", mustWork = TRUE)
}

setwd(script_dir)

if (!requireNamespace("renv", quietly = TRUE)) {
  install.packages("renv", repos = "https://cloud.r-project.org")
}

renv_lock_path <- file.path(script_dir, "renv.lock")
using_renv <- file.exists(renv_lock_path)

if (using_renv) {
  renv::activate(project = script_dir)
}

installed <- rownames(installed.packages())
missing <- setdiff(setdiff(required_packages, github_required_packages), installed)
if (length(missing)) {
  install.packages(missing, repos = "https://cloud.r-project.org")
}

ensure_remotes <- function() {
  if (!requireNamespace("remotes", quietly = TRUE)) {
    install.packages("remotes", repos = "https://cloud.r-project.org")
  }
}

install_github_package <- function(package_name, specs) {
  ensure_remotes()

  installed_version <- tryCatch(as.character(utils::packageVersion(package_name)), error = function(...) NULL)
  if (!is.null(installed_version)) {
    message(sprintf("Updating %s from installed version %s using GitHub.", package_name, installed_version))
  }

  last_error <- NULL
  for (spec in specs) {
    repo <- spec$repo
    subdir <- spec$subdir
    message(sprintf("Trying GitHub install for %s from %s%s", package_name, repo, if (!is.null(subdir)) paste0(" (subdir=", subdir, ")") else ""))
    result <- tryCatch({
      remotes::install_github(
        repo,
        subdir = subdir,
        upgrade = "never",
        dependencies = TRUE,
        repos = "https://cloud.r-project.org"
      )
      TRUE
    }, error = function(err) {
      last_error <<- err
      FALSE
    })

    if (isTRUE(result) && requireNamespace(package_name, quietly = TRUE)) {
      return(invisible(TRUE))
    }
  }

  stop(sprintf(
    "Unable to install %s from GitHub. Last error: %s",
    package_name,
    if (!is.null(last_error)) conditionMessage(last_error) else "unknown error"
  ))
}

install_github_package(
  "seminrExtras",
  list(
    list(repo = "sem-in-r/seminrExtras", subdir = NULL),
    list(repo = "sem-in-r/seminr", subdir = "seminrExtras")
  )
)

if (using_renv) {
  renv::snapshot(project = script_dir, packages = required_packages, prompt = FALSE)
  cat("renv lockfile updated at:", renv_lock_path, "\n")
} else {
  cat("Installed packages into the active R library. renv.lock was not found, so no snapshot was written.\n")
}
