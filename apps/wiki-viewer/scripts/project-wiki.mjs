#!/usr/bin/env node
// why: build-time content projection per WP-139 §Locked Values / D-13810
// default. Copies docs/wiki/*.md → apps/wiki-viewer/content/ and renames
// ONLY THE COPY of INDEX.md to _index.md so Hugo treats it as the home
// page. The source under docs/wiki/ is read-only from the viewer's
// perspective; using mv/rename here would silently delete docs/wiki/INDEX.md
// and break the SCHEMA.md "Publish / Sync Boundary" contract — every commit
// would lose the canonical source of the wiki index. Cp + post-step assertion
// (line: existsSync check) is the cheap guard against that regression.
// why: case-sensitive filename handling — Windows is case-insensitive but CI
// runs on Linux; a case-insensitive copy would let `INDEX.md` and `Index.md`
// alias and hide drift that fails in CI.

import { existsSync, mkdirSync, readdirSync, copyFileSync, rmSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const wikiSource = join(repoRoot, 'docs', 'wiki');
const projectionTarget = join(here, '..', 'content');

/**
 * Project docs/wiki/*.md into apps/wiki-viewer/content/.
 *
 * Contract:
 *   - Read-only on docs/wiki/ — never modifies source files.
 *   - Idempotent — clears the projection target before copying.
 *   - Renames only the copied INDEX.md → _index.md (Hugo home page
 *     convention). The source docs/wiki/INDEX.md is preserved.
 *   - Case-sensitive filename handling.
 */
function projectWiki() {
  if (!existsSync(wikiSource)) {
    throw new Error(
      `Wiki source directory not found at ${wikiSource}. The projection step requires docs/wiki/ to exist before it runs.`
    );
  }

  // Capture pre-projection hash baseline of INDEX.md so the projection-is-copy
  // invariant can be asserted post-copy (the source must survive untouched).
  const sourceIndex = join(wikiSource, 'INDEX.md');
  if (!existsSync(sourceIndex)) {
    throw new Error(
      `Source docs/wiki/INDEX.md not found before projection. The wiki source contract requires this file at ${sourceIndex}.`
    );
  }

  // Clear and recreate the projection target. Idempotent re-runs produce
  // identical output regardless of prior state.
  if (existsSync(projectionTarget)) {
    rmSync(projectionTarget, { recursive: true, force: true });
  }
  mkdirSync(projectionTarget, { recursive: true });

  const entries = readdirSync(wikiSource, { withFileTypes: true });
  let copiedCount = 0;
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (!entry.name.endsWith('.md')) {
      continue;
    }
    const sourcePath = join(wikiSource, entry.name);
    const targetName = entry.name === 'INDEX.md' ? '_index.md' : entry.name;
    const targetPath = join(projectionTarget, targetName);
    copyFileSync(sourcePath, targetPath);
    copiedCount += 1;
  }

  // Post-step assertion: source INDEX.md must still exist. A regression that
  // swaps copyFileSync for renameSync would delete the source and trip this.
  if (!existsSync(sourceIndex)) {
    throw new Error(
      `Projection step deleted source docs/wiki/INDEX.md — must be a copy, not a move. Restore from git and fix scripts/project-wiki.mjs to use copyFileSync.`
    );
  }

  return copiedCount;
}

try {
  const count = projectWiki();
  process.stdout.write(`Projected ${count} wiki files to ${projectionTarget}\n`);
} catch (error) {
  process.stderr.write(`Wiki projection failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
