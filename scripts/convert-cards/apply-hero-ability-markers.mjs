/**
 * apply-hero-ability-markers.mjs
 *
 * Offline idempotent script that reads the curated map
 * inputs/hero-ability-markers.json and appends structured
 * `[keyword:rescue:N]` / `[keyword:reveal]` / `[keyword:reveal:N]`
 * markup tokens to the specified hero ability lines in data/cards/*.json.
 * Mirrors apply-effect-markers.mjs (WP-187/EC-214 villain marker pattern).
 *
 * WP-215 wired the rescue and reveal executors and established the markup
 * syntax. WP-216 (this script) extends that markup to every unambiguous
 * rescue/reveal hero ability line across all 40 card sets.
 *
 * Modes:
 *   (default, apply)  — read hero-ability-markers.json and append the
 *                       correct markup token to each specified ability line
 *                       in data/cards/*.json. Idempotent: a re-run over
 *                       already-marked data produces a zero-line diff.
 *                       Prints an apply summary on completion.
 *   --propose         — read-only dry-run. Phrase-scans every hero ability
 *                       line matching rescue/reveal patterns and prints one
 *                       candidate row per match (sorted, no color codes).
 *                       Writes nothing. Used to bootstrap hero-ability-markers.json.
 *   --validate        — read-only. Verifies that every non-deferred entry in
 *                       hero-ability-markers.json is already present in the
 *                       card data. Exits non-zero if any drift is detected.
 *
 * Loud-fail (non-zero exit, full-sentence message) on:
 *   - a markupToken value not in the three locked forms (D-21601)
 *   - a named setAbbr / heroSlug / cardSlug / abilityIndex that does not
 *     resolve to an existing ability line in the card data
 *   - card data structural violations (missing heroes[], slug, cards[], abilities[])
 *
 * Usage:
 *   node scripts/convert-cards/apply-hero-ability-markers.mjs
 *   node scripts/convert-cards/apply-hero-ability-markers.mjs --propose
 *   node scripts/convert-cards/apply-hero-ability-markers.mjs --validate
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CARDS_DIR = join(__dirname, '..', '..', 'data', 'cards');
const MAP_PATH = join(__dirname, 'inputs', 'hero-ability-markers.json');

// why: only valid token forms per D-21601, D-21701, D-21702, D-21802, D-21901, D-21902 — catch typos before data is written
const VALID_TOKEN_PATTERN =
  /^\[keyword:rescue:\d+\]$|^\[keyword:reveal\]$|^\[keyword:reveal:\d+\]$|^\[keyword:reveal-ko\]$|^\[keyword:reveal-min:\d+\]$|^\[keyword:reveal-ko-or-draw:\d+\]$|^\[keyword:reveal-cost-attack\]$|^\[keyword:reveal-odd-draw\]$/;

// ─── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Reads and parses a set's card-data JSON file, loud-failing with a full
 * sentence if the file is missing or malformed.
 *
 * @param {string} setAbbr - The set abbreviation (e.g. "msp1").
 * @returns {object} The parsed set object.
 */
function readSetData(setAbbr) {
  const filePath = join(CARDS_DIR, `${setAbbr}.json`);
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(
      `hero-ability-markers.json names set "${setAbbr}", but its card-data file at ` +
        `${filePath} could not be read or parsed (${error.message}). Either the set ` +
        `abbreviation in the marker map is wrong, or the source data is missing or corrupt.`,
    );
    process.exit(1);
  }
}

/**
 * Validates that a set's top-level structure contains the required heroes
 * array, loud-failing with a full sentence if it is missing.
 *
 * @param {object} setData - The parsed set object.
 * @param {string} setAbbr - The set abbreviation (for error messages).
 */
function assertHeroesArray(setData, setAbbr) {
  if (!Array.isArray(setData.heroes)) {
    console.error(
      `Card data file ${setAbbr}.json does not have a top-level "heroes" array. ` +
        `The hero ability marker script can only process set files that expose a ` +
        `heroes[] field at the top level. Check whether the file is malformed or ` +
        `the wrong file is being targeted.`,
    );
    process.exit(1);
  }
}

/**
 * Resolves a hero object by its slug within a set's heroes array, loud-failing
 * if no matching hero is found.
 *
 * @param {object[]} heroes - The set's heroes array.
 * @param {string} heroSlug - The hero slug to find.
 * @param {string} setAbbr - The set abbreviation (for error messages).
 * @returns {object} The matched hero object.
 */
function resolveHero(heroes, heroSlug, setAbbr) {
  for (const hero of heroes) {
    if (hero.slug === heroSlug) return hero;
  }
  const availableSlugs = heroes.map((hero) => `"${hero.slug}"`).join(', ');
  console.error(
    `hero-ability-markers.json names hero "${heroSlug}" in set "${setAbbr}", but no hero ` +
      `with that slug exists in ${setAbbr}.json. Available hero slugs: [${availableSlugs}]. ` +
      `Fix the heroSlug in the marker map, or update the source data.`,
  );
  process.exit(1);
}

/**
 * Resolves a card object by its slug within a hero's cards array, loud-failing
 * if no matching card is found.
 *
 * @param {object} hero - The hero object.
 * @param {string} cardSlug - The card slug to find.
 * @param {string} heroSlug - The hero slug (for error messages).
 * @param {string} setAbbr - The set abbreviation (for error messages).
 * @returns {object} The matched card object.
 */
function resolveCard(hero, cardSlug, heroSlug, setAbbr) {
  if (!Array.isArray(hero.cards)) {
    console.error(
      `Hero "${heroSlug}" in set "${setAbbr}" does not have a "cards" array. ` +
        `The hero ability marker script expects every hero object to expose a cards[] field. ` +
        `Check whether the file ${setAbbr}.json is malformed.`,
    );
    process.exit(1);
  }
  for (const card of hero.cards) {
    if (card.slug === cardSlug) return card;
  }
  const availableSlugs = hero.cards.map((card) => `"${card.slug}"`).join(', ');
  console.error(
    `hero-ability-markers.json names card "${cardSlug}" under hero "${heroSlug}" in set ` +
      `"${setAbbr}", but no card with that slug exists in that hero's cards[] array. ` +
      `Available card slugs: [${availableSlugs}]. Fix the cardSlug in the marker map, ` +
      `or update the source data.`,
  );
  process.exit(1);
}

/**
 * Resolves an ability string by index within a card's abilities array,
 * loud-failing if the array is missing or the index is out of bounds.
 *
 * @param {object} card - The card object.
 * @param {number} abilityIndex - The 0-based ability index.
 * @param {string} cardSlug - The card slug (for error messages).
 * @param {string} heroSlug - The hero slug (for error messages).
 * @param {string} setAbbr - The set abbreviation (for error messages).
 * @returns {string} The ability line at that index.
 */
function resolveAbility(card, abilityIndex, cardSlug, heroSlug, setAbbr) {
  if (!Array.isArray(card.abilities)) {
    console.error(
      `Card "${cardSlug}" under hero "${heroSlug}" in set "${setAbbr}" does not have an ` +
        `"abilities" array. The hero ability marker script expects every card object to ` +
        `expose an abilities[] field of strings. Check whether the file ${setAbbr}.json ` +
        `is malformed.`,
    );
    process.exit(1);
  }
  if (abilityIndex >= card.abilities.length) {
    console.error(
      `hero-ability-markers.json specifies abilityIndex=${abilityIndex} for card "${cardSlug}" ` +
        `under hero "${heroSlug}" in set "${setAbbr}", but that card only has ` +
        `${card.abilities.length} ability line(s) (indices 0–${card.abilities.length - 1}). ` +
        `The index is out of bounds — either the map has drifted from the card data, or the ` +
        `abilityIndex in the map is wrong.`,
    );
    process.exit(1);
  }
  return card.abilities[abilityIndex];
}

/**
 * Validates that a markupToken value is one of the three locked forms,
 * loud-failing with a full sentence if it is not.
 *
 * @param {string} markupToken - The candidate token from the map.
 * @param {string} cardSlug - The card slug (for error messages).
 * @param {string} heroSlug - The hero slug (for error messages).
 * @param {string} setAbbr - The set abbreviation (for error messages).
 */
function assertValidToken(markupToken, cardSlug, heroSlug, setAbbr) {
  // why: only valid token forms per D-21601, D-21701, D-21702 — catch typos before data is written
  if (!VALID_TOKEN_PATTERN.test(markupToken)) {
    console.error(
      `hero-ability-markers.json uses markupToken "${markupToken}" for card "${cardSlug}" ` +
        `under hero "${heroSlug}" in set "${setAbbr}", which is not one of the locked token ` +
        `forms: "[keyword:rescue:N]", "[keyword:reveal]", "[keyword:reveal:N]", ` +
        `"[keyword:reveal-ko]", "[keyword:reveal-min:N]", or "[keyword:reveal-ko-or-draw:N]". ` +
        `Fix the typo in the marker map, or — if a new token form is genuinely needed — ` +
        `update DECISIONS.md first (a separate WP) and then this validation.`,
    );
    process.exit(1);
  }
}

/**
 * Lists all set abbreviations by reading the card-data directory.
 *
 * @returns {string[]} Set abbreviations sorted lexicographically.
 */
function listAllSetAbbrs() {
  return readdirSync(CARDS_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace(/\.json$/, ''))
    .sort();
}

// ─── Apply mode ──────────────────────────────────────────────────────────────

/**
 * Apply mode (default): reads the curated map, processes every non-deferred
 * entry, appends the markup token to the specified ability line, and writes
 * each modified set file back. Idempotent: a re-run over already-marked data
 * produces zero writes. Prints an apply summary on completion.
 *
 * why (surgical text replacement, not JSON.stringify of the whole object):
 * card-data files may have custom-formatted sections. Replacing only the
 * matched ability line keeps the diff bounded to exactly the lines that
 * gained a marker, so diffs stay clean and unrelated formatting is preserved.
 *
 * @param {object} markerMap - The parsed hero-ability-markers.json.
 */
function runApply(markerMap) {
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const setAbbr of Object.keys(markerMap).sort()) {
    if (setAbbr.startsWith('_')) continue;

    const setData = readSetData(setAbbr);
    assertHeroesArray(setData, setAbbr);

    const entries = markerMap[setAbbr];
    let fileText = readFileSync(join(CARDS_DIR, `${setAbbr}.json`), 'utf8');
    let fileModified = false;

    for (const entry of entries) {
      const { heroSlug, cardSlug, abilityIndex, markupToken } = entry;
      assertValidToken(markupToken, cardSlug, heroSlug, setAbbr);

      const hero = resolveHero(setData.heroes, heroSlug, setAbbr);
      const card = resolveCard(hero, cardSlug, heroSlug, setAbbr);
      const abilityLine = resolveAbility(card, abilityIndex, cardSlug, heroSlug, setAbbr);

      totalProcessed++;

      if (abilityLine.includes(markupToken)) {
        // why: token already present — re-runs must produce zero diff
        totalSkipped++;
        continue;
      }

      const markedLine = `${abilityLine} ${markupToken}`;
      const oldJson = JSON.stringify(abilityLine);
      const newJson = JSON.stringify(markedLine);

      const heroAnchorPosition = fileText.indexOf(`"slug": "${heroSlug}"`);
      if (heroAnchorPosition < 0) {
        console.error(
          `Could not anchor hero "${heroSlug}" in ${setAbbr}.json text while applying the ` +
            `markup token for card "${cardSlug}". The file shape is not what the script expects.`,
        );
        process.exit(1);
      }

      const cardAnchorPosition = fileText.indexOf(`"slug": "${cardSlug}"`, heroAnchorPosition);
      if (cardAnchorPosition < 0) {
        console.error(
          `Could not anchor card "${cardSlug}" after hero "${heroSlug}" in ${setAbbr}.json ` +
            `text. The file shape is not what the script expects.`,
        );
        process.exit(1);
      }

      const linePosition = fileText.indexOf(oldJson, cardAnchorPosition);
      if (linePosition < 0) {
        console.error(
          `Could not locate ability line ${oldJson} after the anchor for hero "${heroSlug}" ` +
            `card "${cardSlug}" in ${setAbbr}.json. The file shape is not what the script expects.`,
        );
        process.exit(1);
      }

      fileText = fileText.slice(0, linePosition) + newJson + fileText.slice(linePosition + oldJson.length);
      fileModified = true;
      totalUpdated++;
    }

    if (fileModified) {
      writeFileSync(join(CARDS_DIR, `${setAbbr}.json`), fileText, 'utf8');
    }
  }

  console.log(`Processed: ${totalProcessed} entries`);
  console.log(`Updated:   ${totalUpdated} lines`);
  console.log(`Skipped:   ${totalSkipped} lines (already marked)`);
}

// ─── Propose mode ─────────────────────────────────────────────────────────────

/**
 * Returns true when a reveal-ko ability line is an in-scope candidate.
 * Matches: "Reveal the top card" + exact "If it costs 0, KO it." phrase.
 * Excludes lines with "or more" (multi-effect lines like cosm/captain-mar-vell),
 * "draw it." (mixed draw+KO lines like ssw2/silk), and "You may KO" (optional
 * KO forms). Only unconditional cost-0-KO-only lines are in scope.
 *
 * @param {string} line - The ability line to test.
 * @returns {boolean} True if the line is an in-scope reveal-ko candidate.
 */
function isRevealKoCandidate(line) {
  if (!line.includes('Reveal the top card of your deck.')) return false;
  // why: D-21803 extends detection to cover the [icon:vp] zero-cost form used
  // by dkcy/punisher; [icon:vp] is display-only and does not affect executor logic
  const ZERO_COST_KO_RE = /costs\s+0(?:\[icon:vp\])?,\s*KO it/i;
  if (!ZERO_COST_KO_RE.test(line)) return false;
  if (line.includes('or more')) return false;
  if (line.includes('draw it.')) return false;
  if (line.includes('Villain Deck') || line.includes('Master Strike')) return false;
  if (line.includes('[keyword:reveal')) return false;
  return true;
}

/**
 * Returns true when an ability line is an in-scope reveal-ko-or-draw candidate.
 * Requires BOTH a zero-cost-KO phrase AND a range-draw phrase to be present.
 * This makes it structurally mutually exclusive with isRevealKoCandidate, which
 * requires the KO phrase but excludes any line containing 'draw it.' (D-21802).
 *
 * @param {string} line - The ability line to test.
 * @returns {boolean} True if the line is an in-scope reveal-ko-or-draw candidate.
 */
function isRevealKoOrDrawCandidate(line) {
  const ZERO_COST_KO_RE = /costs\s+0,\s*KO it/i;
  const RANGE_DRAW_RE = /costs\s+\d+\s+or\s+\d+,\s*draw it/i;
  if (!ZERO_COST_KO_RE.test(line)) return false;
  if (!RANGE_DRAW_RE.test(line)) return false;
  if (line.includes('Villain Deck') || line.includes('Master Strike')) return false;
  if (line.includes('Otherwise')) return false;
  if (line.includes('[keyword:reveal')) return false;
  return true;
}

/**
 * Determines the suggested markup token for an in-scope reveal-ko-or-draw line.
 * Extracts the two cost values from "costs N or M, draw it" and returns the max.
 * Returns null on regex failure — callers must guard before emitting a row.
 *
 * @param {string} line - The reveal-ko-or-draw ability line.
 * @returns {string|null} The markup token, or null if the range regex does not match.
 */
function suggestRevealKoOrDrawToken(line) {
  const RANGE_DRAW_RE = /costs\s+(\d+)\s+or\s+(\d+),\s*draw it/i;
  const match = RANGE_DRAW_RE.exec(line);
  if (!match) return null;
  const maxCost = Math.max(Number(match[1]), Number(match[2]));
  return `[keyword:reveal-ko-or-draw:${maxCost}]`;
}

/**
 * Returns true when an ability line is an in-scope reveal-cost-attack candidate.
 * "Reveal the top card of your deck. You get +[icon:attack] equal to its cost."
 *
 * @param {string} line - The ability line to test.
 * @returns {boolean} True if the line is an in-scope reveal-cost-attack candidate.
 */
function isRevealCostAttackCandidate(line) {
  if (!/Reveal the top card of your deck\./i.test(line)) return false;
  if (!line.includes('[icon:attack]')) return false;
  if (!/equal to (?:its|that card's) cost/i.test(line)) return false;
  if (line.includes('Villain Deck') || line.includes('Master Strike')) return false;
  if (line.includes('Otherwise')) return false;
  if (line.includes('[keyword:reveal-cost-attack]')) return false;
  return true;
}

/**
 * Returns true when an ability line is an in-scope reveal-odd-draw candidate.
 * "Reveal the top card of your deck. If its cost is odd, draw it."
 *
 * @param {string} line - The ability line to test.
 * @returns {boolean} True if the line is an in-scope reveal-odd-draw candidate.
 */
function isRevealOddDrawCandidate(line) {
  if (!/Reveal the top card of your deck\./i.test(line)) return false;
  if (!/odd[-\s]?(?:numbered\s+)?cost|cost is odd/i.test(line)) return false;
  if (!/draw it/i.test(line)) return false;
  if (line.includes('Villain Deck') || line.includes('Master Strike')) return false;
  if (line.includes('Otherwise')) return false;
  if (line.includes('[keyword:reveal-odd-draw]')) return false;
  return true;
}

/**
 * Returns true when a reveal-min ability line is an in-scope candidate.
 * Matches: "Reveal the top card" + "draw it." + "costs N or more" pattern,
 * with no "Otherwise" clause (which signals a deferred multi-branch line).
 *
 * @param {string} line - The ability line to test.
 * @returns {boolean} True if the line is an in-scope reveal-min candidate.
 */
function isRevealMinCandidate(line) {
  if (!line.includes('Reveal the top card of your deck.')) return false;
  if (!line.includes('draw it.')) return false;
  if (line.includes('Villain Deck') || line.includes('Master Strike')) return false;
  if (line.includes('top two') || line.includes('top three') || line.includes('top four')) return false;
  if (line.includes('[keyword:Spectrum]') || line.includes('[keyword:Focus]')) return false;
  if (line.includes('[keyword:reveal')) return false;
  if (line.includes('Otherwise')) return false;
  return /costs \d+ or more/.test(line);
}

/**
 * Determines the suggested markup token for an in-scope reveal-min line.
 * Extracts N from "costs N or more" / "costs at least N" patterns.
 *
 * @param {string} line - The reveal-min ability line.
 * @returns {string} The markup token to suggest.
 */
function suggestRevealMinToken(line) {
  const orMoreMatch = line.match(/costs (\d+) or more/);
  if (orMoreMatch) {
    return `[keyword:reveal-min:${orMoreMatch[1]}]`;
  }
  const atLeastMatch = line.match(/costs at least (\d+)/);
  if (atLeastMatch) {
    return `[keyword:reveal-min:${atLeastMatch[1]}]`;
  }
  const vpOrMoreMatch = line.match(/costs (\d+)\[icon:vp\] or more/);
  if (vpOrMoreMatch) {
    return `[keyword:reveal-min:${vpOrMoreMatch[1]}]`;
  }
  return '[keyword:reveal-min:1]';
}

/**
 * Returns true when a rescue ability line is in-scope (a candidate).
 * Matches the authoritative Candidate Detection Rules from WP-216.
 *
 * @param {string} line - The ability line to test.
 * @returns {boolean} True if the line is an in-scope rescue candidate.
 */
function isRescueCandidate(line) {
  if (!line.includes('Rescue a Bystander.')) return false;
  if (line.includes('for each')) return false;
  if (line.includes('Fight:') || line.includes('[keyword:Ambush]')) return false;
  if (line.includes('Whenever you Rescue')) return false;
  return true;
}

/**
 * Returns true when a reveal ability line is an in-scope candidate.
 * Matches the authoritative Candidate Detection Rules from WP-216.
 *
 * @param {string} line - The ability line to test.
 * @returns {boolean} True if the line is an in-scope reveal candidate.
 */
function isRevealCandidate(line) {
  if (!line.includes('Reveal the top card of your deck.')) return false;
  if (!line.includes('draw it.')) return false;
  if (line.includes('Villain Deck') || line.includes('Master Strike')) return false;
  if (line.includes('top two') || line.includes('top three') || line.includes('top four')) return false;
  if (line.includes('[keyword:Spectrum]') || line.includes('[keyword:Focus]')) return false;
  const hasVpIcon = /costs \d+\[icon:vp\] or less/.test(line);
  const hasPlain = /costs \d+ or less/.test(line);
  return hasVpIcon || hasPlain;
}

/**
 * Determines the suggested markup token for an in-scope rescue line.
 *
 * @param {string} _line - The rescue ability line (unused; all in-scope lines get rescue:1).
 * @returns {string} The markup token to suggest.
 */
function suggestRescueToken(_line) {
  return '[keyword:rescue:1]';
}

/**
 * Determines the suggested markup token for an in-scope reveal line.
 * Variant A (has [icon:vp] in costs) → [keyword:reveal].
 * Variant B (no [icon:vp]) → [keyword:reveal:N] where N is the extracted threshold.
 *
 * @param {string} line - The reveal ability line.
 * @returns {string} The markup token to suggest.
 */
function suggestRevealToken(line) {
  const vpIconMatch = line.match(/costs (\d+)\[icon:vp\] or less/);
  if (vpIconMatch) {
    return '[keyword:reveal]';
  }
  const plainMatch = line.match(/costs (\d+) or less/);
  if (plainMatch) {
    return `[keyword:reveal:${plainMatch[1]}]`;
  }
  return '[keyword:reveal]';
}

/**
 * Collects --propose candidate rows for one set's heroes. Scans every hero
 * card ability line and emits a row for each in-scope rescue or reveal match.
 *
 * @param {string} setAbbr - The set abbreviation.
 * @param {object} setData - The parsed set object.
 * @param {object[]} rows - The accumulator array (mutated in place).
 */
function collectProposeRowsForSet(setAbbr, setData, rows) {
  if (!Array.isArray(setData.heroes)) return;
  for (const hero of setData.heroes) {
    if (!Array.isArray(hero.cards)) continue;
    for (const card of hero.cards) {
      if (!Array.isArray(card.abilities)) continue;
      for (let abilityIndex = 0; abilityIndex < card.abilities.length; abilityIndex++) {
        const line = card.abilities[abilityIndex];
        if (isRescueCandidate(line)) {
          rows.push({
            setAbbr,
            heroSlug: hero.slug,
            cardSlug: card.slug,
            abilityIndex,
            abilityText: line,
            suggestedToken: suggestRescueToken(line),
          });
        } else if (isRevealKoOrDrawCandidate(line)) {
          // why: compound-first ordering is defense-in-depth; functions are already
          // mutually exclusive by construction (D-21802)
          const suggestedToken = suggestRevealKoOrDrawToken(line);
          if (suggestedToken !== null) {
            rows.push({
              setAbbr,
              heroSlug: hero.slug,
              cardSlug: card.slug,
              abilityIndex,
              abilityText: line,
              suggestedToken,
            });
          }
        } else if (isRevealCostAttackCandidate(line)) {
          rows.push({
            setAbbr,
            heroSlug: hero.slug,
            cardSlug: card.slug,
            abilityIndex,
            abilityText: line,
            suggestedToken: '[keyword:reveal-cost-attack]',
          });
        } else if (isRevealOddDrawCandidate(line)) {
          rows.push({
            setAbbr,
            heroSlug: hero.slug,
            cardSlug: card.slug,
            abilityIndex,
            abilityText: line,
            suggestedToken: '[keyword:reveal-odd-draw]',
          });
        } else if (isRevealKoCandidate(line)) {
          rows.push({
            setAbbr,
            heroSlug: hero.slug,
            cardSlug: card.slug,
            abilityIndex,
            abilityText: line,
            suggestedToken: '[keyword:reveal-ko]',
          });
        } else if (isRevealMinCandidate(line)) {
          rows.push({
            setAbbr,
            heroSlug: hero.slug,
            cardSlug: card.slug,
            abilityIndex,
            abilityText: line,
            suggestedToken: suggestRevealMinToken(line),
          });
        } else if (isRevealCandidate(line)) {
          rows.push({
            setAbbr,
            heroSlug: hero.slug,
            cardSlug: card.slug,
            abilityIndex,
            abilityText: line,
            suggestedToken: suggestRevealToken(line),
          });
        }
      }
    }
  }
}

/**
 * --propose mode: scans every set's hero ability lines, prints one sorted
 * candidate row per in-scope rescue/reveal match, and writes nothing.
 * Output format (locked per D-21601):
 *   <setAbbr> | <heroSlug> | <cardSlug> | abilityIndex=<n> | "<abilityText>" | suggested=<token>
 */
function runPropose() {
  const setAbbrs = listAllSetAbbrs();
  const rows = [];
  for (const setAbbr of setAbbrs) {
    const setData = readSetData(setAbbr);
    collectProposeRowsForSet(setAbbr, setData, rows);
  }

  rows.sort((left, right) => {
    const leftKey = `${left.setAbbr}|${left.heroSlug}|${left.cardSlug}|${left.abilityIndex}`;
    const rightKey = `${right.setAbbr}|${right.heroSlug}|${right.cardSlug}|${right.abilityIndex}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });

  for (const row of rows) {
    console.log(
      `${row.setAbbr} | ${row.heroSlug} | ${row.cardSlug} | abilityIndex=${row.abilityIndex} | "${row.abilityText}" | suggested=${row.suggestedToken}`,
    );
  }
}

// ─── Validate mode ────────────────────────────────────────────────────────────

/**
 * --validate mode: verifies that every non-deferred entry in the curated map
 * is already present in the card data (i.e. the markup token appears in the
 * expected ability line). Exits non-zero if any drift is detected. Read-only.
 *
 * @param {object} markerMap - The parsed hero-ability-markers.json.
 */
function runValidate(markerMap) {
  const driftItems = [];

  for (const setAbbr of Object.keys(markerMap).sort()) {
    if (setAbbr.startsWith('_')) continue;

    const setData = readSetData(setAbbr);
    assertHeroesArray(setData, setAbbr);

    const entries = markerMap[setAbbr];
    for (const entry of entries) {
      const { heroSlug, cardSlug, abilityIndex, markupToken } = entry;
      assertValidToken(markupToken, cardSlug, heroSlug, setAbbr);

      const hero = resolveHero(setData.heroes, heroSlug, setAbbr);
      const card = resolveCard(hero, cardSlug, heroSlug, setAbbr);
      const abilityLine = resolveAbility(card, abilityIndex, cardSlug, heroSlug, setAbbr);

      if (!abilityLine.includes(markupToken)) {
        driftItems.push(`  ${setAbbr} / ${heroSlug} / ${cardSlug} / abilityIndex=${abilityIndex}: expected "${markupToken}" not found in ability line.`);
      }
    }
  }

  if (driftItems.length > 0) {
    console.error(
      `--validate detected ${driftItems.length} drift item(s) — the following map entries ` +
        `are not present in the card data. Run apply mode to fix:\n` +
        driftItems.join('\n'),
    );
    process.exit(1);
  }

  console.log(`--validate: all map entries present in card data. No drift detected.`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Entry point. Routes to --propose (read-only scan), --validate (read-only
 * drift check), or apply (default, writes markup to data/cards/*.json).
 */
function main() {
  const isPropose = process.argv.includes('--propose');
  const isValidate = process.argv.includes('--validate');

  if (isPropose) {
    runPropose();
    return;
  }

  const markerMap = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

  if (isValidate) {
    runValidate(markerMap);
    return;
  }

  runApply(markerMap);
}

main();
