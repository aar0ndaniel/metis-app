function stringField(error: unknown, key: string): string {
  if (!error || typeof error !== 'object') return ''
  const value = (error as Record<string, unknown>)[key]
  return typeof value === 'string' ? value.trim() : ''
}

function structuredField(error: unknown, key: string): string {
  if (!error || typeof error !== 'object') return ''
  const value = (error as Record<string, unknown>)[key]
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object') return normalizeErrorText(value)
  return ''
}

function normalizeErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/^:\s*/, '').trim()
  }
  if (error && typeof error === 'object') {
    const structuredMessage = structuredField(error, 'error') || structuredField(error, 'backendDetail') || structuredField(error, 'message')
    if (structuredMessage) return structuredMessage.replace(/^:\s*/, '').trim()
  }
  return String(error ?? '').replace(/^:\s*/, '').trim()
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text))
}

function packageName(raw: string): string {
  const match = raw.match(/Package ['"]?([A-Za-z0-9_.-]+)['"]?/i)
  return match?.[1] ?? 'the required package'
}

export function formatUserFriendlyAnalysisError(error: unknown): string {
  const userAction = stringField(error, 'userAction')
  if (userAction) return userAction

  const cleanedRaw = normalizeErrorText(error)
  const msg = cleanedRaw.toLowerCase()

  if (!cleanedRaw || /^unknown error$/i.test(cleanedRaw)) {
    return 'The model could not be calculated. Please check that all constructs have indicators, paths are connected, and the dataset is correctly imported.'
  }

  if (/dataset access is disabled/.test(msg)) {
    return 'Metis has not been told which workspace folders the analysis engine may read. Re-run setup or choose a workspace folder inside the Metis data location.'
  }

  if (/dataset path is outside trusted metis workspace directories/.test(msg)) {
    return 'The selected dataset is outside the folders Metis is allowed to analyze. Re-import the dataset into the current workspace.'
  }

  if (/dataset file exceeds/.test(msg)) {
    return 'This dataset is larger than the current Metis safety limit. Use a smaller dataset, filter rows or columns, or ask support to raise the limit.'
  }

  if (/unsupported dataset extension|unsupported dataset format|unsupported file type/.test(msg)) {
    return 'Metis can analyze CSV or Excel datasets only. Save the data as CSV, XLS, or XLSX and import it again.'
  }

  if (/dataset must be tabular|dataset must contain at least one row and one column|sheet appears empty/.test(msg)) {
    return 'The dataset is empty or could not be read as a table. Import a file with a header row and at least one data row.'
  }

  if (/dataset .*rows; the limit|dataset .*columns; the limit/.test(msg)) {
    return 'This dataset is larger than the current Metis row or column limit. Filter the dataset or raise the configured limit before running analysis.'
  }

  if (/dataset not found|no dataset|datasetpath is required|datasetpath cannot be empty|missing indicator columns|dataset is missing indicator columns|could not resolve the dataset file path/.test(msg)) {
    return 'Your dataset could not be found or does not match the indicators in the model. Please re-import the dataset and check indicator names.'
  }

  if (/construct.*has no indicators|no constructs with indicators|add at least one construct with indicators|constructs\[[0-9]+\]\.indicators must contain/.test(msg)) {
    return 'One or more constructs do not have indicators assigned. Please add indicators to every construct before running the model.'
  }

  if (/duplicate construct name/.test(msg)) {
    return 'Two constructs have the same name. Rename one construct so every construct has a unique name.'
  }

  if (/higher-order construct .* has no lower-order dimensions|dimensions cannot include the hoc itself|dimensions cannot reference another higher-order construct/.test(msg)) {
    return 'A higher-order construct is missing a valid lower-order construct link. Connect it to regular lower-order constructs before running analysis.'
  }

  if (/higher-order construct .* has no indicators to predict/.test(msg)) {
    return 'PLSpredict cannot use one higher-order construct because its lower-order constructs have no indicators. Add indicators to the lower-order constructs or remove the HOC from prediction.'
  }

  if (/paths\[[0-9]+\]\.(from|to) references unknown construct|interactions\[[0-9]+\]\.(iv|moderator|outcome) references unknown construct|dimensions references unknown construct/.test(msg)) {
    return 'One or more model paths point to a construct that no longer exists. Please delete and redraw the affected relationship.'
  }

  if (/no structural paths|at least one structural path|no valid structural paths|paths must contain at least/.test(msg)) {
    return 'No valid relationships were found between constructs. Please draw at least one arrow between constructs.'
  }

  if (/advanced analysis requires seminrextras/.test(msg)) {
    return 'Advanced analysis needs the seminrExtras R package. Install seminrExtras in the selected R runtime, then run Advanced analysis again.'
  }

  if (/cvpat skipped because the r backend does not have seminrextras|cvpat requires seminrextras|missing-seminrextras/.test(msg)) {
    return 'CVPAT needs the seminrExtras R package. Install seminrExtras, then rerun PLSpredict with CVPAT enabled.'
  }

  if (/selected target .* has no predecessors|target has no eligible predecessors/.test(msg)) {
    return 'The selected target has no incoming predictors. Choose a target with incoming paths, or add paths to the model.'
  }

  if (/targetconstruct is required|targetconstruct references unknown construct/.test(msg)) {
    return 'Choose a current target construct before running Advanced analysis.'
  }

  if (/select at least one advanced analysis/.test(msg)) {
    return 'Choose at least one advanced analysis to run: IPMA, NCA, or cIPMA.'
  }

  if (/nca run depth/.test(msg)) {
    return 'NCA run depth is outside the allowed range. Use a smaller run depth or stay within the configured limit.'
  }

  if (/plspredict could not be computed|seminr returned no prediction/.test(msg)) {
    return 'PLSpredict is not available for this model shape. Check the execution log, simplify unsupported model parts, or continue with PLS-SEM and Bootstrap.'
  }

  if (/folds must|repetitions must|cvpatenabled must/.test(msg)) {
    return 'PLSpredict settings are outside the allowed range. Reopen PLSpredict settings and choose valid folds, repetitions, and CVPAT options.'
  }

  if (/bootstrap analysis ran out of memory|bootstrap.*cannot allocate|bootstrap.*memory exhausted/.test(msg)) {
    return 'Bootstrap ran out of memory. Use fewer subsamples, close other heavy apps, or run it on a machine with more RAM.'
  }

  if (/plspredict analysis ran out of memory|advanced analysis ran out of memory|pls-sem analysis ran out of memory|cannot allocate vector|memory exhausted|cannot allocate memory/.test(msg)) {
    return 'The analysis ran out of memory. Use a smaller run, close other heavy apps, or run it on a machine with more RAM.'
  }

  if (/bootstrap subsamples/.test(msg)) {
    return 'Bootstrap subsamples must be within the current Metis limits. Use a whole number of at least 50, such as 500.'
  }

  if (/could not finish within|elapsed time limit/.test(msg)) {
    return 'The analysis took too long for this machine or these settings. Use fewer bootstrap subsamples or a smaller NCA run depth, close heavy apps, and run it again.'
  }

  if (/stopped responding|too heavy for the machine|could not finish receiving|could not complete.*request/.test(msg)) {
    return 'The analysis engine stopped responding during this run. Try fewer samples, close other heavy apps, or restart Metis and run it again.'
  }

  if (/backend unavailable|cannot reach local pls backend|failed to fetch|fetch failed|network/.test(msg)) {
    return 'Metis lost connection to the local analysis engine. Please restart Metis and try the analysis again.'
  }

  if (/metis backend is missing its local authentication token|forbidden/.test(msg)) {
    return 'Metis could not securely connect to its local analysis engine. Restart Metis and try again.'
  }

  if (/r runtime|rscript|plumber|bundled r|selected executable must be rscript|no rscript path was provided/.test(msg)) {
    return 'The R analysis engine is missing or failed to start. Run setup again, verify the selected Rscript path, then restart Metis.'
  }

  if (/package .*readxl.*required/.test(msg)) {
    return 'Metis cannot read Excel files because the R package readxl is missing. Install readxl or import the dataset as CSV.'
  }

  if (/package .*seminr.*not installed|package .*jsonlite.*required|package .*required/.test(msg)) {
    return `The R runtime is missing ${packageName(cleanedRaw)}. Run setup again or install the required R packages, then retry.`
  }

  if (/dgesv|exactly singular|singular matrix|computationally singular/.test(msg)) {
    return 'The model could not be estimated because the data or predictors are perfectly duplicated or collinear. Check duplicate indicators, constant columns, identical dataset columns, or predictors that move exactly together.'
  }

  if (hasAny(msg, [/must be a whole number/, /must be at least/, /must be between/, /above the current app limit/, /must be one of/])) {
    return 'One analysis setting is outside the allowed range. Reopen the settings dialog, choose a valid value, and run the analysis again.'
  }

  return `The model could not be calculated. Backend detail: ${cleanedRaw}`
}
