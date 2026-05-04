<#
.SYNOPSIS
    Boots the Legendary Arena game server (and optionally the arena-client
    Vite dev server) for a manual smoke test.

.DESCRIPTION
    Clears any process-scope DATABASE_URL override before launch so that
    Node's --env-file=.env can supply the localhost binding. A persistent
    User-scope DATABASE_URL otherwise shadows the .env value (Node's
    --env-file is a fallback only — it never overrides existing process
    env vars).

    By default this script:
      1. Verifies .env exists at the repo root.
      2. Clears DATABASE_URL from the current process env.
      3. Spawns the arena-client Vite dev server in a new PowerShell window.
      4. Runs the boardgame.io server in this window (Ctrl+C to stop).

    Pass -ServerOnly to skip the Vite spawn (useful when you already have
    a Vite window open or want to run the dev server manually).

    Pass -KillStaleListeners to first reclaim ports 8000 and 5173-5176
    from zombie processes before starting (use sparingly — kills any
    process holding those ports without confirmation).

.EXAMPLE
    pwsh scripts/Start-SmokeTest.ps1

.EXAMPLE
    pwsh scripts/Start-SmokeTest.ps1 -ServerOnly

.EXAMPLE
    pwsh scripts/Start-SmokeTest.ps1 -KillStaleListeners
#>

[CmdletBinding()]
param(
    [switch] $ServerOnly,
    [switch] $KillStaleListeners
)

$ErrorActionPreference = 'Stop'

# Resolve repo root (this script lives at <repo>/scripts/Start-SmokeTest.ps1).
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

if (-not (Test-Path '.env')) {
    Write-Error ".env not found at $repoRoot. Copy .env.example and configure it before running this script."
    exit 1
}

if ($KillStaleListeners) {
    $stalePorts = @(8000, 5173, 5174, 5175, 5176)
    Write-Host "Killing stale listeners on $($stalePorts -join ', ')..." -ForegroundColor Yellow

    # why: per-port loop with explicit diagnostics so failures are visible.
    # The previous one-liner suppressed all errors with `-ErrorAction
    # SilentlyContinue`, which masked permission denials, missing PIDs,
    # and process-already-exited cases. Now each kill prints what it
    # found and what happened.
    $killedPids = New-Object 'System.Collections.Generic.HashSet[int]'
    foreach ($port in $stalePorts) {
        $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($null -eq $connections) {
            Write-Host "  port $port : free" -ForegroundColor DarkGray
            continue
        }
        foreach ($conn in @($connections)) {
            $procId = $conn.OwningProcess
            if ($procId -eq 0 -or $procId -eq 4) {
                # PID 0 = Idle, PID 4 = System; cannot kill, indicates
                # something deeper holding the port (rare).
                Write-Host "  port $port : held by SYSTEM PID $procId (cannot kill)" -ForegroundColor Red
                continue
            }
            if ($killedPids.Contains([int]$procId)) {
                Write-Host "  port $port : already killed PID $procId" -ForegroundColor DarkGray
                continue
            }
            try {
                $proc = Get-Process -Id $procId -ErrorAction Stop
                Write-Host "  port $port : killing PID $procId ($($proc.ProcessName))..." -ForegroundColor Yellow -NoNewline
                Stop-Process -Id $procId -Force -ErrorAction Stop
                $null = $killedPids.Add([int]$procId)
                Write-Host " ok" -ForegroundColor Green
            }
            catch {
                # Fall back to taskkill /F /PID — sometimes succeeds when
                # Stop-Process fails (e.g. cross-session ownership on some
                # Windows configurations).
                Write-Host " Stop-Process failed: $($_.Exception.Message)" -ForegroundColor Red
                Write-Host "  port $port : retrying via taskkill PID $procId..." -ForegroundColor Yellow -NoNewline
                $tkOutput = & taskkill /F /PID $procId 2>&1
                if ($LASTEXITCODE -eq 0) {
                    $null = $killedPids.Add([int]$procId)
                    Write-Host " ok (taskkill)" -ForegroundColor Green
                }
                else {
                    Write-Host " taskkill failed: $tkOutput" -ForegroundColor Red
                }
            }
        }
    }

    # why: 2-second wait gives Windows time to release LISTENING sockets
    # after process termination. The prior 500ms was occasionally too
    # short on slower systems, leaving the next bind to fail with
    # EADDRINUSE.
    Start-Sleep -Seconds 2

    # why: post-kill verification — re-check that the ports are actually
    # free. If any are still held, fail loudly so the user doesn't get a
    # confusing "Vite bumped to 5174" surprise downstream. The arena-
    # client server's CORS allowlist permits only http://localhost:5173;
    # a bumped port silently breaks every fetch from the browser.
    $stillHeld = @()
    foreach ($port in $stalePorts) {
        $check = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($null -ne $check) {
            $stillHeld += $port
        }
    }
    if ($stillHeld.Count -gt 0) {
        Write-Host ""
        Write-Host "WARNING: ports still held after kill: $($stillHeld -join ', ')" -ForegroundColor Red
        Write-Host "Inspect with: Get-NetTCPConnection -LocalPort $($stillHeld[0]) | Select-Object OwningProcess" -ForegroundColor DarkGray
        Write-Host "And:          Get-Process -Id <PID>" -ForegroundColor DarkGray
        Write-Host "If owned by a process you don't recognize (e.g. a stuck node from a crashed Vite), reboot if Stop-Process / taskkill won't release it." -ForegroundColor DarkGray
        Write-Host ""
    }
    else {
        Write-Host "  all ports verified free." -ForegroundColor Green
    }
}

# why: --env-file is fallback-only. A pre-set User-scope DATABASE_URL
# overrides the .env value, so Node tries to resolve the wrong host
# (e.g., a remote dev instance) instead of localhost. Clearing process
# scope here lets .env win for the spawned `node` process.
if ($env:DATABASE_URL) {
    Write-Host "Clearing process-scope DATABASE_URL override (so .env wins)" -ForegroundColor Yellow
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}

if (-not $ServerOnly) {
    Write-Host "Spawning arena-client Vite dev server in a new PowerShell window..." -ForegroundColor Cyan
    $viteCommand = "Set-Location '$repoRoot'; pnpm --filter '@legendary-arena/arena-client' dev"
    Start-Process powershell.exe -ArgumentList @('-NoExit', '-Command', $viteCommand) | Out-Null
    # Give the new window a moment to land before the server console starts
    # spamming startup output, so the URLs printed below remain visible.
    Start-Sleep -Milliseconds 750
}

Write-Host ""
Write-Host "=== Legendary Arena — Smoke Test ===" -ForegroundColor Cyan
Write-Host "  Server : http://localhost:8000  (health: /health)" -ForegroundColor Gray
Write-Host "  Client : http://localhost:5173  (Vite bumps to 5174+ if 5173 is held)" -ForegroundColor Gray
Write-Host "  Stop   : Ctrl+C in this window stops the server. Close the Vite window separately." -ForegroundColor Gray
Write-Host ""
Write-Host "Starting boardgame.io server..." -ForegroundColor Cyan

# why: --import points at tsx's loader.mjs entry because apps/server/src
# has TypeScript files (database.ts + .logic.ts / .types.ts / .routes.ts
# under auth/, leaderboards/, profile/, teams/) imported via the
# canonical .js-extension ESM convention; without a TS loader Node
# fails with ERR_MODULE_NOT_FOUND for db/database.js. The server's
# pnpm test script uses the same `--import tsx` pattern; this mirrors
# it for production startup. The render.yaml startCommand should adopt
# a similar flag if the server is deployed without a separate TS build.
#
# why: cwd stays at repo root (no `pnpm exec` chdir) because the
# server's loadRegistry() resolves `data/metadata` and `data/cards`
# relative to process.cwd(); chdir to apps/server/ would yield
# "0 sets, 0 heroes, 0 cards".
#
# why: absolute file:// URL to dist/loader.mjs — tsx is hoisted under
# apps/server/node_modules per pnpm strict hoisting (bare `tsx`
# specifier is not resolvable from the repo root), and ESM --import
# rejects directory paths (the package directory isn't a valid entry).
# Windows additionally requires file:// scheme; raw `C:\...` is rejected
# as an unsupported ESM URL scheme.
$tsxLoaderPath = (Join-Path $repoRoot 'apps/server/node_modules/tsx/dist/loader.mjs').Replace('\', '/')
$tsxLoaderUrl = "file:///$tsxLoaderPath"
node "--import=$tsxLoaderUrl" --env-file=.env apps/server/src/index.mjs
