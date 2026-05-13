$repoRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $repoRoot 'scripts\gen_icon.py'

try {
    python $scriptPath
    if ($LASTEXITCODE -ne 0) {
        throw "Icon generation failed with exit code $LASTEXITCODE"
    }
} catch {
    Write-Error "Failed to generate icon: $_"
    exit 1
}
