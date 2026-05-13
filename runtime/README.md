# Bundled R runtime location

For local/dev bundled runtime testing, place portable R under one of these paths:

- `runtime/r-portable/bin/Rscript.exe`
- `runtime/r-portable/bin/x64/Rscript.exe`
- `runtime/r/bin/Rscript.exe`
- `runtime/r/bin/x64/Rscript.exe`

In packaged builds, Electron resolves the same layout from `process.resourcesPath`:

- `r-portable/bin/Rscript.exe`
- `r-portable/bin/x64/Rscript.exe`
- `r/bin/Rscript.exe`
- `r/bin/x64/Rscript.exe`

Override option:

- Set `METIS_RSCRIPT_PATH` to force a specific Rscript path.
