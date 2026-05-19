#!/usr/bin/env tsx
/**
 * validate.ts
 * Validates the Legendary Arena data store against Checklist A items
 * from 00.2b-deployment-checklists.md.
 *
 * Four validation phases:
 *   Phase 1 — Registry config (registry-config.json; sets.json in local mode)
 *   Phase 2 — Per-set card JSON (schema, imageUrl domain, data quality issues)
 *   Phase 3 — Cross-references (alwaysLeads consistency, duplicate slug detection)
 *   Phase 4 — Image spot-checks (1 HEAD request per card type per set)
 *
 * Runs in two modes:
 *   Local (default) — reads from METADATA_DIR and SETS_DIR on disk
 *   R2              — fetches and validates the live R2 bucket via HTTP
 *
 * Directory layout (local mode):
 *   METADATA_DIR/   (default: data/metadata/)   — lookup JSON files (sets.json)
 *   SETS_DIR/       (default: data/cards/)       — per-set card JSON files
 *
 * R2 layout (R2 mode):
 *   {R2_BASE_URL}/metadata/{file}               — lookup files and per-set files
 *   {R2_BASE_URL}/registry-config.json          — set abbreviation list
 *
 * Usage:
 *   pnpm validate
 *   pnpm validate:r2
 *   pnpm validate:r2:fast
 *   pwsh scripts\Validate-R2.ps1 -R2Mode -SkipImages
 *
 * Environment variables:
 *   METADATA_DIR    Path to lookup JSON files     (default: data/metadata)
 *   SETS_DIR        Path to per-set card JSON files (default: data/cards)
 *   HEALTH_OUT      JSON report output path        (default: dist/registry-health.json)
 *   R2_BASE_URL     If set, validates live R2 instead of local files
 *   SKIP_IMAGES     Set to "1" to skip Phase 4 image HEAD checks
 *   IMAGE_DELAY_MS  Milliseconds between image requests (default: 50)
 *
 * Exit codes:
 *   0 — validation passed (warnings do not cause failure)
 *   1 — one or more errors found, or any image returned non-200
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve }     from "node:path";
import { fileURLToPath }              from "node:url";
import {
  RegistryConfigSchema,
  SetIndexEntrySchema,
  SetDataSchema,
} from "../src/schema.js";
import type { SetData } from "../src/types/index.js";

// ── Configuration ─────────────────────────────────────────────────────────────

// why: defaults resolve relative to this script's location, not process.cwd(),
// because `pnpm --filter @legendary-arena/registry validate` runs with CWD =
// packages/registry/, which breaks repo-root-relative defaults. Env overrides
// still win when set.
const HERE      = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");

const METADATA_DIR   = resolve(process.env["METADATA_DIR"]   ?? join(REPO_ROOT, "data/metadata"));
const SETS_DIR       = resolve(process.env["SETS_DIR"]       ?? join(REPO_ROOT, "data/cards"));
const HEALTH_OUT     = resolve(process.env["HEALTH_OUT"]     ?? "dist/registry-health.json");
const R2_BASE_URL    = (process.env["R2_BASE_URL"] ?? "").replace(/\/$/, "");
const SKIP_IMAGES    = process.env["SKIP_IMAGES"] === "1";
const IMAGE_DELAY_MS = parseInt(process.env["IMAGE_DELAY_MS"] ?? "50", 10);

const IS_R2_MODE = R2_BASE_URL.length > 0;
const R2_DOMAIN  = "images.barefootbetters.com";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Finding {
  level:    "error" | "warning";
  phase:    string;
  setAbbr?: string;
  code:     string;
  message:  string;
}

interface ImageCheckResult {
  urlsChecked: number;
  failedUrls:  string[];
}

interface ValidationReport {
  generatedAt: string;
  mode:        "local" | "r2";
  metadataSource: string;
  setsSource:     string;
  summary: {
    totalErrors:   number;
    totalWarnings: number;
    imagesFailed:  number;
    imagesChecked: number;
    setsIndexed:   number;
    setsLoaded:    number;
    totalHeroes:   number;
    totalCards:    number;
  };
  findings:      Finding[];
  imageFailures: string[];
}

// ── Data access ───────────────────────────────────────────────────────────────

/**
 * Fetch a metadata lookup file (sets.json).
 * Local: reads from METADATA_DIR/{filename}.
 * R2:    fetches from {R2_BASE_URL}/metadata/{filename}.
 */
async function fetchMetadataFile(filename: string): Promise<unknown> {
  if (IS_R2_MODE) {
    const url      = `${R2_BASE_URL}/metadata/${filename}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Fetching "${url}" returned HTTP ${response.status} ${response.statusText}.`);
    }
    return response.json();
  }

  const filePath = join(METADATA_DIR, filename);
  const content  = await readFile(filePath, "utf8");
  return JSON.parse(content);
}

/**
 * Fetch a per-set card JSON file for the given set abbreviation.
 * Local: reads from SETS_DIR/{abbr}.json
 * R2:    fetches from {R2_BASE_URL}/metadata/{abbr}.json  (R2 is flat)
 *
 * why: local and R2 layouts differ — locally the set files live in data/cards/
 * while on R2 they are flat alongside the lookup files under /metadata/.
 */
async function fetchSetFile(abbr: string): Promise<unknown> {
  if (IS_R2_MODE) {
    const url      = `${R2_BASE_URL}/metadata/${abbr}.json`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Fetching "${url}" returned HTTP ${response.status} ${response.statusText}.`);
    }
    return response.json();
  }

  const filePath = join(SETS_DIR, `${abbr}.json`);
  const content  = await readFile(filePath, "utf8");
  return JSON.parse(content);
}

/**
 * Fetch registry-config.json from the R2 root (R2 mode only).
 * Local validation uses sets.json instead — registry-config.json is an R2 artifact.
 */
async function fetchRegistryConfig(): Promise<unknown> {
  if (!IS_R2_MODE) {
    // why: registry-config.json does not exist in the repo — it is generated
    // and uploaded to R2. Local validation reads set abbreviations from sets.json.
    throw new Error(
      "registry-config.json is only available in R2 mode. Run with R2_BASE_URL set to validate it."
    );
  }

  const url      = `${R2_BASE_URL}/registry-config.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetching "${url}" returned HTTP ${response.status} ${response.statusText}.`);
  }
  return response.json();
}

/**
 * Issue a HEAD request for an image URL and return the HTTP status code.
 * Returns 0 on network failure or timeout.
 */
async function headRequest(imageUrl: string): Promise<number> {
  const controller = new AbortController();
  // why: R2 can be slow on cold cache — 10 seconds prevents hanging on bulk checks
  const timeoutId  = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(imageUrl, { method: "HEAD", signal: controller.signal });
    return response.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(timeoutId);
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// ── Phase 1: Registry Config ──────────────────────────────────────────────────

/**
 * R2 mode: validates registry-config.json, returns set abbreviations.
 * Local mode: reads abbreviations from sets.json (registry-config.json is R2-only).
 */
async function checkRegistryConfig(findings: Finding[]): Promise<string[]> {
  const phase = "Phase 1 — Registry Config";
  console.log(`\n── ${phase} ──`);

  if (!IS_R2_MODE) {
    console.log("  ℹ Local mode: registry-config.json is an R2 artifact.");
    console.log("    Set abbreviations will be read from sets.json instead.");
    return readSetAbbreviationsFromSetsJson(phase, findings);
  }

  try {
    const rawConfig   = await fetchRegistryConfig();
    const parseResult = RegistryConfigSchema.safeParse(rawConfig);

    if (!parseResult.success) {
      findings.push({
        level:   "error",
        phase,
        code:    "REGISTRY_CONFIG_INVALID",
        message: "registry-config.json is not a valid JSON array of abbreviation strings. " +
                 `First issue: ${parseResult.error.issues[0]?.message ?? "unknown"}.`,
      });
      console.log("  ✗ registry-config.json — invalid structure");
      return [];
    }

    if (parseResult.data.length === 0) {
      findings.push({
        level:   "error",
        phase,
        code:    "REGISTRY_CONFIG_EMPTY",
        message: "registry-config.json contains an empty array. At least one abbreviation is required.",
      });
      console.log("  ✗ registry-config.json — empty array");
      return [];
    }

    console.log(`  ✓ registry-config.json — ${parseResult.data.length} abbreviations`);
    return parseResult.data;
  } catch (error) {
    findings.push({
      level:   "error",
      phase,
      code:    "REGISTRY_CONFIG_MISSING",
      message: "registry-config.json could not be fetched. " +
               (error instanceof Error ? error.message : String(error)),
    });
    console.log("  ✗ registry-config.json — not found or not accessible");
    return [];
  }
}

async function readSetAbbreviationsFromSetsJson(phase: string, findings: Finding[]): Promise<string[]> {
  try {
    const rawSets = await fetchMetadataFile("sets.json");

    if (!Array.isArray(rawSets)) {
      findings.push({
        level:   "error",
        phase,
        code:    "SETS_JSON_NOT_ARRAY",
        message: "sets.json does not contain a JSON array at the top level.",
      });
      return [];
    }

    const abbreviations: string[] = [];
    for (const entry of rawSets) {
      const parseResult = SetIndexEntrySchema.safeParse(entry);
      if (parseResult.success) {
        abbreviations.push(parseResult.data.abbr);
      }
    }

    console.log(`  ✓ sets.json — ${abbreviations.length} set abbreviations found`);
    return abbreviations;
  } catch (error) {
    findings.push({
      level:   "error",
      phase,
      code:    "SETS_JSON_MISSING",
      message: "sets.json could not be loaded. " +
               (error instanceof Error ? error.message : String(error)),
    });
    console.log("  ✗ sets.json — file not found");
    return [];
  }
}

// ── Phase 2: Per-Set Card JSON ────────────────────────────────────────────────

function checkImageUrlDomains(setData: SetData, setAbbr: string, phase: string, findings: Finding[]): void {
  const wrongDomainUrls: string[] = [];

  for (const hero of setData.heroes) {
    // why: D-15101 — HeroCardSchema.imageUrl was removed (EC-162). Hero image
    // URLs now live on physicalCards[].imageUrl; iterate that surface instead.
    for (const physicalCard of hero.physicalCards) {
      if (!physicalCard.imageUrl.includes(R2_DOMAIN)) {
        wrongDomainUrls.push(physicalCard.imageUrl);
      }
    }
  }
  for (const mastermind of setData.masterminds) {
    for (const card of mastermind.cards) {
      if (!card.imageUrl.includes(R2_DOMAIN)) {
        wrongDomainUrls.push(card.imageUrl);
      }
    }
  }
  for (const villainGroup of setData.villains) {
    for (const card of villainGroup.cards) {
      if (!card.imageUrl.includes(R2_DOMAIN)) {
        wrongDomainUrls.push(card.imageUrl);
      }
    }
  }
  for (const scheme of setData.schemes) {
    if (!scheme.imageUrl.includes(R2_DOMAIN)) {
      wrongDomainUrls.push(scheme.imageUrl);
    }
  }

  if (wrongDomainUrls.length > 0) {
    findings.push({
      level:   "warning",
      phase,
      setAbbr,
      code:    "IMAGEURL_WRONG_DOMAIN",
      message: `Set "${setAbbr}" has ${wrongDomainUrls.length} card(s) whose imageUrl does not ` +
               `point to "${R2_DOMAIN}". First offending URL: ${wrongDomainUrls[0]}`,
    });
  }
}

function checkDataQualityIssues(setData: SetData, setAbbr: string, phase: string, findings: Finding[]): void {
  let objectStringCount = 0;

  for (const hero of setData.heroes) {
    for (const card of hero.cards) {
      // why: abilities is optional in schema — some sets have stripped card records
      for (const abilityText of card.abilities ?? []) {
        if (abilityText === "[object Object]") {
          objectStringCount++;
        }
      }
    }
  }
  for (const mastermind of setData.masterminds) {
    for (const card of mastermind.cards) {
      for (const abilityText of card.abilities) {
        if (abilityText === "[object Object]") {
          objectStringCount++;
        }
      }
    }
  }
  for (const villainGroup of setData.villains) {
    for (const card of villainGroup.cards) {
      for (const abilityText of card.abilities) {
        if (abilityText === "[object Object]") {
          objectStringCount++;
        }
      }
    }
  }

  if (objectStringCount > 0) {
    findings.push({
      level:   "warning",
      phase,
      setAbbr,
      code:    "DATA_QUALITY_OBJECT_STRING",
      message: `Set "${setAbbr}" has ${objectStringCount} ability text line(s) containing ` +
               `the literal string "[object Object]". These are pipeline artifacts — treat as blank in the UI.`,
    });
  }
}

/**
 * Load and validate a single per-set card JSON file.
 * Uses fetchSetFile() which knows the correct path for each mode.
 */
async function loadAndValidateSet(abbr: string, phase: string, findings: Finding[]): Promise<SetData | null> {
  try {
    const rawData     = await fetchSetFile(abbr);
    const parseResult = SetDataSchema.safeParse(rawData);

    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      findings.push({
        level:   "error",
        phase,
        setAbbr: abbr,
        code:    "SET_SCHEMA_INVALID",
        message: `Set "${abbr}" failed schema validation. ` +
                 `First issue at [${firstIssue?.path.join(".") ?? "?"}]: ` +
                 `${firstIssue?.message ?? "unknown"}. ` +
                 `Total schema issues: ${parseResult.error.issues.length}.`,
      });
      return null;
    }

    return parseResult.data;
  } catch (error) {
    const location = IS_R2_MODE
      ? `${R2_BASE_URL}/metadata/${abbr}.json`
      : `${SETS_DIR}/${abbr}.json`;
    findings.push({
      level:   "error",
      phase,
      setAbbr: abbr,
      code:    "SET_FILE_MISSING",
      message: `Set file "${abbr}.json" could not be loaded from "${location}". ` +
               (error instanceof Error ? error.message : String(error)),
    });
    return null;
  }
}

async function checkPerSetCardData(
  setAbbreviations: string[],
  findings:         Finding[]
): Promise<Map<string, SetData>> {
  const phase      = "Phase 2 — Per-Set Card JSON";
  const sourceNote = IS_R2_MODE ? "(R2)" : `(${SETS_DIR})`;
  console.log(`\n── ${phase} ${sourceNote} (${setAbbreviations.length} sets) ──`);

  const loadedSets = new Map<string, SetData>();

  for (const abbr of setAbbreviations) {
    const setData = await loadAndValidateSet(abbr, phase, findings);
    if (setData === null) {
      continue;
    }
    loadedSets.set(abbr, setData);
    checkImageUrlDomains(setData, abbr, phase, findings);
    checkDataQualityIssues(setData, abbr, phase, findings);
  }

  const phaseFindings = findings.filter((f) => f.phase === phase);
  const errorCount    = phaseFindings.filter((f) => f.level === "error").length;
  const warningCount  = phaseFindings.filter((f) => f.level === "warning").length;

  console.log(`  ✓ ${loadedSets.size} of ${setAbbreviations.length} sets passed schema validation`);
  if (errorCount > 0) {
    console.log(`  ✗ ${errorCount} set(s) failed`);
  }
  if (warningCount > 0) {
    console.log(`  ⚠ ${warningCount} data quality warning(s)`);
  }

  return loadedSets;
}

// ── Phase 3: Cross-References ─────────────────────────────────────────────────

function checkAlwaysLeadsConsistency(allSets: Map<string, SetData>, findings: Finding[]): void {
  const phase = "Phase 3 — Cross-References";

  for (const [setAbbr, setData] of allSets) {
    const villainGroupSlugs = new Set(setData.villains.map((vg) => vg.slug));

    for (const mastermind of setData.masterminds) {
      for (const leadSlug of mastermind.alwaysLeads) {
        if (!villainGroupSlugs.has(leadSlug)) {
          // why: some leads reference henchman groups, not villain groups —
          // these are valid but can't be resolved against villain slugs alone
          findings.push({
            level:   "warning",
            phase,
            setAbbr,
            code:    "ALWAYS_LEADS_UNRESOLVED",
            message: `Mastermind "${mastermind.slug}" in "${setAbbr}" has alwaysLeads entry ` +
                     `"${leadSlug}" that doesn't match any villain group slug in this set. ` +
                     "May be a henchman group — verify against the physical cards.",
          });
        }
      }
    }
  }
}

function checkSlugUniqueness(allSets: Map<string, SetData>, findings: Finding[]): void {
  const phase      = "Phase 3 — Cross-References";
  const slugToSets = new Map<string, string[]>();

  for (const [setAbbr, setData] of allSets) {
    for (const hero of setData.heroes) {
      slugToSets.set(hero.slug, [...(slugToSets.get(hero.slug) ?? []), setAbbr]);
    }
    for (const mastermind of setData.masterminds) {
      slugToSets.set(mastermind.slug, [...(slugToSets.get(mastermind.slug) ?? []), setAbbr]);
    }
    for (const villainGroup of setData.villains) {
      slugToSets.set(villainGroup.slug, [...(slugToSets.get(villainGroup.slug) ?? []), setAbbr]);
    }
    for (const scheme of setData.schemes) {
      slugToSets.set(scheme.slug, [...(slugToSets.get(scheme.slug) ?? []), setAbbr]);
    }
  }

  let duplicateCount = 0;
  for (const [slug, setsWithSlug] of slugToSets) {
    if (setsWithSlug.length > 1) {
      duplicateCount++;
      findings.push({
        level:   "warning",
        phase,
        code:    "DUPLICATE_SLUG",
        message: `Slug "${slug}" appears in ${setsWithSlug.length} sets: ${setsWithSlug.join(", ")}. ` +
                 "This may cause ON CONFLICT collisions during PostgreSQL seeding.",
      });
    }
  }

  if (duplicateCount > 0) {
    console.log(`  ⚠ ${duplicateCount} duplicate slug(s) found across sets`);
  } else {
    console.log("  ✓ No duplicate slugs found across sets");
  }
}

async function checkCrossReferences(allSets: Map<string, SetData>, findings: Finding[]): Promise<void> {
  const phase = "Phase 3 — Cross-References";
  console.log(`\n── ${phase} ──`);

  checkAlwaysLeadsConsistency(allSets, findings);
  checkSlugUniqueness(allSets, findings);

  const phaseFindings = findings.filter((f) => f.phase === phase);
  if (phaseFindings.length === 0) {
    console.log("  ✓ All cross-reference checks passed");
  }
}

// ── Phase 4: Image Spot-Checks ────────────────────────────────────────────────

function collectSpotCheckUrls(allSets: Map<string, SetData>): string[] {
  const imageUrls: string[] = [];

  for (const setData of allSets.values()) {
    const firstMastermindCard = setData.masterminds[0]?.cards[0];
    if (firstMastermindCard?.imageUrl) {
      imageUrls.push(firstMastermindCard.imageUrl);
    }
    const firstVillainCard = setData.villains[0]?.cards[0];
    if (firstVillainCard?.imageUrl) {
      imageUrls.push(firstVillainCard.imageUrl);
    }
    // why: D-15101 — HeroCardSchema.imageUrl was removed (EC-162). Spot-check
    // the first hero's first physicalCard.imageUrl instead.
    const firstHeroPhysicalCard = setData.heroes[0]?.physicalCards[0];
    if (firstHeroPhysicalCard?.imageUrl) {
      imageUrls.push(firstHeroPhysicalCard.imageUrl);
    }
  }

  return imageUrls;
}

async function spotCheckImages(allSets: Map<string, SetData>): Promise<ImageCheckResult> {
  const phase = "Phase 4 — Image Spot-Checks";

  if (SKIP_IMAGES) {
    console.log(`\n── ${phase} — SKIPPED (SKIP_IMAGES=1) ──`);
    return { urlsChecked: 0, failedUrls: [] };
  }

  const imageUrls = collectSpotCheckUrls(allSets);
  console.log(`\n── ${phase} (${imageUrls.length} URLs, ~3 per set) ──`);

  const failedUrls: string[] = [];

  for (const imageUrl of imageUrls) {
    const httpStatus = await headRequest(imageUrl);

    if (httpStatus !== 200) {
      const statusLabel = httpStatus === 0 ? "network failure or timeout" : `HTTP ${httpStatus}`;
      console.log(`  ✗ ${imageUrl} — ${statusLabel}`);
      failedUrls.push(imageUrl);
    }

    // why: sequential delay prevents R2 rate-limiting during bulk spot-checks
    await sleep(IMAGE_DELAY_MS);
  }

  const passedCount = imageUrls.length - failedUrls.length;
  console.log(`  ✓ ${passedCount} of ${imageUrls.length} images returned HTTP 200`);

  if (failedUrls.length > 0) {
    console.log(`  ✗ ${failedUrls.length} image(s) not reachable`);
  }

  return { urlsChecked: imageUrls.length, failedUrls };
}

// ── Reporting ─────────────────────────────────────────────────────────────────

function countTotalCards(allSets: Map<string, SetData>): { heroCount: number; cardCount: number } {
  let heroCount = 0;
  let cardCount = 0;

  for (const setData of allSets.values()) {
    heroCount += setData.heroes.length;
    for (const hero of setData.heroes)    { cardCount += hero.cards.length; }
    for (const mm of setData.masterminds) { cardCount += mm.cards.length; }
    for (const vg of setData.villains)    { cardCount += vg.cards.length; }
    cardCount += setData.schemes.length;
  }

  return { heroCount, cardCount };
}

function printFindingsSummary(findings: Finding[], imageResult: ImageCheckResult): void {
  const errorFindings   = findings.filter((f) => f.level === "error");
  const warningFindings = findings.filter((f) => f.level === "warning");

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log(`  Errors:   ${errorFindings.length}`);
  console.log(`  Warnings: ${warningFindings.length}`);

  if (!SKIP_IMAGES) {
    console.log(`  Images:   ${imageResult.failedUrls.length} of ${imageResult.urlsChecked} failed`);
  }

  if (errorFindings.length > 0) {
    console.log("\n  Errors that must be fixed before publishing:");
    for (const finding of errorFindings) {
      const location = finding.setAbbr ? `[${finding.setAbbr}] ` : "";
      console.log(`  ✗ ${location}${finding.message}`);
    }
  }

  if (warningFindings.length > 0) {
    console.log("\n  Warnings to review:");
    for (const finding of warningFindings) {
      const location = finding.setAbbr ? `[${finding.setAbbr}] ` : "";
      console.log(`  ⚠ ${location}${finding.message}`);
    }
  }

  if (imageResult.failedUrls.length > 0) {
    console.log("\n  Image URLs that returned non-200:");
    for (const failedUrl of imageResult.failedUrls) {
      console.log(`  ✗ ${failedUrl}`);
    }
  }
}

async function writeValidationReport(
  findings:    Finding[],
  imageResult: ImageCheckResult,
  allSets:     Map<string, SetData>
): Promise<void> {
  const { heroCount, cardCount } = countTotalCards(allSets);

  const report: ValidationReport = {
    generatedAt:    new Date().toISOString(),
    mode:           IS_R2_MODE ? "r2" : "local",
    metadataSource: IS_R2_MODE ? `${R2_BASE_URL}/metadata/` : METADATA_DIR,
    setsSource:     IS_R2_MODE ? `${R2_BASE_URL}/metadata/` : SETS_DIR,
    summary: {
      totalErrors:   findings.filter((f) => f.level === "error").length,
      totalWarnings: findings.filter((f) => f.level === "warning").length,
      imagesFailed:  imageResult.failedUrls.length,
      imagesChecked: imageResult.urlsChecked,
      setsIndexed:   allSets.size,
      setsLoaded:    allSets.size,
      totalHeroes:   heroCount,
      totalCards:    cardCount,
    },
    findings,
    imageFailures: imageResult.failedUrls,
  };

  await mkdir(resolve("dist"), { recursive: true });
  await writeFile(HEALTH_OUT, JSON.stringify(report, null, 2), "utf8");
  console.log(`\n📄  Report written → ${HEALTH_OUT}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("════════════════════════════════════════════════════════════");
  console.log("  Legendary Arena — R2 Validation Report");
  console.log(`  Run at: ${new Date().toISOString()}`);
  if (IS_R2_MODE) {
    console.log(`  Mode:     R2 (${R2_BASE_URL})`);
  } else {
    console.log(`  Mode:     Local`);
    console.log(`  Metadata: ${METADATA_DIR}`);
    console.log(`  Sets:     ${SETS_DIR}`);
  }
  if (SKIP_IMAGES) {
    console.log("  Images:   SKIPPED (SKIP_IMAGES=1)");
  }
  console.log("════════════════════════════════════════════════════════════");

  const allFindings: Finding[] = [];

  const setAbbreviations = await checkRegistryConfig(allFindings);

  if (setAbbreviations.length === 0) {
    console.error("\n❌  No set abbreviations found — cannot continue. Fix Phase 1 errors and re-run.\n");
    process.exit(1);
  }

  const allSets = await checkPerSetCardData(setAbbreviations, allFindings);
  await checkCrossReferences(allSets, allFindings);
  const imageResult = await spotCheckImages(allSets);

  printFindingsSummary(allFindings, imageResult);
  await writeValidationReport(allFindings, imageResult, allSets);

  const hasErrors =
    allFindings.some((f) => f.level === "error") ||
    imageResult.failedUrls.length > 0;

  if (hasErrors) {
    console.error("\n❌  Validation FAILED — fix errors before publishing to R2.\n");
    process.exit(1);
  }

  console.log("\n✅  Validation passed!\n");
}

main().catch((unexpectedError) => {
  console.error("\n❌  Unexpected error (this is a code bug, not a data issue):");
  console.error(unexpectedError);
  process.exit(1);
});
