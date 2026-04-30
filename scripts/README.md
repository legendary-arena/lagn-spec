# `scripts/` — Local Tooling

Helper scripts for local development, diagnostics, and one-off operations.
Most are PowerShell (`.ps1`) so they run cleanly under Windows pwsh; a few
are Node.js (`.mjs`) when shell-portability matters or when they need to
share code with the application.

Reference docs:

- [docs/04-DEVELOPMENT-SETUP.md](../docs/04-DEVELOPMENT-SETUP.md) — first-time
  setup, environment variables, and the smoke-test workflow.
- [docs/07-CLI-REFERENCE.md](../docs/07-CLI-REFERENCE.md) — what each script
  does and when to use it.

---

## Local smoke-test helpers

| Script | Purpose |
|---|---|
| [`Start-SmokeTest.ps1`](Start-SmokeTest.ps1) | Boots the boardgame.io game server (and optionally spawns the arena-client Vite dev in a new window). Clears any process-scope `DATABASE_URL` override so `--env-file=.env` wins. |
| [`Start-DevClient.ps1`](Start-DevClient.ps1) | Starts the arena-client Vite dev server on port 5173 with `--strictPort` (fails fast if 5173 is held; CORS-aligned with the game server's allow-list). |
| [`Start-DevViewer.ps1`](Start-DevViewer.ps1) | Starts the registry-viewer Vite dev server (loadout authoring + card/theme browsing). No CORS coupling — Vite bumps to the next free port if 5173 is taken; typically lands on 5174 when run alongside `Start-DevClient.ps1`. |

**Recommended smoke-test pairing:**

```powershell
# Window A — game server
pwsh scripts/Start-SmokeTest.ps1 -ServerOnly

# Window B — arena-client (strict 5173 — CORS-locked)
pwsh scripts/Start-DevClient.ps1

# Window C — registry viewer (auto-bumps to 5174 since 5173 is taken)
pwsh scripts/Start-DevViewer.ps1
```

Pass `-KillStaleListeners` to any of the three scripts if zombie
processes are holding the relevant ports.

---

## Diagnostics

| Script | Purpose |
|---|---|
| [`Check-Env.ps1`](Check-Env.ps1) | PATH + tooling + `.env` sanity check. Run first on a new machine. |
| [`check-connections.mjs`](check-connections.mjs) | Connection health check — Postgres, R2, game server, Cloudflare Pages, GitHub. Invoked via `pnpm check`. |
| [`migrate.mjs`](migrate.mjs) | Database migrations. |
| [`validate-r2.mjs`](validate-r2.mjs) | R2 data validation. Invoked via `pnpm validate`. |
| [`architecture-inventory.mjs`](architecture-inventory.mjs) | Library adoption snapshot — walks every workspace `package.json`, counts real source imports, and cross-references `docs/02-ARCHITECTURE.md` + `docs/ai/ARCHITECTURE.md`. Markdown to stdout by default; `pnpm arch:inventory:save` writes `docs/ai/audits/architecture-inventory-latest.md`. Feed the report into the gap-analysis prompt for prioritized recommendations. |

---

## Subdirectories

- [`audit/`](audit/) — Vision-alignment audit tooling (WP-085).
- [`ec/`](ec/) — Execution Checklist helpers.
- [`git/`](git/) — Git hooks installer + EC-mode commit helper.
- [`comicvine-cover-fetcher.mjs`](comicvine-cover-fetcher.mjs) /
  [`generate-theme-catalog.mjs`](generate-theme-catalog.mjs) /
  [`upload-themes-to-r2.mjs`](upload-themes-to-r2.mjs) — content pipeline tooling.

See [docs/07-CLI-REFERENCE.md](../docs/07-CLI-REFERENCE.md) for full
descriptions and usage examples.
