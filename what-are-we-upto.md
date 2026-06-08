# What Are We Upto

## SEMinR 2.5.0 bundle update

- [x] Confirm the current bundled Windows runtime is behind the release: `seminr 2.4.2` is installed in `r-api/R-Portable`.
- [x] Add a bundle verifier guard so `R-Portable.zip` must contain `seminr 2.5.0` before a Bundle build can package it.
- [x] Refresh the extracted bundled runtime by installing `seminr 2.5.0` into `r-api/R-Portable/App/R-Portable/library`.
- [x] Rebuild `r-api/R-Portable.zip` from the refreshed extracted runtime with `node scripts/sync-r-portable-zip.mjs`.
- [x] Verify `Rscript.exe` can load `seminr`, `seminrExtras`, `plumber`, `semPower`, `readxl`, `jsonlite`, and `Matrix` after the refresh.

## Calculation coverage to check

- [x] Confirm Metis already passes moderation interactions from the canvas payload into the R backend.
- [x] Confirm the R backend already calls `seminr::predict_pls()` for PLSpredict.
- [x] Run runtime coverage for PLSpredict with Metis' current two-stage interaction model after the bundle refresh.
- [ ] Check whether the UI should expose non-two-stage interaction methods: `product_indicator`, `orthogonal`, and quadratic terms.
- [ ] If those methods become user-facing, extend the payload schema, validation, R measurement builder, and results metadata so the chosen method is explicit.
- [ ] Recheck PLSpredict result parsing for interaction models against `seminr 2.5.0` output shapes.

## Results view follow-up

- [ ] Confirm existing moderation result panels still render after SEMinR `2.5.0`.
- [ ] Confirm PLSpredict panels render rows for interaction models instead of falling back to empty-state messaging.
- [ ] Decide whether SEMinR plot confidence-level changes matter for Metis charts, since Metis currently renders its own React/SVG result charts.
- [ ] Review remaining `seminr:::` calls in `r-api/plumber.R` and migrate to the new public accessor API where practical.

## Release checklist

- [x] Run `node tests/rPortableBundle.test.mjs`.
- [x] Run `r-api/R-Portable/App/R-Portable/bin/Rscript.exe tests/rApiRuntimeSmoke.R` with the refreshed bundled runtime.
- [ ] Run `npm run typecheck` before packaging.
- [ ] Run `npm run build:bundle` once the refreshed runtime and zip are in place.
- [ ] Update release notes to mention SEMinR `2.5.0` once the bundle has been rebuilt and verified.
