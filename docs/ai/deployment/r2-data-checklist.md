# R2 Data Verification Checklist (§A)

**Purpose:** Verify every piece of Cloudflare R2 card content is present,
well-formed, and addressable before a release is promoted onto the path
toward `prod`. Each item below is **binary pass/fail**. A single fail
blocks promotion until the underlying defect is repaired — there is no
"ship with a warning" path (D-0602 / D-0802).

This checklist is the canonical verification procedure referenced by
[`docs/ops/RELEASE_CHECKLIST.md`](../../ops/RELEASE_CHECKLIST.md) Gate 2
(Content validation passes with zero errors).

## Scope

**In scope:**
- R2 bucket contents (metadata JSON files, per-set card JSON files,
  card images).
- The validation script at `packages/registry/scripts/validate.ts`,
  invoked via `pnpm registry:validate`, in both local mode (reads files
  from disk) and R2 mode (fetches over HTTP).
- R2 bucket configuration (bucket name, CORS, cache-control,
  `rclone` remote).
- The procedure for adding a new expansion set to R2.

**Explicitly out of scope:**
- UI rendering surfaces — browser-side rendering concerns are a
  UI-layer responsibility per the Layer Boundary and belong in a UI
  deployment checklist, not here. Per D-4202, the legacy
  UI-rendering-layer verification section from
  `docs/archive prompts-legendary-area-game/00.2b-deployment-checklists.md`
  §C is intentionally excluded.
- PostgreSQL provisioning and seeding — see
  [`postgresql-checklist.md`](./postgresql-checklist.md).
- CI/CD pipeline wiring — the checklist states what must be true;
  enforcement automation is separate ops tooling.

---

## §A.1 — Validation script usage

The validation script lives at
[`packages/registry/scripts/validate.ts`](../../../packages/registry/scripts/validate.ts)
and runs in two modes selected by the `R2_BASE_URL` environment
variable. Both modes execute the same five-phase pipeline described
below and write a machine-readable report to `dist/registry-health.json`.

**Environment variables read by the script:**

| Variable | Purpose | Default |
|---|---|---|
| `METADATA_DIR` | Local-mode path to lookup JSON files | `data/metadata` |
| `SETS_DIR` | Local-mode path to per-set card JSON files | `data/cards` |
| `HEALTH_OUT` | Output path for the machine-readable report | `dist/registry-health.json` |
| `R2_BASE_URL` | Remote base URL; non-empty string switches to R2 mode | *(unset — local mode)* |
| `SKIP_IMAGES` | Set to `1` to skip Phase 4 image spot-checks | *(unset — images checked)* |
| `IMAGE_DELAY_MS` | Milliseconds between image HEAD requests | `50` |

**Local mode invocation:**

```pwsh
pnpm registry:validate
```

- [ ] Local-mode run exits with code `0`.
- [ ] `dist/registry-health.json` exists after the run, with
      `summary.totalErrors == 0` and `summary.imagesFailed == 0`.

**R2-mode invocation:**

```pwsh
$env:R2_BASE_URL = "https://images.barefootbetters.com"; pnpm registry:validate
```

- [ ] R2-mode run exits with code `0`.
- [ ] `dist/registry-health.json` for the R2-mode run has
      `mode == "r2"` and `metadataSource` points at
      `https://images.barefootbetters.com/metadata/`.

**Exit-code contract:**

| Exit code | Meaning |
|---|---|
| `0` | Validation passed — zero errors, zero image failures. Warnings are permitted and surfaced in the report but do not fail the run. |
| `1` | One or more errors, or at least one image HEAD request returned non-200. Promotion is blocked until the defect is repaired. |

**Four-phase pipeline (executed in order):**

1. **Phase 1 — Registry config.** In R2 mode the script fetches
   `registry-config.json` from the R2 root and validates it with
   `RegistryConfigSchema` (an array of abbreviation strings). In local
   mode the script reads set abbreviations from
   `data/metadata/sets.json` via `SetIndexEntrySchema`. A zero-length
   abbreviation list is a fatal error and aborts the run.
2. **Phase 2 — Per-set card JSON.** For each set abbreviation, the
   per-set card file is fetched (R2: flat `/metadata/{abbr}.json`;
   local: `data/cards/{abbr}.json`) and validated against
   `SetDataSchema`. The script additionally checks that every
   `imageUrl` points at `images.barefootbetters.com` and flags ability
   text lines containing the literal pipeline artifact
   `[object Object]`.
3. **Phase 3 — Cross-references.** Two checks run: `alwaysLeads` slug
   resolution (each mastermind's `alwaysLeads` entries either match a
   villain-group slug in the same set or are flagged as potential
   henchman references) and duplicate-slug detection across all sets
   (duplicates are warnings because they can cause upsert collisions
   during later PostgreSQL seeding).
4. **Phase 4 — Image spot-checks.** Three images per set are sampled
   (first mastermind card, first villain card, first hero card) and a
   `HEAD` request is issued per URL. The delay between requests is
   controlled by `IMAGE_DELAY_MS`. Any non-200 response fails the run.

> Historical note: an earlier Phase 2 metadata-validation block
> validated five auxiliary lookup files (`card-types.json`,
> `hero-classes.json`, `hero-teams.json`, `icons-meta.json`,
> `leads.json`). Those files and the block were deleted by WP-084 on
> 2026-04-21 as unused surface area; former Phases 3 / 4 / 5 have
> been renumbered to 2 / 3 / 4.

- [ ] Every phase listed above completes without an `error`-level
      finding in `dist/registry-health.json`.
- [ ] `summary.setsLoaded` equals `summary.setsIndexed` (every set
      listed in the registry manifest was loaded successfully).

---

## §A.2 — Registry manifest

The registry manifest is `data/metadata/sets.json` (local mode) or
`https://images.barefootbetters.com/metadata/sets.json` (R2 mode). It
enumerates every expansion set available to the registry and must
remain the single source of truth for set abbreviations.

- [ ] `sets.json` exists at the expected location for the run mode.
- [ ] `sets.json` parses as a JSON array at the top level.
- [ ] Every entry matches `SetIndexEntrySchema`: the fields `id`,
      `abbr`, `pkgId`, `slug`, `name`, `releaseDate`, and `type` are
      all present and typed correctly.
- [ ] `sets.json` contains **40** entries. A lower count is a warning
      surfaced by Phase 1's abbreviation read; the 40 locked in the
      registry catalog is the expected reality of the shipped repo at
      the date of this checklist.

> The historical `card-types.json` counter-example (WP-003 Defect 1,
> D-1203) was deleted by WP-084 on 2026-04-21. D-1203 retains the
> full narrative of the silent-failure mode. The pattern still
> applies to any future metadata file that shares a similar shape —
> always confirm the manifest filename in any loader site before
> modifying it.

---

## §A.3 — Metadata files (historical)

The surviving lookup file in the metadata directory is `sets.json`,
validated entry-by-entry in Phase 1's set-abbreviation read. The
five historical auxiliary files (`card-types.json`,
`hero-classes.json`, `hero-teams.json`, `icons-meta.json`,
`leads.json`) and their Phase 2 validation block were deleted by
WP-084 on 2026-04-21 — see DECISIONS.md (WP-084 §Governance) for the
deletion rationale and reintroduction rule. Glossary data
(`keywords-full.json`, `rules-full.json`) is validated by the
registry-viewer at fetch time (WP-082 / EC-107).

- [ ] `sets.json` exists at the expected location for the run mode.
- [ ] `sets.json` parses as a JSON array at the top level.
- [ ] `sets.json` has ≥ 40 valid entries.
- [ ] Zero entries fail `SetIndexEntrySchema` (Phase 1 surfaces this
      via the abbreviation-read loop).

---

## §A.4 — Image assets (naming convention + Phase 4 spot-checks)

Card images live under `https://images.barefootbetters.com/` and are
addressed via the `imageUrl` field on each card record. Image URLs
use **hyphens, never underscores** — underscore-based URLs will
400/404 and fail Phase 4.

**Naming convention:**

| Card type | URL pattern | Example |
|---|---|---|
| Hero | `{setAbbr}/heroes/{hero-slug}-{card-slug}.jpg` | `core/heroes/black-widow-mission-accomplished.jpg` |
| Mastermind | `{setAbbr}/masterminds/{mastermind-slug}-{card-slug}.jpg` | `core/masterminds/loki-loki-strikes.jpg` |
| Villain | `{setAbbr}/villains/{group-slug}-{card-slug}.jpg` | `core/villains/brotherhood-of-mutant-riot.jpg` |
| Henchman | `{setAbbr}/henchmen/{group-slug}-{card-slug}.jpg` | `core/henchmen/doombot-legion-doombot.jpg` |
| Scheme | `{setAbbr}/schemes/{scheme-slug}.jpg` | `core/schemes/unleash-power-of-cosmic-cube.jpg` |
| Bystander | `{setAbbr}/bystanders/{bystander-slug}.jpg` | `core/bystanders/skrull-soldier.jpg` |
| Wound | `{setAbbr}/wounds/{wound-slug}.jpg` | `core/wounds/standard-wound.jpg` |

- [ ] Phase 4 issued `setCount × 3` HEAD requests (roughly 120 for
      40 sets) and every response returned HTTP 200. The exact URLs
      probed are recorded in `dist/registry-health.json` under
      `imageFailures` (empty array means all 200).
- [ ] `IMAGE_DELAY_MS` was left at its default (`50`) during the run.
      Lower delays risk R2 rate-limiting; higher delays are
      acceptable but slow the run.
- [ ] No card record anywhere in the registry has an `imageUrl` that
      contains an underscore instead of a hyphen. (The script's Phase
      3 flags wrong-domain URLs; underscore usage shows up downstream
      as a Phase 4 non-200.)

`SKIP_IMAGES=1` is an operator override reserved for environments
where R2 HEAD traffic is intentionally disallowed (e.g., an isolated
CI without egress). It is **not** an acceptable shortcut for a
release promotion gate.

---

## §A.5 — Cross-reference checks (Phase 3)

Phase 3 runs two cross-reference checks over the registry.

**`alwaysLeads` slug resolution.** Every mastermind record has an
`alwaysLeads` array of villain-group slugs that the mastermind
conventionally leads. For each entry, the script checks that the
slug resolves to a villain group present in the same set. Entries
that do not resolve are warnings, because some masterminds
legitimately lead henchman groups (which live outside the villain
slug space). Warnings are expected; **errors** in this phase are not.

- [ ] The script emitted zero `ALWAYS_LEADS_UNRESOLVED` findings at
      the `error` level. Warning-level findings are acceptable and
      should be cross-checked against the physical cards by a human
      reviewer during content authoring, not at deploy time.

**Duplicate slug detection.** Every hero, mastermind, villain group,
and scheme slug is collected across all sets. Any slug that appears in
more than one set is flagged as a `DUPLICATE_SLUG` warning.

- [ ] Duplicate slugs, if any, are reviewed and intentional. A new
      duplicate detected in this phase that was not present in the
      previous release's report is a release-blocking anomaly and
      must be resolved before promotion.

---

## §A.6 — R2 bucket configuration

The R2 bucket's configuration is infrastructure state, not content,
and is verified out-of-band from the script. Every item below must be
true before a release is promoted.

**Bucket identity:**

- [ ] R2 bucket name is **`legendary-images`**.
- [ ] Public URL is **`https://images.barefootbetters.com`** and
      resolves to the `legendary-images` bucket.

**CORS policy:**

- [ ] `GET` and `HEAD` are allowed from
      `https://cards.barefootbetters.com` (production site) and
      `http://localhost:5173` (local developer client). Other
      methods and origins are disallowed.
- [ ] `Access-Control-Allow-Origin` is echoed verbatim (not `*`) so
      cached responses remain origin-scoped.

**Cache-control headers:**

- [ ] Image objects (`*.jpg`, `*.png`) serve with a long
      `Cache-Control: public, max-age=31536000, immutable` header.
      Images are content-addressed by filename and never rewritten
      in place — immutability is load-bearing.
- [ ] JSON metadata objects (`metadata/*.json`) serve with
      `Cache-Control: public, max-age=3600`. One hour balances cache
      effectiveness against the operational need to roll a new set's
      metadata without waiting a day for caches to expire.

**`rclone` remote verification:**

The standard operator verification tool for R2 is `rclone` with the
`legendary-r2` remote configured in `~/.config/rclone/rclone.conf`.

- [ ] `rclone lsf legendary-r2:legendary-images/metadata/` lists
      every metadata file plus every per-set card file. Exit code
      `0`.
- [ ] `rclone check legendary-r2:legendary-images/metadata/
      ./data/metadata/` reports no missing-remote or missing-local
      entries. (Warnings about extra remote-only files are acceptable
      if they are older sets no longer mirrored locally.)

---

## §A.7 — New set upload procedure

Adding a new expansion set to R2 is an ordered, verifiable sequence.
Skipping or reordering any step can leave the registry in a state
where Phase 2 succeeds locally but Phase 2 or Phase 4 fails against
R2. The steps below are listed in execution order; each step must
succeed before the next is attempted.

1. **Local validation against the new set.** Author the per-set JSON
   file at `data/cards/{newSetAbbr}.json`, update
   `data/metadata/sets.json` to include the new set entry, then run:

   ```pwsh
   pnpm registry:validate
   ```

   - [ ] Local-mode validation exits `0` and the new set appears in
         `dist/registry-health.json` under `summary.setsLoaded`.

2. **Upload per-set JSON to R2.** Using `rclone`:

   ```pwsh
   rclone copyto ./data/cards/{newSetAbbr}.json `
     legendary-r2:legendary-images/metadata/{newSetAbbr}.json
   ```

   - [ ] `rclone copyto` exits `0` and `rclone lsf
         legendary-r2:legendary-images/metadata/{newSetAbbr}.json`
         lists the uploaded file.

3. **Upload images to R2.** For every image referenced by the new
   set's `imageUrl` fields, upload under the corresponding path
   (hero / mastermind / villain / henchman / scheme / bystander /
   wound). Use `rclone sync` against a local staging directory that
   mirrors the R2 path layout.

   - [ ] Every uploaded image returns HTTP 200 to a `HEAD` probe at
         its `imageUrl`.

4. **Update `metadata/sets.json` on R2.** Upload the updated
   `sets.json` so R2's manifest includes the new set:

   ```pwsh
   rclone copyto ./data/metadata/sets.json `
     legendary-r2:legendary-images/metadata/sets.json
   ```

   - [ ] `rclone copyto` exits `0` and the uploaded `sets.json`
         parses to include the new set entry.

5. **Update `registry-config.json` on R2 if required.** If
   `registry-config.json` is maintained separately as an explicit
   abbreviation list (R2-only artifact), regenerate and upload it
   so it enumerates the new set's `abbr`.

   - [ ] `registry-config.json` on R2 now contains the new `abbr`.

6. **R2-mode validation.** Re-run the script against the live R2
   bucket:

   ```pwsh
   $env:R2_BASE_URL = "https://images.barefootbetters.com"; pnpm registry:validate
   ```

   - [ ] R2-mode validation exits `0` and `summary.setsLoaded`
         includes the new set.

7. **Registry viewer smoke test.** Load the registry viewer
   (`apps/registry-viewer`) pointing at the R2 base URL and confirm
   the new set is enumerable, every card's `imageUrl` resolves to a
   displayable image, and no Phase-3-style parse warnings are logged
   in the browser console.

   - [ ] Registry viewer renders at least one card per card type
         from the new set without a load error.

A new set upload is considered complete only when all seven steps
above pass. A failure at any step is resolved at that step — do not
proceed to later steps on the theory that the issue "will be caught
later."

---

## §A.8 — ⚠️ `rclone sync` hazard: the `metadata/` directory is a union of two local sources

**Never run `rclone sync` from a single local directory into
`legendary-r2:legendary-images/metadata/`.** `rclone sync` mirrors source
onto destination and **deletes every destination object that is not in the
source**. R2's flat `metadata/` directory is populated from **two
disjoint local directories**, so no single local directory is a complete
mirror of it:

| R2 object pattern | Local source | Count |
|---|---|---|
| `metadata/{abbr}.json` (per-set card data) | `data/cards/*.json` | 40 |
| `metadata/sets.json`, `metadata/keywords-full.json`, `metadata/rules-full.json`, `metadata/card-abilities.json`, `metadata/card-types.json`, `metadata/scheme-twist-*.json`, `metadata/{hero,villain,henchman,mastermind}-pattern*.json` (config + taxonomy files) | `data/metadata/*.json` | 15+ |

Because the two local trees are disjoint, `rclone sync data/metadata …`
deletes all 40 per-set card files (they live in `data/cards/`, not
`data/metadata/`), and `rclone sync data/cards …` would delete all 15+
config files. Either direction silently destroys half of production.

**Safe patterns:**

| Goal | Command | Why safe |
|---|---|---|
| Push new/changed config or taxonomy files | `rclone copy ./data/metadata legendary-r2:legendary-images/metadata` | `copy` is additive — uploads new/changed files, never deletes |
| Push new/changed per-set card data | `rclone copy ./data/cards legendary-r2:legendary-images/metadata` | same — additive |
| Push a single file | `rclone copyto ./data/metadata/sets.json legendary-r2:legendary-images/metadata/sets.json` | one object, no directory diff (this is the §A.7 new-set pattern) |
| Audit drift without mutating | `rclone check legendary-r2:legendary-images/metadata/ ./data/metadata/` | read-only (§A.6) |

`rclone sync` is appropriate **only** for image staging (§A.7 step 3),
where the local staging directory genuinely mirrors the entire remote
image subtree. It is never appropriate against the shared `metadata/`
directory.

**Recovery, if `metadata/` per-set files are wiped:** the source data is
intact in-repo. Re-run the additive copy:

```pwsh
rclone copy ./data/cards legendary-r2:legendary-images/metadata --progress
```

Then re-verify with R2-mode validation (§A.1) or a spot HEAD check:
`curl -s -o /dev/null -w "%{http_code}" https://images.barefootbetters.com/metadata/core.json` → `200`.

- [ ] No release procedure or ad-hoc upload step invokes `rclone sync`
      with `legendary-r2:legendary-images/metadata/` as the destination.

> **Incident precedent (2026-05-27):** during the WP-184 pattern-taxonomy
> R2 upload, `rclone sync data/metadata r2:legendary-images/metadata`
> deleted all 40 per-set card files (`Deleted: 40 (files)`), taking
> `cards.legendary-arena.com` offline for card browsing until
> `rclone copy data/cards …` restored them. The new pattern files
> uploaded fine; the `sync` verb — not the file set — was the fault.

---

## Completion criteria

A R2 data verification pass is complete when every checkbox in
§A.1 through §A.8 is checked **for the specific release candidate
being promoted**. Carrying forward checks from a prior release is
not acceptable — card data and images can change between releases
even when the engine build has not, and the whole point of this gate
is to catch that drift before promotion.

The machine-readable report at `dist/registry-health.json` is the
durable artifact of a passing run. Archive it alongside the release
notes for post-incident forensics.
