# Cross-platform release checklist

Metis ships two editions on each platform:

- Lite: smaller app package; users provide an existing R 4.0+ install.
- Bundle: larger app package; Metis includes a platform-specific R runtime archive.

## Required R archives

Bundle builds are blocked unless the correct runtime archive exists in `r-api/`.

| Platform | Archive | Required Rscript entry |
| --- | --- | --- |
| Windows | `R-Portable.zip` | `R-Portable/App/R-Portable/bin/Rscript.exe` |
| macOS | `R-macos.tar.gz` | `R-Bundled/bin/Rscript` |
| Linux | `R-linux.tar.gz` | `R-Bundled/bin/Rscript` |

macOS and Linux archives must also include `R-Bundled/bin/conda-unpack`. They are conda-packed tarballs so Unix executable bits and symlinks survive extraction.

macOS Bundle runtime builds pin conda-forge `libblas=*=*_newaccelerate` so bundled R routes BLAS/LAPACK through Apple's Accelerate framework on both Apple Silicon and Intel macOS runners. Because conda-forge newaccelerate targets macOS 13.3+, the Bundle DMG/zip also declares macOS 13.3 as its minimum system version. Windows Bundle uses the bundled `Rblas.dll` implementation inside `R-Portable.zip`.

Validate an archive before packaging:

```powershell
node scripts/verify-r-bundle-archive.mjs win32
node scripts/verify-r-bundle-archive.mjs darwin
node scripts/verify-r-bundle-archive.mjs linux
```

Do not reuse `R-Portable.zip` for macOS or Linux. R binaries and compiled packages are platform-specific.

## Installer experience

Windows uses the NSIS setup window and may offer a desktop shortcut. Bundle setup extracts the bundled runtime; Lite setup detects or asks for `Rscript.exe`.

macOS ships as a DMG plus zip. The DMG install step is the normal drag-to-Applications action. After the user launches Metis from Applications, the same in-app setup flow opens: choose a workspace folder, then Bundle extracts `R-macos.tar.gz` to the user's app data folder and Lite detects or asks for `Rscript`.

Linux ships as AppImage plus deb. Users either run the AppImage directly or install the deb through their package manager. After launch, the same in-app setup flow opens: choose a workspace folder, then Bundle extracts `R-linux.tar.gz` to the user's app data folder and Lite detects or asks for `Rscript`.

## Build commands

```powershell
npm run build:lite:win
npm run build:bundle:win
npm run build:lite:mac
npm run build:bundle:mac
npm run build:lite:linux
npm run build:bundle:linux
```

Build macOS release artifacts on macOS and Linux release artifacts on Linux/CI. The Bundle commands verify the platform-specific R archive before electron-builder runs.
