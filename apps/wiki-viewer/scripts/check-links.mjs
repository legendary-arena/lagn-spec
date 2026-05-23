#!/usr/bin/env node
// why: build-time link-integrity check per WP-139 §Non-Negotiable Constraints
// (Source content discipline). A broken internal markdown link MUST fail the
// build with a non-zero exit and a per-link diagnostic. External URLs (http,
// https, mailto, in-page #anchor) are out of scope — external availability
// is not the wiki's responsibility. Out-of-tree `../**` links are out of
// scope here too; they are rewritten to GitHub blob URLs by the Hugo render
// hook at build time and validated separately at PR-review.
// why: case-sensitive comparison even on Windows. Windows filesystem is
// case-insensitive but CI on Linux is not. A case-insensitive check would
// pass locally and fail in CI when, e.g., the body says `(Master-Strike.md)`
// and the file on disk is `master-strike.md`. The check enforces the strict
// rule so local and CI agree.
// why: fenced code blocks are stripped before scanning per EC-179. Markdown
// link syntax `[text](path)` inside a ``` fence is illustration text, not a
// navigable link — image-embedding examples in blog-post-authoring.md,
// brevo-email-pipeline.md, and wiki-viewer.md teach authors the Hugo
// /-rooted static-asset URL convention and intentionally reference paths
// that don't exist on the engine repo's filesystem. Without stripping,
// every such example trips the gate by design.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectedRoot = join(here, '..', 'content');

const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;
const FENCED_CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;

function stripFencedCodeBlocks(body) {
  return body.replace(FENCED_CODE_BLOCK_PATTERN, '');
}

function isExternal(destination) {
  return (
    destination.startsWith('http://') ||
    destination.startsWith('https://') ||
    destination.startsWith('mailto:') ||
    destination.startsWith('#') ||
    destination.startsWith('../')
  );
}

function fileExistsCaseSensitive(absolutePath) {
  if (!existsSync(absolutePath)) {
    return false;
  }
  const directory = dirname(absolutePath);
  const fileName = absolutePath.slice(directory.length + 1);
  const entries = readdirSync(directory);
  return entries.includes(fileName);
}

function checkLinks() {
  if (!existsSync(projectedRoot)) {
    throw new Error(
      `Projection target ${projectedRoot} does not exist. Run scripts/project-wiki.mjs before the link-integrity check.`
    );
  }

  const sourceFiles = readdirSync(projectedRoot).filter((name) => name.endsWith('.md'));
  const broken = [];

  for (const fileName of sourceFiles) {
    // why: D-14503 — the architecture-inventory page is generated content
    // (sole writer scripts/architecture-inventory.mjs per D-14502, amends
    // D-13810). Its body emits repo-rooted paths (docs/..., packages/...)
    // that resolve to GitHub-blob URLs at Hugo render time via the same
    // path the render-link.html hook applies to `../`-prefixed links
    // elsewhere. Excluding the file from this check is the lint-target
    // exception SCHEMA.md grants; without it, every cron regeneration
    // would trip the link-integrity gate by design.
    if (fileName === 'architecture-inventory.md') {
      continue;
    }
    const filePath = join(projectedRoot, fileName);
    const body = readFileSync(filePath, 'utf8');
    const scanBody = stripFencedCodeBlocks(body);
    const matches = scanBody.matchAll(MARKDOWN_LINK_PATTERN);
    for (const match of matches) {
      const destination = match[2].trim();
      if (isExternal(destination)) {
        continue;
      }
      // Strip in-page anchor (after `#`) for filesystem resolution.
      const anchorIndex = destination.indexOf('#');
      const pathPart = anchorIndex === -1 ? destination : destination.slice(0, anchorIndex);
      if (pathPart === '') {
        continue;
      }
      // INDEX.md is the only filename in source that the projection renames.
      // Body links written against the source name still point at the section
      // landing — accept INDEX.md as resolving to the projected _index.md.
      const resolvedName = pathPart === 'INDEX.md' ? '_index.md' : pathPart;
      const targetPath = resolve(projectedRoot, resolvedName);
      if (!fileExistsCaseSensitive(targetPath)) {
        broken.push({ source: fileName, destination, target: targetPath });
      }
    }
  }

  return broken;
}

try {
  const broken = checkLinks();
  if (broken.length > 0) {
    for (const entry of broken) {
      process.stderr.write(
        `Broken internal link: ${entry.source} → ${entry.destination} (resolved target: ${entry.target} does not exist case-sensitively)\n`
      );
    }
    process.stderr.write(
      `Link-integrity check failed with ${broken.length} broken internal link(s). Fix the source under wiki/ and re-run pnpm wiki-viewer:check-links.\n`
    );
    process.exit(1);
  }
  process.stdout.write(`Link-integrity check passed across ${readdirSync(projectedRoot).filter((name) => name.endsWith('.md')).length} projected files.\n`);
} catch (error) {
  process.stderr.write(`Link-integrity check failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
