# EC-145 — Architecture Inventory Wiki Integration (Execution Checklist)

**Source:** docs/ai/work-packets/WP-145-inventory-wiki-integration.md
**Layer:** Tooling pipeline + `apps/wiki-viewer/` build pipeline. No engine, registry, preplan, or server runtime change. Cross-cutting; no package boundary crossed.

## Before Starting

- [ ] Lint gate `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` passed for this session
- [ ] **WP-139 + WP-144 on `main`** — `git log origin/main` shows `8a0621a` (WP-144 close) or later; the wiki viewer at `apps/wiki-viewer/` and `scripts/architecture-inventory.mjs` both reachable from `main`
- [ ] **Inventory script CLI surface re-verified:** `node scripts/architecture-inventory.mjs --out -` exits 0 and emits markdown matching the script header's contract (`--out FILE` flag honored; UTC date in header; exit 0 unless crash). Sibling commit `2d3a6d9` from `claude/great-bohr-a2175d` may have shifted output format — re-confirm before locking Open Decisions.
- [ ] **Open Decisions A / B / C / D locked.** Default = Recommended Execution Profile **A3 + B1 + C1 + D1**. Any deviation explicitly justified in `D-14501..D-14503` and validated against the Decision Compatibility Matrix (no A2 unless date-hardening prerequisite WP is on `main`).
- [ ] **DECISIONS numbering verified at session start:** read tail of `docs/ai/DECISIONS.md`; confirm next-free is `D-14501`. If a sibling WP has consumed `D-14501..D-14503` in the interim, retarget to the next contiguous free block above the latest landed `D-NNNN` and record in pre-flight notes.
- [ ] `pnpm --filter @legendary-arena/registry test`, `pnpm --filter @legendary-arena/game-engine test`, `pnpm --filter @legendary-arena/server test` exit 0 at session start; baselines captured for post-execution diff

## Locked Values (do not re-derive)

**Default execution path (Recommended Execution Profile):**

- **Cadence:** A3 — CI-scheduled cron, default `0 6 * * 1` (Mondays 06:00 UTC) unless overridden in D-14501
- **Location:** B1 — `wiki/architecture-inventory.md` (generator is sole writer; hand-edits silently overwritten)
- **Schema:** C1 — reserved-file accommodation (SCHEMA amendment landed via D-14503)
- **Diff policy:** D1 — PR-on-diff

**Non-negotiables:**

- D-block claim: **`D-14501..D-14503`** in numeric order; D-14502 amends D-13810 (single-file generator exception); D-14503 amends `wiki/SCHEMA.md` (C1: reserved-file list + lint-target exception)
- Script immutability: `scripts/architecture-inventory.mjs` is **byte-identical** pre/post-execution. Capture SHA-256 before first run; assert post-execution.
- Determinism: existing `.github/workflows/wiki-viewer.yml` byte-identical-output check (`*.html` + `*.css`) **still passes** unchanged
- A2 status: **BLOCKED** unless a sibling WP that hardens the inventory script's date input to a commit-derived value has landed on `main`
- Engine / registry / server / registry-viewer test baselines **UNCHANGED**

## Guardrails

- **Do NOT modify `scripts/architecture-inventory.mjs`.** Output format / flags / exit semantics issues become a follow-up WP, never folded into this one.
- **A2 selection rejected at session start** if the date-hardening prerequisite WP is not yet on `main` — this is a STOP, not a workaround.
- **B1 governance:** the committed `wiki/architecture-inventory.md` is generated content. The amendment to D-13810 must explicitly name this file as the sole permitted generator-authored exception, name the script as sole writer, and forbid hand-edits.
- **Non-gating preserved:** the inventory script's crash must not block any unrelated pipeline (wiki deploy, engine tests, registry tests). Workflow YAML uses `continue-on-error` or equivalent at the inventory step under any cadence.
- **Schema delta minimal under C1:** `wiki/SCHEMA.md` gains a row in § Reserved Filenames + a lint-target exception. § Entity Types remains a closed set; flat-structure cap unchanged. Any larger schema delta means C1 is the wrong lock — re-evaluate.
- **No runtime imports** of `@legendary-arena/game-engine`, `@legendary-arena/registry`, `@legendary-arena/preplan`, or `apps/server/**` introduced by this WP. Inventory script invocation is shell-level (`node scripts/...`), never a JS import from `apps/wiki-viewer/**`.

## Required `// why:` Comments

- `.github/workflows/architecture-inventory.yml` header: anchor (a) the cron schedule lock from D-14501, (b) the diff/PR policy from D-14501, (c) the non-gating posture (script failure must not cascade)
- D-14502 DECISIONS entry: anchor that this entry **amends D-13810** by naming `wiki/architecture-inventory.md` as the single generator-authored exception to the human-only-authoring rule
- D-14503 DECISIONS entry (under C1): anchor that this entry **amends `wiki/SCHEMA.md`** by adding the inventory page to the reserved-file list, with the lint-target exception
- `wiki/SCHEMA.md` § Reserved Filenames new row (under C1): anchor "Generated; sole writer is `scripts/architecture-inventory.mjs`; hand-edits silently overwritten"

## Files to Produce (under Recommended Profile A3+B1+C1+D1)

**Created:**
- `.github/workflows/architecture-inventory.yml` — cron-driven inventory regeneration with PR-on-diff policy
- `wiki/architecture-inventory.md` — first generated output committed under B1

**Modified:**
- `wiki/SCHEMA.md` — § Reserved Filenames row added; § File Layout list updated; § Lint Targets gains the front-matter exception (under C1 only)
- `apps/wiki-viewer/README.md` — "Generated content" subsection naming the inventory invocation pattern + cadence
- `package.json` (top-level) — `wiki-viewer:inventory` script alias matching existing `wiki-viewer:project` / `wiki-viewer:build` naming
- `docs/ai/DECISIONS.md` — D-14501..D-14503 appended; D-14502 amends D-13810
- `docs/ai/work-packets/WORK_INDEX.md` — WP-145 row added; flipped Done at completion with commit hash
- `docs/ai/execution-checklists/EC_INDEX.md` — EC-145 row Draft → Done at completion
- `docs/ai/STATUS.md` — session-close block prepended

**Explicitly NOT touched** (verify via `git diff --stat`): `scripts/architecture-inventory.mjs`, `apps/wiki-viewer/scripts/project-wiki.mjs` (B1 path; B2 would touch it but B1 doesn't), `apps/wiki-viewer/hugo.toml`, `packages/**`, `apps/server/**`, `apps/registry-viewer/**`, `apps/arena-client/**`, `data/**`.

## After Completing

- [ ] Inventory script SHA-256 byte-identical to pre-execution capture (script-immutability invariant)
- [ ] `wiki/architecture-inventory.md` exists, tracked, content matches `node scripts/architecture-inventory.mjs --out -` output for the post-execution commit (modulo midnight-UTC straddle on the header line)
- [ ] Two consecutive `pnpm wiki-viewer:build` invocations produce byte-identical `*.html` + `*.css` (WP-139 determinism contract preserved)
- [ ] `.github/workflows/architecture-inventory.yml` runs to completion on `workflow_dispatch` test trigger; cron schedule renders correctly in GitHub UI
- [ ] Engine + registry + server + registry-viewer test baselines UNCHANGED
- [ ] `git diff --stat scripts/ packages/ apps/server/ apps/registry-viewer/ apps/arena-client/` empty
- [ ] D-14501..D-14503 appended to `DECISIONS.md` in numeric order; D-14502 explicitly cites the D-13810 amendment in its body
- [ ] `WORK_INDEX.md` WP-145 row flipped Draft → Done with date + commit hash + locked-options summary (`A3+B1+C1+D1` or actual lock); `EC_INDEX.md` EC-145 row Draft → Done; `STATUS.md` updated
- [ ] 01.6 post-mortem authored **only if** triggers fire (first generated artifact landing under `wiki/`; first reserved-file accommodation under SCHEMA.md; D-13810 amended)

## Common Failure Smells

- **Temptation to "just fix" the inventory script during integration** — the immutability rule is binary; if the script needs changes, stop and route to a follow-up WP.
- **A2 selection without the date-hardening prerequisite** — silently breaks the WP-139 determinism check on cross-midnight builds. Symptom: a build at 23:59 UTC and the next at 00:01 UTC produce different bytes. Fix: reject A2 at lock time; route to A3.
- **D-13810 amendment skipped under B1** — silently violates the read-only-`wiki/` rule. Symptom: a future reader sees `wiki/architecture-inventory.md` and assumes it's authored. Fix: D-14502 body explicitly names the file + sole writer + hand-edit prohibition.
- **SCHEMA.md flat-structure cap regression** — selecting B3 and adding `wiki/_generated/` triggers a SCHEMA amendment beyond the locked C1 minimum. If the WP author meant C1, they should not be at B3. Fix: re-confirm option lock; if B3 is intentional, the schema delta is larger than C1 budgets.
- **`continue-on-error` omitted** — turns the cron workflow into a deploy gate; an inventory script regression cascades into a CI red flag against the wiki deploy. Symptom: a script crash blocks the next wiki deploy. Fix: confirm `continue-on-error: true` at the inventory step; the script's "not a gate" header contract must propagate to the workflow.
- **Hand-edit to `wiki/architecture-inventory.md` between regenerations** — silently lost on next cron run. Not a stop-ship if caught; a future drift-detection lint (reserved per WP-145 §Non-Negotiable Constraints) would catch it. Fix: commit message + README warning; treat as a documentation pattern question, not a code bug.
