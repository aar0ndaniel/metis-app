# Metis

A free desktop workspace for PLS-SEM models, powered by [seminr](https://github.com/sem-in-r/seminr).

Metis lets researchers build, estimate, and report partial least squares structural equation models without writing R code. Draw your model on a visual canvas, run the analysis locally, and export publication-ready tables.

**Website:** [metis.emend.it.com](https://metis.emend.it.com) · **Latest release:** [0.3.1](https://github.com/aar0ndaniel/metis-app/releases/latest) · **License:** GPL-3.0

## Features

- **Visual model canvas.** Build constructs and structural paths, with coefficients and outputs shown on the diagram.
- **PLS-SEM estimation.** Bootstrapping with configurable subsamples, weighting schemes, and iterations.
- **Advanced analyses.** PLSpredict, CVPAT, IPMA, cIPMA, Necessary Condition Analysis (NCA), MICOM (three-step measurement invariance), and multigroup analysis (Henseler's and parametric tests).
- **Higher-order constructs.** Two-stage workflows for higher-order models.
- **Moderation.** Interaction terms passed from the canvas into the estimation.
- **Tark reporting assistant.** Turns saved results into APA 7 tables and exports them to Word.
- **Missing data tools.** Configurable missing-value markers and an interactive missing-value finder.
- **Single-file workspaces.** Save a whole project as one `.metisws` file.

## Privacy

All datasets and calculations stay on your machine. Metis runs its analysis engine locally and needs no cloud account. An optional, one-time anonymous install ping can be enabled during setup; see [TELEMETRY.md](TELEMETRY.md) for exactly what it sends.

## Download

Get the installers from the [releases page](https://github.com/aar0ndaniel/metis-app/releases/latest).

| Installer | Size | Use it when |
|---|---|---|
| **Bundle** | ~283 MB | You want everything included. It ships its own R runtime and works offline. Recommended for most users. |
| **Lite** | ~78 MB | You already have R installed and want a smaller download. |

Both are available for Windows (`.exe`) and macOS on Apple silicon (`arm64`) and Intel (`x64`) (`.dmg`).

## Build from source

Requirements: Node.js and npm. The Lite build also needs a local R installation.

```bash
npm install
npm run dev
```

| Command | Purpose |
|---|---|
| `npm run typecheck` | TypeScript type check |
| `npm run build` | Full desktop release |
| `npm run build:bundle` | Bundled Windows release with R runtime |
| `npm run build:lite` | Lite desktop release |
| `npm run audit:high` | Audit production dependencies for high-severity issues |

Tests are Node scripts in `tests/`. Run one with `node tests/<name>.test.mjs`.

## Project layout

- `src/` – React and TypeScript app (pages, components, hooks, utilities)
- `electron/` – Electron main and preload processes
- `r-api/` – R analysis API built on seminr
- `scripts/` – build, release, and runtime packaging scripts
- `tests/` – static and behavioral tests

## How to cite

> Metis. (2026). *Metis: Free PLS-SEM desktop software for academic researchers* (Version 0.3.1) [Computer software]. https://metis.emend.it.com

Please also cite seminr, which performs the underlying estimation.

## Support

Report bugs and request features through [GitHub issues](https://github.com/aar0ndaniel/metis-app/issues). For institutional or funding enquiries, email metis@emend.it.com.

## License

Metis is free software under the [GNU General Public License v3.0](LICENSE). It is built by [emend.it](https://metis.emend.it.com) and started with feedback from researchers at KNUST.
