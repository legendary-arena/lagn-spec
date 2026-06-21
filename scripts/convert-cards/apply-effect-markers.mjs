/**
 * apply-effect-markers.mjs
 *
 * Sibling overlay to apply-card-counts.mjs (WP-187 / EC-214; extended by
 * WP-188 / EC-215 to admit the Escape/Overrun timings). Reads the curated
 * marker map inputs/villain-effect-markers.json and appends a structured
 * `[effect:<VillainEffectKeyword>]` marker to the unambiguous subset of
 * Villain / Henchman `Ambush:` / `Fight:` / `Escape:` / `Overrun:` ability
 * lines in data/cards/*.json. WP-185's engine setup parser reads those
 * markers to dispatch Fight/Ambush effects; WP-186's parser reads the
 * Escape/Overrun markers (collapsing both prefixes to the single
 * `onEscape` timing). Without them every hook would carry `effects: []`
 * (no execution). This script is the sole author of `[effect:]` markers
 * in the card data.
 *
 * This is offline, deterministic, pure-IO data tooling — upstream of the
 * Registry layer. It adds no engine/registry/server code and modifies no
 * existing converter (convert-cards-v15.mjs, apply-card-counts.mjs).
 *
 * Modes:
 *   (default, apply)  — locate the matched timing line for each curated
 *                       entry and append its `[effect:]` token(s). Writes
 *                       the set files back as a surgical text replacement
 *                       so on-disk formatting of unrelated sections is
 *                       preserved and diffs stay clean. Idempotent
 *                       per-keyword: a re-run produces a zero-line diff.
 *   --propose         — read-only dry-run. Phrase-scans every `Ambush:` /
 *                       `Fight:` / `Escape:` / `Overrun:` line, prints one
 *                       row per candidate (`set | group | card | timing |
 *                       text | proposedKeywords`) sorted lexicographically,
 *                       and writes nothing. A non-authoritative bootstrap
 *                       for authoring the curated map (it over-captures by
 *                       design; the committed map is human-reviewed).
 *
 * Loud-fail (non-zero exit, full-sentence message) on:
 *   - a keyword in the map outside the five locked strings
 *   - a named set / villain-group / villain-card / henchman-group that
 *     does not exist in the card data
 *   - a timing key whose card matches zero or more-than-one ability line
 *     (multi-line same-timing cards cannot be disambiguated — defer them
 *     to the map's `_unassigned` block with reason "multi-line")
 *
 * Usage:
 *   node scripts/convert-cards/apply-effect-markers.mjs
 *   node scripts/convert-cards/apply-effect-markers.mjs --propose
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const INPUTS_DIR = join(__dirname, 'inputs');
const OUTPUT_DIR = join(__dirname, '..', '..', 'data', 'cards');
const MARKER_MAP_PATH = join(INPUTS_DIR, 'villain-effect-markers.json');

// why: this is a hardcoded LOCAL copy of WP-185's VILLAIN_EFFECT_KEYWORDS
// (packages/game-engine/src/rules/villainAbility.types.ts). A .mjs ops
// script cannot and must not import from packages/, so the two lists are
// kept in sync by hand. Any value in the map outside this set loud-fails,
// so if WP-185 ever changes its vocabulary this script breaks loudly on
// the new value until it is manually updated here — drift is intentional,
// never silent. The canonical append order below is also this array's
// order (so multi-marker lines are stable across runs). WP-189 added the
// sixth keyword `koHeroEachPlayer` at position 6 (engine-side); WP-190 /
// D-19002 mirrored it here byte-identically. WP-202 / D-20202 appends
// the seventh keyword `koHeroEachPlayerMag2` at position 7 (engine-side);
// this array mirrors it here byte-identically — positions 0-5 remain
// byte-identical to the post-WP-190 array, position 6 is the WP-202
// append slot. WP-214 / D-21401 appends captureHqHero* at positions 8-10;
// this array mirrors them here byte-identically. The hand-sync convention
// is the load-bearing guardrail (auto-importing from packages/ is
// explicitly forbidden — the loud-fail discipline depends on hand-keeping).
const VILLAIN_EFFECT_KEYWORDS = [
  'gainWoundEachPlayer',
  'gainWoundCurrentPlayer',
  'koHeroCurrentPlayer',
  'heroDeckTopToEscape',
  'captureBystander',
  'koHeroEachPlayer',
  'koHeroEachPlayerMag2',
  'captureHqHeroRightmost',
  'captureHqHeroHighestCost',
  'captureHqHeroLowestCost',
];

// why: WP-188 / EC-215 is the follow-on the WP-187 comment anticipated:
// the gate is widened to admit the Escape/Overrun timings against the
// same map shape, so all four villain timing prefixes are now curatable.
// `escape` and `overrun` are kept as DISTINCT map keys because the script
// matches by line prefix (line.trimStart() begins with "<Timing>:"); the
// engine-side collapse of both prefixes to the single `onEscape` timing
// is WP-186's concern, not this script's. The mechanism remains
// timing-agnostic; the rest of the file required no logic change.
const SUPPORTED_TIMINGS = ['ambush', 'fight', 'escape', 'overrun'];

/**
 * Returns true when the keyword is one of the six locked
 * VillainEffectKeyword strings. Used as the validation gate before any
 * marker is emitted so an unknown / typo'd / pluralised value can never
 * reach the card data.
 *
 * @param {string} keyword - The candidate effect keyword from the map.
 * @returns {boolean} True when the keyword is in the locked vocabulary.
 */
function isLockedEffectKeyword(keyword) {
  return VILLAIN_EFFECT_KEYWORDS.includes(keyword);
}

// why: WP-252 / D-24023 — local hand-synced copy of the engine's
// VILLAIN_EFFECT_PRIMITIVES (packages/game-engine/src/rules/villainAbility.types.ts).
// Same no-import-from-packages discipline and loud-fail-on-drift posture as
// VILLAIN_EFFECT_KEYWORDS above. The 5 primitives back the parameterized
// [effect:<primitive>:<param>...] grammar the engine parser also accepts.
const VILLAIN_EFFECT_PRIMITIVES = [
  'ko-hero',
  'gain-wound',
  'capture-hq-hero',
  'hero-deck-top-to-escape',
  'capture-bystander',
];

/**
 * Returns true when a token is a well-formed parameterized effect token
 * `<primitive>[:<param>...]`, mirroring the engine parser's grammar
 * (parseParameterizedEffect in setup/villainAbility.setup.ts). Forward-compatible:
 * no curated map entry uses this grammar yet, so the emitter output is unchanged,
 * but a future magnitude (e.g. ko-hero:each:3) validates without a vocabulary
 * expansion.
 *
 * @param {string} token - The candidate effect token.
 * @returns {boolean} True when the token is a valid parameterized effect.
 */
function isValidParameterizedEffectToken(token) {
  const parts = token.split(':');
  const primitive = parts[0];
  if (!VILLAIN_EFFECT_PRIMITIVES.includes(primitive)) return false;
  if (primitive === 'ko-hero') {
    if (parts.length === 2 && parts[1] === 'current') return true;
    if (parts.length === 3 && parts[1] === 'each' && /^[1-9][0-9]*$/.test(parts[2])) return true;
    return false;
  }
  if (primitive === 'gain-wound') {
    return parts.length === 2 && (parts[1] === 'current' || parts[1] === 'each');
  }
  if (primitive === 'capture-hq-hero') {
    return (
      parts.length === 2 &&
      (parts[1] === 'rightmost' || parts[1] === 'highest-cost' || parts[1] === 'lowest-cost')
    );
  }
  // why: hero-deck-top-to-escape and capture-bystander take no params.
  return parts.length === 1;
}

/**
 * Builds the absolute path to a set's card-data JSON file.
 *
 * @param {string} setAbbr - The set abbreviation (e.g. "core").
 * @returns {string} The absolute path to data/cards/{setAbbr}.json.
 */
function setFilePath(setAbbr) {
  return join(OUTPUT_DIR, `${setAbbr}.json`);
}

/**
 * Reads and parses a set's card-data JSON, loud-failing with a full
 * sentence if the file is missing or not valid JSON.
 *
 * @param {string} setAbbr - The set abbreviation being processed.
 * @returns {object} The parsed set object.
 * @throws If the set file cannot be read or parsed.
 */
function readSetData(setAbbr) {
  const path = setFilePath(setAbbr);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(
      `villain-effect-markers.json names set "${setAbbr}", but its card-data file ` +
        `at ${path} could not be read or parsed (${error.message}). Either the set ` +
        `abbreviation in the marker map is wrong, or the source data is missing/corrupt.`,
    );
  }
}

/**
 * Returns true when an ability line is a timing line for the given timing —
 * i.e. its leading-whitespace-trimmed form begins with "<Timing>:"
 * (case-insensitive). This is the SAME predicate WP-185's setup parser uses
 * to detect Fight/Ambush timing lines and the SAME predicate WP-186's
 * setup parser uses to detect Escape/Overrun lines (collapsing both to the
 * single `onEscape` timing engine-side); producer (this script) and
 * consumer (the engine parser) MUST agree on what counts as a timing line
 * or markers land on lines the engine reads differently. The check runs on
 * an ephemeral trimmed copy; the stored string is never altered except by
 * the append.
 *
 * @param {string} line - The raw ability line from abilities[].
 * @param {string} timing - The timing token, lowercase ("ambush" | "fight" | "escape" | "overrun").
 * @returns {boolean} True when the line is a timing line for that timing.
 */
function isTimingLine(line, timing) {
  return line.trimStart().toLowerCase().startsWith(`${timing}:`);
}

/**
 * Finds the single ability-line index that is a timing line for the given
 * timing. Loud-fails when zero or more than one line matches: a missing
 * line means the curated entry is wrong, and a multi-match means the entry
 * cannot say WHICH line the marker belongs on (any card carrying two
 * same-timing lines under the locked predicate — e.g. two `Fight:` lines or
 * two `Escape:` lines — must be deferred to `_unassigned` reason
 * "multi-line").
 *
 * @param {string[]} abilities - The card's (or henchman group's) abilities.
 * @param {string} timing - The timing token, lowercase ("ambush" | "fight" | "escape" | "overrun").
 * @param {string} entityLabel - A human label for the failing entity.
 * @returns {number} The index of the single matching ability line.
 * @throws If zero or more than one ability line matches the timing.
 */
function findSingleTimingLineIndex(abilities, timing, entityLabel) {
  const matchingIndexes = [];
  for (let index = 0; index < abilities.length; index++) {
    if (isTimingLine(abilities[index], timing)) {
      matchingIndexes.push(index);
    }
  }
  if (matchingIndexes.length === 0) {
    throw new Error(
      `villain-effect-markers.json maps a "${timing}" effect onto ${entityLabel}, but that ` +
        `entity has no ability line beginning with "${timing}:". Remove the "${timing}" entry ` +
        `from the marker map, or fix the timing/entity, or correct the source ability text.`,
    );
  }
  if (matchingIndexes.length > 1) {
    throw new Error(
      `villain-effect-markers.json maps a "${timing}" effect onto ${entityLabel}, but that ` +
        `entity has ${matchingIndexes.length} ability lines beginning with "${timing}:" — the map ` +
        `cannot say which line the marker belongs on. Defer this card to the "_unassigned" block ` +
        `with reason "multi-line" until the map shape can disambiguate multiple same-timing lines.`,
    );
  }
  return matchingIndexes[0];
}

/**
 * Validates every keyword in a curated list against the locked vocabulary,
 * loud-failing on the first unknown value. Returns the keywords sorted into
 * canonical VILLAIN_EFFECT_KEYWORDS order so a multi-marker line is byte-
 * identical regardless of the order the keywords were authored in the map.
 *
 * @param {string[]} keywords - The curated keyword list for one timing line.
 * @param {string} entityLabel - A human label for the failing entity.
 * @returns {string[]} The validated keywords in canonical order.
 * @throws If any keyword is outside the five locked strings.
 */
function validateAndOrderKeywords(keywords, entityLabel) {
  for (const keyword of keywords) {
    // why: WP-252 / D-24023 — a curated token is accepted if it is EITHER a
    // legacy VillainEffectKeyword OR a well-formed parameterized token
    // (<primitive>:<param>...), mirroring the engine parser's dual grammar.
    // No curated map entry uses the parameterized form yet, so emitter output
    // (and data/cards) stays byte-identical; the widening is forward-compat so
    // a future magnitude (ko-hero:each:3) needs no vocabulary expansion.
    if (!isLockedEffectKeyword(keyword) && !isValidParameterizedEffectToken(keyword)) {
      throw new Error(
        `villain-effect-markers.json uses effect token "${keyword}" on ${entityLabel}, which is ` +
          `neither one of the locked VillainEffectKeyword strings ` +
          `[${VILLAIN_EFFECT_KEYWORDS.map((value) => `"${value}"`).join(', ')}] nor a well-formed ` +
          `parameterized token (<primitive>:<param>...). Fix the typo in the marker map.`,
      );
    }
  }
  const ordered = [];
  for (const canonicalKeyword of VILLAIN_EFFECT_KEYWORDS) {
    if (keywords.includes(canonicalKeyword)) ordered.push(canonicalKeyword);
  }
  // why: WP-252 — parameterized tokens (none in the current map) are not in the
  // canonical legacy array; append them in input order after the legacy block
  // so they are never dropped. For the current all-legacy map this loop adds
  // nothing → emitter output is byte-identical.
  for (const token of keywords) {
    if (!isLockedEffectKeyword(token)) ordered.push(token);
  }
  return ordered;
}

/**
 * Appends `[effect:<keyword>]` token(s) at the END of an ability line,
 * per-keyword idempotent. The markers trail everything — original text
 * first, then any existing markup ([rule:Adapt], [keyword:...], order
 * preserved), then the effect token(s) in canonical order.
 *
 * why (append, not insert): keeping the human-readable effect text intact
 * and trailing the marker mirrors the existing [rule:Adapt]-style
 * trailing-marker convention, and end-of-line placement is what makes the
 * per-keyword presence check (and therefore idempotency) reliable — a
 * mid-text insert would shift offsets and break re-run stability.
 *
 * @param {string} line - The matched ability line.
 * @param {string[]} orderedKeywords - Validated keywords in canonical order.
 * @returns {string} The line with any not-yet-present effect markers appended.
 */
function appendEffectMarkers(line, orderedKeywords) {
  let updatedLine = line;
  for (const keyword of orderedKeywords) {
    const token = `[effect:${keyword}]`;
    // why: per-keyword presence guard — each [effect:X] appears at most once
    // per line, so re-running over already-marked data appends nothing and
    // the second-run git diff is empty.
    if (!updatedLine.includes(token)) {
      updatedLine = `${updatedLine} ${token}`;
    }
  }
  return updatedLine;
}

/**
 * Collects the villain marker edits for one set by reading the parsed set
 * data. Loud-fails on a missing group/card, an unknown keyword, or a
 * zero/multi timing match, so a bad entry is caught before any file write.
 * Iterates groups then cards in lexicographic order for deterministic
 * processing. Does NOT mutate the set data — it returns edit descriptors
 * that runApply applies as surgical text replacements (so the on-disk
 * formatting of unrelated sections is preserved).
 *
 * @param {object} setData - The parsed set object (read-only).
 * @param {string} setAbbr - The set abbreviation being processed.
 * @param {object} villainEntries - markerMap.villains[setAbbr].
 * @returns {object[]} Edit descriptors { section, groupSlug, cardSlug, oldLine, newLine }.
 */
function collectVillainEdits(setData, setAbbr, villainEntries) {
  const villainGroups = Array.isArray(setData.villains) ? setData.villains : [];
  const groupBySlug = new Map();
  for (const villainGroup of villainGroups) groupBySlug.set(villainGroup.slug, villainGroup);

  const edits = [];
  for (const groupSlug of Object.keys(villainEntries).sort()) {
    const villainGroup = groupBySlug.get(groupSlug);
    if (!villainGroup) {
      throw new Error(
        `villain-effect-markers.json names villain group "${groupSlug}" in set "${setAbbr}", which ` +
          `does not match any villain group in ${setAbbr}.json. Fix the group slug in the marker ` +
          `map, or update the source data.`,
      );
    }
    const cardBySlug = new Map();
    for (const card of villainGroup.cards ?? []) cardBySlug.set(card.slug, card);

    const cardEntries = villainEntries[groupSlug];
    for (const cardSlug of Object.keys(cardEntries).sort()) {
      const card = cardBySlug.get(cardSlug);
      if (!card) {
        throw new Error(
          `villain-effect-markers.json names villain card "${cardSlug}" in set "${setAbbr}" group ` +
            `"${groupSlug}", which does not match any card in that group. Group "${groupSlug}" has ` +
            `cards: [${[...cardBySlug.keys()].map((slug) => `"${slug}"`).join(', ')}]. Fix the card ` +
            `slug in the marker map, or update the source data.`,
        );
      }
      const abilities = Array.isArray(card.abilities) ? card.abilities : [];
      const entityLabel = `villain card "${setAbbr}/${groupSlug}/${cardSlug}"`;
      for (const edit of collectTimingEdits(abilities, cardEntries[cardSlug], entityLabel, 'villains', groupSlug, cardSlug)) {
        edits.push(edit);
      }
    }
  }
  return edits;
}

/**
 * Collects the henchman marker edits for one set. Henchman ability text
 * lives at the GROUP level (henchman entries carry abilities[] directly,
 * not per-card cards[]), so the marker attaches to the group's matched
 * timing line. Loud-fails on a missing group, unknown keyword, or
 * zero/multi timing match. Iterates groups in lexicographic order. Returns
 * edit descriptors (does not mutate the set data).
 *
 * @param {object} setData - The parsed set object (read-only).
 * @param {string} setAbbr - The set abbreviation being processed.
 * @param {object} henchmanEntries - markerMap.henchmen[setAbbr].
 * @returns {object[]} Edit descriptors { section, groupSlug, cardSlug, oldLine, newLine }.
 */
function collectHenchmanEdits(setData, setAbbr, henchmanEntries) {
  const henchmanGroups = Array.isArray(setData.henchmen) ? setData.henchmen : [];
  const groupBySlug = new Map();
  for (const henchmanGroup of henchmanGroups) {
    if (typeof henchmanGroup === 'object' && henchmanGroup !== null) {
      groupBySlug.set(henchmanGroup.slug, henchmanGroup);
    }
  }

  const edits = [];
  for (const groupSlug of Object.keys(henchmanEntries).sort()) {
    const henchmanGroup = groupBySlug.get(groupSlug);
    if (!henchmanGroup) {
      throw new Error(
        `villain-effect-markers.json names henchman group "${groupSlug}" in set "${setAbbr}", which ` +
          `does not match any henchman group in ${setAbbr}.json. Fix the group slug in the marker ` +
          `map, or update the source data.`,
      );
    }
    const abilities = Array.isArray(henchmanGroup.abilities) ? henchmanGroup.abilities : [];
    const entityLabel = `henchman group "${setAbbr}/${groupSlug}"`;
    // why: cardSlug is null for henchmen — their ability text is group-level,
    // so the anchored text replacement scopes by the henchman group slug only.
    for (const edit of collectTimingEdits(abilities, henchmanEntries[groupSlug], entityLabel, 'henchmen', groupSlug, null)) {
      edits.push(edit);
    }
  }
  return edits;
}

/**
 * For one entity's curated timing entry ({ ambush?, fight?, escape?,
 * overrun? }), locates each timing's single matching ability line and
 * produces an edit descriptor (old line → marker-appended line) when the
 * markers are not already present. Loud-fails on a timing key outside the
 * four locked strings so a typo'd or out-of-vocabulary timing cannot land
 * silently uncurated. Does not mutate the abilities array.
 *
 * @param {string[]} abilities - The entity's abilities[] (read-only).
 * @param {object} timingEntry - The curated { ambush?, fight?, escape?, overrun? } object.
 * @param {string} entityLabel - A human label for failure messages.
 * @param {string} section - "villains" | "henchmen" (anchor section).
 * @param {string} groupSlug - The group slug (anchor).
 * @param {string|null} cardSlug - The villain card slug, or null for henchmen.
 * @returns {object[]} Edit descriptors for lines that still need a marker.
 * @throws On unsupported timing keys, unknown keywords, or bad timing match.
 */
function collectTimingEdits(abilities, timingEntry, entityLabel, section, groupSlug, cardSlug) {
  const edits = [];
  for (const timing of Object.keys(timingEntry)) {
    if (!SUPPORTED_TIMINGS.includes(timing)) {
      throw new Error(
        `villain-effect-markers.json maps timing "${timing}" onto ${entityLabel}, but the locked ` +
          `villain-timing vocabulary is [${SUPPORTED_TIMINGS.map((value) => `"${value}"`).join(', ')}]. ` +
          `Fix the typo in the marker map, or — if a genuinely new timing is needed — expand ` +
          `SUPPORTED_TIMINGS first (a separate WP) and then this entry.`,
      );
    }
    const orderedKeywords = validateAndOrderKeywords(timingEntry[timing], entityLabel);
    const lineIndex = findSingleTimingLineIndex(abilities, timing, entityLabel);
    const oldLine = abilities[lineIndex];
    const newLine = appendEffectMarkers(oldLine, orderedKeywords);
    // why: only emit an edit when the markers are not already present, so a
    // re-run over already-marked data yields zero edits (idempotency).
    if (newLine !== oldLine) {
      edits.push({ section, groupSlug, cardSlug, oldLine, newLine });
    }
  }
  return edits;
}

/**
 * Applies one edit to the raw set-file text via an anchored, surgical
 * replacement. The matched ability line is replaced by its marker-appended
 * form in place — no other byte of the file changes, so set files with
 * custom-formatted sections (e.g. column-aligned mastermind-strike blocks)
 * keep their exact on-disk shape. The replacement is scoped: it searches
 * from the section key, then the group slug, then (for villains) the card
 * slug, then the JSON-encoded ability line — so an identical line on a
 * different card is never touched. Loud-fails if any anchor or the line is
 * not found in the text (the parse-side validation already proved they
 * exist, so a miss here means the text shape diverged unexpectedly).
 *
 * @param {string} text - The raw set-file text.
 * @param {object} edit - { section, groupSlug, cardSlug, oldLine, newLine }.
 * @returns {{ text: string, added: number }} Updated text + markers added.
 * @throws If the section, group/card anchor, or ability line is not found.
 */
function applyEditToText(text, edit) {
  const sectionPosition = text.indexOf(`"${edit.section}"`);
  if (sectionPosition < 0) {
    throw new Error(
      `Could not find the "${edit.section}" section in the set-file text while applying the ` +
        `marker for group "${edit.groupSlug}". The card-data file shape is not what the overlay expects.`,
    );
  }
  let searchPosition = text.indexOf(`"slug": "${edit.groupSlug}"`, sectionPosition);
  if (searchPosition < 0) {
    throw new Error(
      `Could not anchor group "${edit.groupSlug}" in the "${edit.section}" section text. The ` +
        `card-data file shape is not what the overlay expects.`,
    );
  }
  if (edit.cardSlug !== null) {
    searchPosition = text.indexOf(`"slug": "${edit.cardSlug}"`, searchPosition);
    if (searchPosition < 0) {
      throw new Error(
        `Could not anchor villain card "${edit.cardSlug}" after group "${edit.groupSlug}" in the ` +
          `set-file text. The card-data file shape is not what the overlay expects.`,
      );
    }
  }
  const oldJson = JSON.stringify(edit.oldLine);
  const newJson = JSON.stringify(edit.newLine);
  const linePosition = text.indexOf(oldJson, searchPosition);
  if (linePosition < 0) {
    throw new Error(
      `Could not locate ability line ${oldJson} after the anchor for group "${edit.groupSlug}"` +
        `${edit.cardSlug ? ` card "${edit.cardSlug}"` : ''} in the set-file text. The card-data ` +
        `file shape is not what the overlay expects.`,
    );
  }
  const updatedText = text.slice(0, linePosition) + newJson + text.slice(linePosition + oldJson.length);
  return { text: updatedText, added: countNewMarkers(edit.oldLine, edit.newLine) };
}

/**
 * Counts how many `[effect:` tokens the append added to a line, for
 * accurate per-run reporting (a re-run over already-marked data reports 0).
 *
 * @param {string} before - The line before the append.
 * @param {string} after - The line after the append.
 * @returns {number} The number of newly-added effect markers.
 */
function countNewMarkers(before, after) {
  const beforeCount = (before.match(/\[effect:/g) ?? []).length;
  const afterCount = (after.match(/\[effect:/g) ?? []).length;
  return afterCount - beforeCount;
}

/**
 * Apply mode (default): reads the curated map, collects villain + henchman
 * edits across the union of named sets (validating against the parsed data),
 * then applies each edit as a surgical text replacement and writes the file
 * back. Each set file is read and written once. Processes sets in
 * lexicographic order for deterministic output.
 *
 * why (surgical text replacement, not JSON.stringify of the whole object):
 * some set files carry custom-formatted sections (e.g. column-aligned
 * single-line mastermind-strike rows in the `other` block). A full
 * re-serialize would reformat those sections, producing a large diff
 * unrelated to the curated lines. Replacing only the matched ability line
 * keeps the diff bounded to exactly the lines that gained a marker.
 *
 * @param {object} markerMap - The parsed villain-effect-markers.json.
 */
function runApply(markerMap) {
  const villainsBySet = markerMap.villains ?? {};
  const henchmenBySet = markerMap.henchmen ?? {};

  const allSetAbbrs = new Set([...Object.keys(villainsBySet), ...Object.keys(henchmenBySet)]);
  const sortedSetAbbrs = [...allSetAbbrs].sort();

  console.log('🏷  Overlaying [effect:] markers onto curated Ambush/Fight lines...\n');

  let setsTouched = 0;
  let totalMarkers = 0;
  for (const setAbbr of sortedSetAbbrs) {
    const setData = readSetData(setAbbr);

    const edits = [];
    if (villainsBySet[setAbbr]) {
      for (const edit of collectVillainEdits(setData, setAbbr, villainsBySet[setAbbr])) edits.push(edit);
    }
    if (henchmenBySet[setAbbr]) {
      for (const edit of collectHenchmanEdits(setData, setAbbr, henchmenBySet[setAbbr])) edits.push(edit);
    }

    let text = readFileSync(setFilePath(setAbbr), 'utf8');
    let markersThisSet = 0;
    for (const edit of edits) {
      const result = applyEditToText(text, edit);
      text = result.text;
      markersThisSet += result.added;
    }

    writeFileSync(setFilePath(setAbbr), text, 'utf8');
    totalMarkers += markersThisSet;
    setsTouched++;
    console.log(`  ✅ ${setAbbr}.json — ${markersThisSet} new marker(s) this run`);
  }

  console.log(`\nDone. ${setsTouched} set(s) processed, ${totalMarkers} new [effect:] marker(s) appended.`);
}

// why: --propose phrase heuristics over-capture on purpose. They are an
// offline build-time bootstrap to surface candidate lines for human review;
// they are NEVER authoritative. The committed map is hand-reviewed, because
// blind phrase-injection would mis-mark "KO two of your Heroes" (magnitude
// 2), "Each villain in the city captures a Bystander" (multi-source), and
// "discards a card ... or gains a Wound" (a choice, not an unconditional
// each-player wound) — all of which phrase-match but do NOT reduce to a
// single WP-185 MVP effect.
const PROPOSE_HEURISTICS = [
  { keyword: 'gainWoundEachPlayer', pattern: /each\s+player[^.]*\bgains?\b[^.]*\bwound/i },
  { keyword: 'gainWoundCurrentPlayer', pattern: /\bgains?\s+a\s+wound/i },
  { keyword: 'koHeroCurrentPlayer', pattern: /\bKO\b[^.]*\bhero/i },
  { keyword: 'heroDeckTopToEscape', pattern: /top[^.]*\bhero\s+deck\b[^.]*\bescape/i },
  { keyword: 'captureBystander', pattern: /\bcaptures?\b[^.]*\bbystander/i },
  // why: the existing `koHeroCurrentPlayer` heuristic `/\bKO\b[^.]*\bhero/i`
  // over-captures — it matches both "KO one of your Heroes" (current-player)
  // AND "each player KOs one of their Heroes" (each-player). WP-189 split
  // these into structurally distinct engine effects (broadcast vs current-
  // player); conflating them at curation time would surface each-player
  // candidates only under the current-player keyword in --propose, hiding
  // them from human review. This pattern surfaces them distinctly so
  // reviewers can route them to the correct keyword. HEURISTIC ONLY —
  // final curation is EXACT TEXT MATCH on the canonical printed string
  // `"Fight: Each player KOs one of their Heroes."`; the committed map
  // pins the four curatable cards by exact set/group/card keys with no
  // fuzzy acceptance.
  { keyword: 'koHeroEachPlayer', pattern: /each\s+player[^.]*\bKO[^.]*\bhero/i },
  // why: the `koHeroEachPlayer` heuristic above also matches magnitude-2
  // lines because `[^.]*` is greedy and a "two" quantifier word is allowed
  // between `each player` and `hero`. WP-202 needs reviewers to see
  // magnitude-2 candidates distinctly so they route to `koHeroEachPlayerMag2`
  // rather than `koHeroEachPlayer`. This pattern requires the literal word
  // "two" between the each-player phrase and the hero token; --propose then
  // surfaces a magnitude-2 candidate under BOTH heuristics, which is the
  // signal for the reviewer to pick the magnitude-2 keyword. HEURISTIC
  // ONLY — final curation is EXACT TEXT MATCH on the canonical printed
  // string `"Escape: Each player KOs two of their Heroes."`; the
  // committed map pins the two curatable Destroyer cards by exact
  // set/group/card keys with no fuzzy acceptance, regardless of what
  // --propose surfaces (D-20203 EXACT CURATION COUNT = 2 invariant).
  { keyword: 'koHeroEachPlayerMag2', pattern: /each\s+player[^.]*\bKOs?\s+two\s+[^.]*\bhero/i },
];

/**
 * Returns the proposed keywords for one ability line by running every
 * over-capturing phrase heuristic. Used by --propose only.
 *
 * @param {string} line - The ability line (already known to be a timing line).
 * @returns {string[]} The proposed keywords in canonical order.
 */
function proposeKeywordsForLine(line) {
  const proposed = [];
  for (const heuristic of PROPOSE_HEURISTICS) {
    if (heuristic.pattern.test(line)) proposed.push(heuristic.keyword);
  }
  return proposed;
}

/**
 * Collects one --propose candidate row per Ambush/Fight ability line that
 * phrase-matches at least one keyword, across every set. Scans villains
 * (per-card) and henchmen (group-level). Rows are returned unsorted; the
 * caller sorts them lexicographically for diffable review.
 *
 * @param {string} setAbbr - The set abbreviation being scanned.
 * @param {object} setData - The parsed set object.
 * @param {object[]} rows - The accumulator array (mutated in place).
 */
function collectProposeRowsForSet(setAbbr, setData, rows) {
  for (const villainGroup of setData.villains ?? []) {
    for (const card of villainGroup.cards ?? []) {
      collectProposeRowsForAbilities(setAbbr, villainGroup.slug, card.slug, card.abilities ?? [], rows);
    }
  }
  for (const henchmanGroup of setData.henchmen ?? []) {
    if (typeof henchmanGroup !== 'object' || henchmanGroup === null) continue;
    collectProposeRowsForAbilities(setAbbr, henchmanGroup.slug, '', henchmanGroup.abilities ?? [], rows);
  }
}

/**
 * Appends a --propose row for every Ambush/Fight line in one abilities[]
 * array that phrase-matches at least one keyword.
 *
 * @param {string} setAbbr - The set abbreviation.
 * @param {string} groupSlug - The villain/henchman group slug.
 * @param {string} cardSlug - The villain card slug (empty for henchmen).
 * @param {string[]} abilities - The abilities[] array to scan.
 * @param {object[]} rows - The accumulator array (mutated in place).
 */
function collectProposeRowsForAbilities(setAbbr, groupSlug, cardSlug, abilities, rows) {
  for (const line of abilities) {
    let matchedTiming = '';
    for (const timing of SUPPORTED_TIMINGS) {
      if (isTimingLine(line, timing)) matchedTiming = timing;
    }
    if (matchedTiming === '') continue;
    const proposed = proposeKeywordsForLine(line);
    if (proposed.length === 0) continue;
    rows.push({
      set: setAbbr,
      group: groupSlug,
      card: cardSlug,
      timing: matchedTiming,
      text: line,
      proposedKeywords: proposed.join(','),
    });
  }
}

/**
 * --propose mode: scans every set's Ambush/Fight lines, prints one
 * lexicographically-sorted row per phrase-match candidate, and writes
 * nothing. The set list is read from the curated map's named sets when the
 * map exists; otherwise it scans all card-data files so the bootstrap works
 * before the map is authored.
 */
function runPropose() {
  const setAbbrs = listAllSetAbbrs();
  const rows = [];
  for (const setAbbr of setAbbrs) {
    const setData = readSetData(setAbbr);
    collectProposeRowsForSet(setAbbr, setData, rows);
  }

  rows.sort((left, right) => {
    const leftKey = `${left.set}|${left.group}|${left.card}|${left.timing}|${left.text}`;
    const rightKey = `${right.set}|${right.group}|${right.card}|${right.timing}|${right.text}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });

  console.log('set | group | card | timing | text | proposedKeywords');
  for (const row of rows) {
    console.log(
      `${row.set} | ${row.group} | ${row.card} | ${row.timing} | ${row.text} | ${row.proposedKeywords}`,
    );
  }
  console.error(`\n(${rows.length} candidate line(s); --propose is read-only and wrote nothing.)`);
}

/**
 * Lists every set abbreviation by reading the card-data directory. Used by
 * --propose so the bootstrap scan covers all sets regardless of the map.
 *
 * @returns {string[]} Set abbreviations sorted lexicographically.
 */
function listAllSetAbbrs() {
  return readdirSync(OUTPUT_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace(/\.json$/, ''))
    .sort();
}

/**
 * Entry point. Routes to --propose (read-only) or apply (default).
 */
function main() {
  const isPropose = process.argv.includes('--propose');
  if (isPropose) {
    runPropose();
    return;
  }
  const markerMap = JSON.parse(readFileSync(MARKER_MAP_PATH, 'utf8'));
  runApply(markerMap);
}

main();
