<#
.SYNOPSIS
    Safe commit helper for EC-mode development.

.DESCRIPTION
    Stages files and commits with EC-mode hook enforcement.
    Provides a guided commit flow with prefix selection and
    actionable error messages.

.PARAMETER Message
    The commit message. If omitted, you will be prompted interactively.

.PARAMETER All
    Stage all modified and deleted files before committing (git add -u).

.PARAMETER Files
    Specific files to stage before committing.

.EXAMPLE
    # Interactive mode
    pwsh scripts/git/ec-commit.ps1

    # With message
    pwsh scripts/git/ec-commit.ps1 -Message "EC-010: wire endIf to evaluateEndgame"

    # Stage all + commit
    pwsh scripts/git/ec-commit.ps1 -All -Message "INFRA: add EC commit hooks"

    # Stage specific files
    pwsh scripts/git/ec-commit.ps1 -Files "src/endgame/endgame.types.ts","src/endgame/endgame.evaluate.ts" -Message "EC-010: add endgame types and evaluator"

    # Dry-run (validate without committing)
    pwsh scripts/git/ec-commit.ps1 -Check -Message "EC-010: wire endIf to evaluateEndgame"
#>

param(
    [string]$Message,
    [switch]$All,
    [switch]$Check,
    [string[]]$Files
)

$ErrorActionPreference = 'Stop'

# Verify we are in a git repo
$repoRoot = git rev-parse --show-toplevel 2>$null
if (-not $repoRoot) {
    Write-Error "Not inside a Git repository."
    exit 1
}

# Verify hooks are installed
$hooksPath = git config core.hooksPath 2>$null
if ($hooksPath -notmatch '^\.githooks$') {
    Write-Host ""
    Write-Host "EC-mode hooks are not installed." -ForegroundColor Yellow
    Write-Host "Run: pwsh scripts/git/install-ec-hooks.ps1" -ForegroundColor Yellow
    Write-Host ""
    $install = Read-Host "Install now? (y/n)"
    if ($install -eq 'y') {
        & "$repoRoot/scripts/git/install-ec-hooks.ps1"
    } else {
        Write-Error "Cannot commit without EC-mode hooks. Install hooks first."
        exit 1
    }
}

# Stage files if requested
if ($All) {
    Write-Host "Staging all modified files..." -ForegroundColor Cyan
    git add -u
}

if ($Files) {
    Write-Host "Staging specified files..." -ForegroundColor Cyan
    foreach ($file in $Files) {
        git add $file
    }
}

# Show what will be committed
Write-Host ""
Write-Host "Staged changes:" -ForegroundColor Cyan
$staged = git diff --cached --name-only --diff-filter=ACMR
if (-not $staged) {
    Write-Host "  (no staged files)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Stage files first with: git add <files>" -ForegroundColor Yellow
    Write-Host "  or use: -All to stage all modified files" -ForegroundColor Yellow
    Write-Host "  or use: -Files 'file1','file2' to stage specific files" -ForegroundColor Yellow
    exit 1
}
$staged | ForEach-Object { Write-Host "  $_" }
Write-Host ""

# Determine if code files are staged
$hasCode = $staged | Where-Object { $_ -match '^(packages/|apps/)' }

# Get or prompt for message
if (-not $Message) {
    Write-Host "Commit message format:" -ForegroundColor Cyan
    if ($hasCode) {
        Write-Host "  EC-###: <summary>  (feature / gameplay code)" -ForegroundColor Green
        Write-Host "  INFRA: <summary>   (infra / hygiene under packages/ or apps/, per D-20801)" -ForegroundColor Green
    } else {
        Write-Host "  EC-###: <summary>  (execution work)" -ForegroundColor White
        Write-Host "  SPEC: <summary>    (specification fix)" -ForegroundColor White
        Write-Host "  INFRA: <summary>   (infrastructure)" -ForegroundColor White
    }
    Write-Host ""
    $Message = Read-Host "Enter commit message"

    if (-not $Message) {
        Write-Error "Empty commit message. Aborting."
        exit 1
    }
}

# Dry-run mode: validate via hook without committing
if ($Check) {
    Write-Host ""
    Write-Host "DRY RUN — validating commit message..." -ForegroundColor Cyan
    Write-Host "Staged files:" -ForegroundColor DarkGray
    git diff --cached --name-only | ForEach-Object {
        Write-Host "  $_" -ForegroundColor DarkGray
    }
    Write-Host ""
    $tempFile = [System.IO.Path]::GetTempFileName()
    Set-Content -Path $tempFile -Value $Message
    $hookPath = Join-Path $repoRoot '.githooks/commit-msg'
    $bash = Get-Command bash -ErrorAction SilentlyContinue
    if (-not $bash) {
        Remove-Item $tempFile -ErrorAction SilentlyContinue
        Write-Error "bash not found. Dry-run requires Git Bash or WSL."
        exit 1
    }
    & $bash.Source $hookPath $tempFile 2>&1
    $hookExit = $LASTEXITCODE
    Remove-Item $tempFile -ErrorAction SilentlyContinue

    if ($hookExit -eq 0) {
        Write-Host "Validation passed. This message would be accepted." -ForegroundColor Green
    } else {
        Write-Host "Validation failed. See errors above." -ForegroundColor Red
    }
    exit $hookExit
}

# Attempt the commit — hooks will enforce rules
Write-Host ""
Write-Host "Committing..." -ForegroundColor Cyan
try {
    git commit -m "$Message"
    Write-Host ""
    Write-Host "Commit successful." -ForegroundColor Green
    git log --oneline -1
} catch {
    Write-Host ""
    Write-Host "Commit failed. See hook output above for details." -ForegroundColor Red
    Write-Host ""
    Write-Host "Common fixes:" -ForegroundColor Yellow
    Write-Host "  - Missing EC prefix: use 'EC-###: <summary>'" -ForegroundColor Yellow
    Write-Host "  - Forbidden word: remove WIP, misc, tmp, etc." -ForegroundColor Yellow
    Write-Host "  - EC not found: check docs/ai/execution-checklists/" -ForegroundColor Yellow
    Write-Host "  - Subject too short: be more specific (>= 12 chars after prefix)" -ForegroundColor Yellow
    exit 1
}
