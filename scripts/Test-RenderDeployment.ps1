<#
.SYNOPSIS
    Tests the deployed Legendary Arena Render service against its catalogued
    HTTP API surface to verify the production deployment is healthy.

.DESCRIPTION
    Probes the public endpoints listed in docs/ai/REFERENCE/api-endpoints.md
    that don't require an authenticated Hanko session, plus an auth-gate probe
    on a protected endpoint to verify session validation is wired and active.

    Reports HTTP status, response time, and basic body shape for each probe.
    Exits 0 when all probes pass; exits 1 when one or more fail.

    Also probes the Cloudflare-fronted asset domain (data.barefootbetters.com)
    so the smoke test covers the full asset pipeline the production server
    depends on at startup.

    Cold-start aware: the first /health probe uses a generous 60-second timeout
    to accommodate Render starter-tier services waking from sleep. Subsequent
    probes use a shorter 10-second timeout assuming the service is now warm.

    This script is read-only — it never POSTs state-changing requests, never
    creates resources, never authenticates. It is safe to run against
    production at any time and its output reveals no secrets.

.PARAMETER BaseUrl
    Origin of the deployed server. Defaults to the production Render URL.
    Override for staging or local dev (e.g., http://localhost:8000).

.PARAMETER IncludeWebhookProbe
    If set, probes POST /api/billing/webhook/stripe with a deliberately
    bad signature and expects 400. Disabled by default because the exact
    failure-status surface depends on which Stripe SDK error path the
    server takes for malformed payloads.

.EXAMPLE
    pwsh scripts/Test-RenderDeployment.ps1

.EXAMPLE
    pwsh scripts/Test-RenderDeployment.ps1 -BaseUrl http://localhost:8000

.EXAMPLE
    pwsh scripts/Test-RenderDeployment.ps1 -IncludeWebhookProbe
#>

[CmdletBinding()]
param(
    [string] $BaseUrl = 'https://legendary-arena-server.onrender.com',
    [switch] $IncludeWebhookProbe
)

$ErrorActionPreference = 'Stop'

# why: an explicit User-Agent matches the lasting fix applied to
# scripts/check-connections.mjs. Cloudflare bot detection blocks generic
# curl/* and bare 'node' UAs across the barefootbetters.com zone. Identifying
# our tooling explicitly avoids that block and makes our traffic legible
# in Cloudflare logs.
$script:UserAgent = 'legendary-arena-smoke-test/1.0'

# why: Render starter-tier services sleep after roughly 15 minutes of
# inactivity. The first request can take 20-50 seconds to wake. A generous
# initial timeout prevents false failures on a sleeping deployment.
$script:ColdStartTimeoutSec = 60
$script:WarmRequestTimeoutSec = 10

# Strip any trailing slash from BaseUrl so probe paths concatenate cleanly.
$BaseUrl = $BaseUrl.TrimEnd('/')

# ---------------------------------------------------------------------------
# Probe definitions
# ---------------------------------------------------------------------------

# Asset-domain probes — exercise the full pipeline the server depends on
# at startup (the registry HTTP loader fetches metadata/sets.json on boot).
$assetProbes = @(
    @{
        Name           = 'R2 metadata (data.barefootbetters.com/metadata/sets.json)'
        Url            = 'https://data.barefootbetters.com/metadata/sets.json'
        Method         = 'GET'
        ExpectStatus   = 200
        ExpectContains = '"abbr"'
    }
)

# Server endpoint probes — every entry corresponds to a row in
# docs/ai/REFERENCE/api-endpoints.md. Guest endpoints expect 200; the
# auth-gate probe expects 401, which verifies session middleware is wired
# and rejecting unauthenticated requests on protected routes.
$serverProbes = @(
    @{
        Name           = 'health endpoint (GET /health)'
        Path           = '/health'
        Method         = 'GET'
        ExpectStatus   = 200
        ExpectContains = '"status":"ok"'
        TimeoutSec     = $script:ColdStartTimeoutSec
    }
    @{
        Name           = 'leaderboards scenarios (GET /api/leaderboards/scenarios)'
        Path           = '/api/leaderboards/scenarios'
        Method         = 'GET'
        ExpectStatus   = 200
        TimeoutSec     = $script:WarmRequestTimeoutSec
    }
    @{
        Name           = 'profile auth gate (GET /api/me/profile)'
        Path           = '/api/me/profile'
        Method         = 'GET'
        ExpectStatus   = 401
        TimeoutSec     = $script:WarmRequestTimeoutSec
    }
    @{
        Name           = 'entitlements auth gate (GET /api/me/entitlements)'
        Path           = '/api/me/entitlements'
        Method         = 'GET'
        ExpectStatus   = 401
        TimeoutSec     = $script:WarmRequestTimeoutSec
    }
)

if ($IncludeWebhookProbe) {
    $serverProbes += @{
        Name           = 'billing webhook (POST /api/billing/webhook/stripe, unsigned body)'
        Path           = '/api/billing/webhook/stripe'
        Method         = 'POST'
        Body           = '{"id":"evt_test","type":"ping"}'
        ContentType    = 'application/json'
        ExpectStatus   = 400
        TimeoutSec     = $script:WarmRequestTimeoutSec
    }
}

# ---------------------------------------------------------------------------
# Probe runner
# ---------------------------------------------------------------------------

# why: Invoke-WebRequest's -SkipHttpErrorCheck (PowerShell 7+) lets us inspect
# 4xx/5xx responses without try/catch noise. The auth-gate probe specifically
# expects 401, so treating non-2xx as a thrown exception would invert the
# pass/fail semantics for that case.
function Invoke-Probe {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $Url,
        [Parameter(Mandatory)] [string] $Method,
        [Parameter(Mandatory)] [int] $ExpectStatus,
        [string] $ExpectContains,
        [string] $Body,
        [string] $ContentType,
        [int] $TimeoutSec = $script:WarmRequestTimeoutSec
    )

    $startTime = Get-Date
    $invokeArgs = @{
        Uri                  = $Url
        Method               = $Method
        UserAgent            = $script:UserAgent
        TimeoutSec           = $TimeoutSec
        SkipHttpErrorCheck   = $true
        MaximumRedirection   = 0
        ErrorAction          = 'Stop'
    }
    if ($Body) {
        $invokeArgs.Body = $Body
    }
    if ($ContentType) {
        $invokeArgs.ContentType = $ContentType
    }

    try {
        $response = Invoke-WebRequest @invokeArgs
        $elapsedMs = [int]((Get-Date) - $startTime).TotalMilliseconds
        $statusOk = $response.StatusCode -eq $ExpectStatus
        $bodyOk = -not $ExpectContains -or ($response.Content -and $response.Content -match [regex]::Escape($ExpectContains))
        return [PSCustomObject]@{
            StatusCode = $response.StatusCode
            ElapsedMs  = $elapsedMs
            StatusOk   = $statusOk
            BodyOk     = $bodyOk
            Error      = $null
        }
    }
    catch {
        $elapsedMs = [int]((Get-Date) - $startTime).TotalMilliseconds
        return [PSCustomObject]@{
            StatusCode = 'ERROR'
            ElapsedMs  = $elapsedMs
            StatusOk   = $false
            BodyOk     = $false
            Error      = $_.Exception.Message
        }
    }
}

function Format-ProbeLine {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $Name,
        [Parameter(Mandatory)] [int] $ExpectStatus,
        [string] $ExpectContains,
        [Parameter(Mandatory)] $Result
    )

    $passed = $Result.StatusOk -and $Result.BodyOk
    $marker = if ($passed) { '✓' } else { '✗' }
    $color = if ($passed) { 'Green' } else { 'Red' }

    $statusText = if ($Result.StatusCode -eq 'ERROR') {
        "ERROR: $($Result.Error)"
    }
    elseif (-not $Result.StatusOk) {
        "$($Result.StatusCode) (expected $ExpectStatus)"
    }
    elseif ($ExpectContains -and -not $Result.BodyOk) {
        "$($Result.StatusCode) but body missing '$ExpectContains'"
    }
    else {
        "$($Result.StatusCode) ok"
    }

    Write-Host ("  {0} {1,-65} {2,-40} {3,5}ms" -f $marker, $Name, $statusText, $Result.ElapsedMs) -ForegroundColor $color
    return $passed
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "=== Legendary Arena — Render Deployment Smoke Test ===" -ForegroundColor Cyan
Write-Host "  Target : $BaseUrl" -ForegroundColor Gray
Write-Host "  Run at : $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))" -ForegroundColor Gray
Write-Host ""

$failureCount = 0
$totalProbes = 0

Write-Host "ASSETS" -ForegroundColor Cyan
foreach ($probe in $assetProbes) {
    $totalProbes++
    $result = Invoke-Probe -Url $probe.Url -Method $probe.Method `
        -ExpectStatus $probe.ExpectStatus `
        -ExpectContains $probe.ExpectContains `
        -TimeoutSec $script:WarmRequestTimeoutSec
    $passed = Format-ProbeLine -Name $probe.Name `
        -ExpectStatus $probe.ExpectStatus `
        -ExpectContains $probe.ExpectContains `
        -Result $result
    if (-not $passed) { $failureCount++ }
}

Write-Host ""
Write-Host "SERVER" -ForegroundColor Cyan
foreach ($probe in $serverProbes) {
    $totalProbes++
    $url = "$BaseUrl$($probe.Path)"
    $invokeParams = @{
        Url            = $url
        Method         = $probe.Method
        ExpectStatus   = $probe.ExpectStatus
        TimeoutSec     = $probe.TimeoutSec
    }
    if ($probe.ExpectContains) { $invokeParams.ExpectContains = $probe.ExpectContains }
    if ($probe.Body) { $invokeParams.Body = $probe.Body }
    if ($probe.ContentType) { $invokeParams.ContentType = $probe.ContentType }

    $result = Invoke-Probe @invokeParams
    $passed = Format-ProbeLine -Name $probe.Name `
        -ExpectStatus $probe.ExpectStatus `
        -ExpectContains $probe.ExpectContains `
        -Result $result
    if (-not $passed) { $failureCount++ }
}

Write-Host ""
Write-Host "===" -ForegroundColor Cyan
$summaryColor = if ($failureCount -eq 0) { 'Green' } else { 'Red' }
$passCount = $totalProbes - $failureCount
Write-Host "SUMMARY: $passCount/$totalProbes probes passed, $failureCount failure(s)" -ForegroundColor $summaryColor
Write-Host ""

if ($failureCount -gt 0) {
    exit 1
}
exit 0
