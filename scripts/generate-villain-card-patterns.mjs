#!/usr/bin/env node
/**
 * generate-villain-card-patterns.mjs — Regenerates the per-card villain
 * mechanical-pattern assignments for WP-184 (post-defect fix, 2026-05-27).
 *
 * Why per-card (not per-group): a villain "group" bundles 4-8 mechanically
 * distinct cards. The original group-level model stamped one slug onto every
 * card in the group, so the "Fight: KO Hero" chip surfaced cards that have no
 * Fight effect at all (or a different one). Classifying each CARD by its own
 * Fight / Ambush / Escape clause makes every chip filter accurate: a card
 * appears under "Fight: KO Hero" only if its own Fight clause KOs a hero.
 *
 * Output: data/metadata/villain-pattern-assignments.json keyed per-card by
 *   `{setAbbr}/{groupSlug}/{cardSlug}` → villain pattern slug.
 * Cards with no clause matching any of the 8 villain slugs are OMITTED
 * (absence = no badge, no chip membership).
 *
 * Slug semantics are honored strictly by timing:
 *   - fight-*  slugs match ONLY the Fight clause (the slug literally says "Fight:")
 *   - ambush-capture matches the Ambush OR Escape clause (capture-on-entry/escape)
 *   - ambush-cascade matches the Ambush clause (plays extra villain-deck cards)
 * A card whose only hero-KO / wound is on Ambush/Escape (with no analogous slug,
 * e.g. an "ambush-ko-hero") is left unassigned rather than mislabeled as a
 * "fight-" pattern — that is the precise failure the original pass made.
 *
 * Deterministic and auditable: run `node scripts/generate-villain-card-patterns.mjs`
 * to regenerate; re-upload to R2 with `rclone copyto` (see r2-data-checklist §A.7).
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CARDS_DIR = "data/cards";
const OUT_FILE = "data/metadata/villain-pattern-assignments.json";

/**
 * Isolates the clause that begins with `keyword` (e.g. "Fight:") within an
 * ability string, up to the next " | " delimiter. Returns null when absent.
 */
function extractClause(abilityText, keyword) {
  const lower = abilityText.toLowerCase();
  const idx = lower.indexOf(keyword.toLowerCase());
  if (idx === -1) return null;
  const rest = abilityText.slice(idx);
  const pipeIdx = rest.indexOf(" | ");
  return pipeIdx === -1 ? rest : rest.slice(0, pipeIdx);
}

function koHero(clause) {
  if (!clause) return false;
  // "KO one/two/up to two of your Heroes", "KO all your ... Heroes",
  // "KO one of your Allies", "KO a Hero from your discard/hand/the HQ".
  return /\bKO('?s)?\b[^.|]*\b(one of your|two of your|up to two of your|all your|all of your)\b[^.|]*\b(Hero|Heroes|Ally|Allies)\b/i.test(clause)
    || /\bKO('?s)?\b[^.|]*\bHero(es)?\b[^.|]*\bfrom (your|their) (hand|discard pile)\b/i.test(clause)
    || /\bKO('?s)?\b[^.|]*\bHero\b[^.|]*\bfrom the HQ\b/i.test(clause);
}

function gainHero(clause) {
  if (!clause) return false;
  return /Gain this as a Hero/i.test(clause)
    || /gain (a|an|this)[^.|]*Hero from the (HQ|KO pile)/i.test(clause);
}

function rescue(clause) {
  if (!clause) return false;
  return /\b[Rr]escue(s)?\b[^.|]*\bBystander/i.test(clause);
}

function draw(clause) {
  if (!clause) return false;
  // why: a fight-draw is a reward for the FIGHTER ("defeating this villain
  // draws cards" — for you). "Each player" / "each other player" draw-or-discard
  // effects are board-wide / opponent disruption, not a fighter reward, so they
  // do NOT qualify as fight-draw — they fall through to the Ambush clause (e.g.
  // wasteland-hawkeye -> ambush-capture) or stay unassigned. This matches the
  // plausibility intent of verify-villain-card-patterns.mjs.
  // why: keyed on "each other" / "each player" (not the noun) so a card-data
  // typo like "each other plasyer" (rvlt/dark-ms-marvel) is still caught.
  if (/\beach (other|player)\b/i.test(clause)) return false;
  return /\bDraw(s)?\b[^.|]*\bcard/i.test(clause);
}

function recruit(clause) {
  if (!clause) return false;
  return /\bget(s)?\b[^.|]*\+\s*\d*\s*\[icon:recruit\]/i.test(clause)
    || /\+\s*\d*\s*\[icon:recruit\]/i.test(clause)
    || /gain a New Recruit/i.test(clause);
}

function woundOthers(clause) {
  if (!clause) return false;
  return /\bgain(s)? (a|two|one) Wound/i.test(clause)
    || /\[keyword:Demolish\]/i.test(clause);
}

function captureBystander(clause) {
  if (!clause) return false;
  return /\bcaptures?\b[^.|]*\bBystander/i.test(clause)
    || /\bcaptures?\b[^.|]*\[keyword:(Human Shield|Hidden Witness)/i.test(clause);
}

function cascade(clause) {
  if (!clause) return false;
  return /\b[Pp]lay(s)?\b[^.|]*\bVillain Deck\b/i.test(clause)
    || /reveal the top card of the Villain Deck[^.|]*\b(play|enters the)\b/i.test(clause)
    || /\b[Pp]lay the top (two )?cards? of the Villain Deck\b/i.test(clause)
    || /A Henchman(en)? Villain[^.|]*enters the city/i.test(clause)
    || /from (your|any player's) Victory Pile enters the city/i.test(clause);
}

/**
 * Returns the single best villain pattern slug for one card, or null when the
 * card has no clause matching any slug. Fight-reward signals take precedence
 * (the WP keys villains on Fight reward first), then Ambush, then Escape.
 * Within the Fight clause the more distinctive effects win ties.
 */
function classifyVillainCard(abilities) {
  const text = (abilities ?? []).join(" | ");
  const fight = extractClause(text, "Fight:");
  const ambush = extractClause(text, "Ambush:");
  const escape = extractClause(text, "Escape:");

  // Priority 1 — Fight reward, most distinctive first.
  if (fight) {
    if (koHero(fight)) return "fight-ko-hero";
    if (gainHero(fight)) return "fight-gain-hero";
    if (rescue(fight)) return "fight-rescue";
    if (draw(fight)) return "fight-draw";
    if (recruit(fight)) return "fight-recruit";
    if (woundOthers(fight)) return "fight-wound-others";
  }
  // Priority 2 — Ambush clause.
  if (ambush) {
    if (cascade(ambush)) return "ambush-cascade";
    if (captureBystander(ambush)) return "ambush-capture";
  }
  // Priority 3 — Escape clause (capture-on-escape is still "ambush-capture"
  // semantically; escape wound maps to the only wound slug available).
  if (escape) {
    if (captureBystander(escape)) return "ambush-capture";
    if (woundOthers(escape)) return "fight-wound-others";
  }
  // Last resort — capture-on-escape already handled; check ambush capture via
  // escape and ambush wound (reveal-or-punish that fires on ambush).
  if (ambush && woundOthers(ambush)) return "fight-wound-others";
  return null;
}

async function main() {
  const setFiles = (await readdir(CARDS_DIR)).filter((f) => f.endsWith(".json"));
  const assignments = {};
  const tally = {};
  let totalCards = 0;
  let assignedCards = 0;

  for (const file of setFiles) {
    const abbr = file.replace(/\.json$/, "");
    const set = JSON.parse(await readFile(join(CARDS_DIR, file), "utf8"));
    for (const group of set.villains ?? []) {
      for (const card of group.cards ?? []) {
        totalCards++;
        const slug = classifyVillainCard(card.abilities);
        if (!slug) continue;
        assignments[`${abbr}/${group.slug}/${card.slug}`] = slug;
        tally[slug] = (tally[slug] ?? 0) + 1;
        assignedCards++;
      }
    }
  }

  // why: `_generatedBy` documents provenance; the viewer's fetch boundary
  // strips any `_`-prefixed key before Zod validation (cardPatternsClient.ts).
  const output = {
    _generatedBy: "scripts/generate-villain-card-patterns.mjs (WP-184 per-card defect fix)",
    ...assignments,
  };

  await writeFile(OUT_FILE, JSON.stringify(output, null, 2) + "\n");

  console.log(`villain cards total: ${totalCards}`);
  console.log(`villain cards assigned: ${assignedCards} (${Math.round((assignedCards / totalCards) * 100)}%)`);
  console.log(`unassigned (no qualifying clause): ${totalCards - assignedCards}`);
  console.log("distribution:");
  for (const [slug, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${slug}: ${n}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
