# EC-275 — LAGN Spec Publication (Execution Checklist)

**Source:** `docs/ai/work-packets/WP-244-lagn-spec-publication.md`  
**Layer:** Ecosystem / Open Standard (cross-cutting)

---

## Before Starting

- [ ] WP-244 pre-flight verdict: `READY TO EXECUTE`
- [ ] No dependencies — this WP is independent
- [ ] `pnpm install && pnpm --filter @legendary-arena/lagn build` exits 0
- [ ] `pnpm --filter @legendary-arena/lagn test` exits 0 (Node 18/20/22)

---

## Locked Values (do not re-derive)

- **NPM package name:** `@legendary-arena/lagn` (scoped, published with `--access public`)
- **NPM package version:** `1.0.0`
- **GitHub repo:** `legendary-arena/lagn-spec` (public, MIT license)
- **Schema canonical URL:** `https://legendary-arena.com/schemas/lagn/v1/lagn-v1.json` (versioned, full path)
- **Zod schema location:** `src/validator.ts` — authoritative source of truth
- **JSON Schema location:** `schemas/lagn-v1.json` — generated from Zod (never hand-edited)
- **CLI shebang (first line):** `#!/usr/bin/env node`
- **package.json `"bin"` field:** `{ "lagn": "./dist/cli.js" }`
- **CLI exit code — valid:** `0`
- **CLI exit code — invalid:** `1`
- **CLI exit code — file not found / I/O error:** `2`
- **Replay `seq` constraint:** strictly increasing by 1, no gaps, no duplicates (validation MUST fail if violated)

---

## Guardrails

- **Single source of truth:** Zod is canonical. If drift detected between Zod, JSON Schema, or runtime validation → STOP
- **No hand-written JSON Schema or TypeScript types.** All generated or inferred. If manual edits appear → STOP
- **No game logic.** Zero imports of `@legendary-arena/game-engine`, `@legendary-arena/registry`, or `boardgame.io`
- **Offline guarantee:** Schema bundled in package, no network dependency
- **ESM-only:** No CommonJS, no `require()`, `"type": "module"` in package.json
- **Test coverage matrix:** ≥3 valid + ≥3 invalid per tier, all three examples validate, CLI exit codes, replay seq ordering
- **summarize() determinism:** Returns `{ valid, game_id, variant, player_count, result }`. If invalid: all fields `null`. If valid: all fields resolve (no `undefined`)

---

## Required `// why:` Comments

- None required for this WP (schema/validator/CLI are API documentation via comments, not logic requiring rationale)

---

## Files to Produce

**New package — `packages/lagn-spec/`:**
- `schemas/lagn-v1.json` — **new** — generated JSON Schema (Zod → JSON Schema)
- `src/validator.ts` — **new** — Zod schema + validator + types + generateSchema()
- `src/cli.ts` — **new** — CLI tool with shebang + exit codes
- `src/index.ts` — **new** — public API exports
- `src/validator.test.ts` — **new** — 30+ behavior-based tests
- `examples/tier1-setup-only.lagn.json` — **new** — minimal valid Tier 1
- `examples/tier2-with-catalog.lagn.json` — **new** — Tier 1 + Tier 2
- `examples/tier3-with-replay.lagn.json` — **new** — full three-tier
- `package.json` — **new** — `@legendary-arena/lagn`, Node 18+, ESM, ajv-formats
- `tsconfig.json` — **new** — ESM target, strict mode
- `.github/workflows/ci.yml` — **new** — auto-test Node 18/20/22
- `README.md` — **new** — spec document + CLI usage + schema URL
- `LICENSE` — **new** — MIT

---

## After Completing

**Code-Complete Phase:**
- [ ] `pnpm --filter @legendary-arena/lagn build` exits 0
- [ ] `pnpm --filter @legendary-arena/lagn test` exits 0 (all tiers, CLI, examples)
- [ ] `npm pack packages/lagn-spec --dry-run` shows dist/, schemas/ (no src/, test/, examples/)
- [ ] `npx @legendary-arena/lagn validate examples/tier1-setup-only.lagn.json` → exit 0
- [ ] `npx @legendary-arena/lagn validate examples/tier2-with-catalog.lagn.json` → exit 0
- [ ] `npx @legendary-arena/lagn validate examples/tier3-with-replay.lagn.json` → exit 0
- [ ] `npx @legendary-arena/lagn validate /nonexistent/file.json` → exit 2, "File not found: ..."
- [ ] No forbidden imports in `packages/lagn-spec/src/` (Grep: `@legendary-arena/game-engine|@legendary-arena/registry|boardgame.io`)
- [ ] Commit message uses `EC-275:` prefix (never `WP-244:`)

**Release-Complete Phase (Operator Gates):**
- [ ] **Gate 1 — GitHub:** `legendary-arena/lagn-spec` repo created + user has write access
- [ ] **Gate 2 — NPM:** `npm whoami` returns authenticated user, `npm publish --access public --dry-run` succeeds
- [ ] **Gate 3 — Schema Hosting:** `legendary-arena.com/schemas/lagn/v1/lagn-v1.json` deployed + resolves
- [ ] `docs/ai/work-packets/WORK_INDEX.md` — WP-244 marked complete with today's date
- [ ] No commits outside `packages/lagn-spec/` and index updates

---

## Common Failure Smells

- **"Zod and JSON Schema don't match"** — usually means JSON Schema was hand-edited instead of re-generated. Solution: delete JSON Schema file and regenerate via `npm run generate:schema`
- **"TypeScript types don't align with schema"** — usually means types were hand-written. Solution: ensure types use `z.infer<typeof schema>`, never manual declarations
- **"CLI exits 0 for invalid files"** — usually means validation isn't running or exit code is wrong. Check: `validate()` is called, `process.exit()` codes are 0/1/2 per spec
- **"summarize() returns `undefined` fields"** — usually means the function extracts without checking validity first. Check: if `valid=false`, all fields MUST be `null`
- **"Replay seq validation passes with gaps"** — usually means constraint validation was skipped. Check: Zod schema includes seq ordering check (strictly increasing, no gaps)
