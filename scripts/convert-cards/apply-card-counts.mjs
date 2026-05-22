/**
 * apply-card-counts.mjs
 *
 * Companion to convert-cards-v15.mjs that handles the four sets the
 * @master-strike/data npm package never shipped (2099, amwp, wpnx, wtif).
 *
 * Reads existing data/cards/{abbr}.json files and overlays the hero
 * cardCounts entries from inputs/hero-card-counts.json. Writes the JSON
 * back with the same JSON.stringify(..., null, 2) formatting the main
 * converter uses so diffs stay clean.
 *
 * Loud-fail on:
 *   - missing target JSON file
 *   - patch card name that doesn't match any card in the hero's cards[]
 *
 * Usage:
 *   node scripts/convert-cards/apply-card-counts.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const INPUTS_DIR = join(__dirname, 'inputs');
const OUTPUT_DIR = join(__dirname, '..', '..', 'data', 'cards');
const PATCH_PATH = join(INPUTS_DIR, 'hero-card-counts.json');
const VILLAIN_COUNTS_PATH = join(INPUTS_DIR, 'villain-card-counts.json');
const LEADS_PATH = join(INPUTS_DIR, 'leads.json');
const SCHEME_DECK_COUNTS_PATH = join(INPUTS_DIR, 'scheme-deck-counts.json');
const R2_BASE_URL = 'https://images.legendary-arena.com';

// why: WP-167 / D-16703 — the four outlier sets are produced only by this
// script, so it must apply the same villain `copies` overlay and the same
// alwaysLeads/ledBy wiring as convert-cards-v15.mjs; otherwise outlier-set
// villains silently lack `copies` and outlier leads stay empty.
const VILLAIN_CARD_COUNTS = JSON.parse(readFileSync(VILLAIN_COUNTS_PATH, 'utf8'));
const LEADS = JSON.parse(readFileSync(LEADS_PATH, 'utf8'));

// why: WP-169 / D-16803 — apply-card-counts.mjs is the only producer for the 4
// outlier sets (2099, amwp, wpnx, wtif), so without this overlay any scheme
// entry for those sets in scheme-deck-counts.json is silently ignored.
const SCHEME_DECK_COUNTS = JSON.parse(readFileSync(SCHEME_DECK_COUNTS_PATH, 'utf8'));

/**
 * Builds a per-set list of villain-group lead rows from the raw leads.json
 * array, skipping the PLACEHOLDER_DELETE_THIS row and the comment-only markers
 * ({ "_set": ... }, { "_unassigned": ... }) that carry no usable "set" string.
 * Only villainGroups[] is read; henchmen leads and the "_anyVillainGroup"
 * wildcard are out of scope for villain-group wiring.
 *
 * @param leadsArray - The parsed leads.json array.
 * @returns Map of setAbbr → array of { mastermind, villainGroups } rows.
 */
function buildLeadsBySet(leadsArray) {
  const leadsBySet = new Map();
  for (const row of leadsArray) {
    if (typeof row.set !== 'string' || row.set === 'PLACEHOLDER_DELETE_THIS') {
      continue;
    }
    const groups = Array.isArray(row.villainGroups) ? row.villainGroups : [];
    const existing = leadsBySet.get(row.set) ?? [];
    existing.push({ mastermind: row.mastermind, villainGroups: groups });
    leadsBySet.set(row.set, existing);
  }
  return leadsBySet;
}

const LEADS_BY_SET = buildLeadsBySet(LEADS);

/**
 * Appends a value to an array only when not already present, keeping the
 * alwaysLeads[] / ledBy[] arrays deduplicated and the script idempotent.
 */
function pushUnique(targetArray, value) {
  if (!targetArray.includes(value)) targetArray.push(value);
}

/**
 * Writes the optional `copies` field onto every villain card in an outlier set,
 * sourced from villain-card-counts.json (setAbbr → groupSlug → cardSlug) or
 * defaulting to 2. Loud-fails if a count-file entry names a group/card that does
 * not exist in the set.
 *
 * @param setData - The outlier set object (mutated in place).
 * @param setAbbr - The set abbreviation being processed.
 * @throws If a villain-card-counts.json entry matches no group/card in the set.
 */
function applyVillainCopies(setData, setAbbr) {
  const villainGroups = Array.isArray(setData.villains) ? setData.villains : [];
  const setCounts = VILLAIN_CARD_COUNTS[setAbbr];

  for (const villainGroup of villainGroups) {
    const groupCounts = setCounts?.[villainGroup.slug];
    for (const card of villainGroup.cards ?? []) {
      const declaredCopies = groupCounts?.[card.slug];
      // why: default 2 is the common 4-villain × 2 villain-group composition
      // (D-16703); per-card outliers come only from villain-card-counts.json.
      card.copies = typeof declaredCopies === 'number' ? declaredCopies : 2;
    }
  }

  if (!setCounts) return;

  const groupBySlug = new Map();
  for (const villainGroup of villainGroups) groupBySlug.set(villainGroup.slug, villainGroup);
  for (const [groupSlug, cardCounts] of Object.entries(setCounts)) {
    const villainGroup = groupBySlug.get(groupSlug);
    if (!villainGroup) {
      throw new Error(
        `villain-card-counts.json entry for set "${setAbbr}" names villain group ` +
          `"${groupSlug}", which does not match any villain group in ${setAbbr}.json. ` +
          `Fix the group slug in villain-card-counts.json or update the source data.`,
      );
    }
    const cardSlugsInGroup = new Set((villainGroup.cards ?? []).map((card) => card.slug));
    for (const cardSlug of Object.keys(cardCounts)) {
      if (!cardSlugsInGroup.has(cardSlug)) {
        throw new Error(
          `villain-card-counts.json entry for set "${setAbbr}" group "${groupSlug}" ` +
            `names villain card "${cardSlug}", which does not match any card in that ` +
            `group. Group "${groupSlug}" has cards: ` +
            `[${[...cardSlugsInGroup].map((slug) => `"${slug}"`).join(', ')}]. ` +
            `Fix the card slug in villain-card-counts.json or update the source data.`,
        );
      }
    }
  }
}

/**
 * Populates mastermind.alwaysLeads[] and villainGroup.ledBy[] for an outlier set
 * from leads.json (D-16703), symmetric and deduplicated. Loud-fails if a lead
 * row names a mastermind or villain group absent from the set.
 *
 * @param setData - The outlier set object (mutated in place).
 * @param setAbbr - The set abbreviation being processed.
 * @throws If a leads.json row names a mastermind/group absent from the set.
 */
function applyLeadsRelationships(setData, setAbbr) {
  const leadRows = LEADS_BY_SET.get(setAbbr) ?? [];

  const mastermindBySlug = new Map();
  for (const mastermind of setData.masterminds ?? []) {
    mastermindBySlug.set(mastermind.slug, mastermind);
  }
  const groupBySlug = new Map();
  for (const villainGroup of setData.villains ?? []) {
    groupBySlug.set(villainGroup.slug, villainGroup);
  }

  for (const leadRow of leadRows) {
    const mastermind = mastermindBySlug.get(leadRow.mastermind);
    if (!mastermind) {
      throw new Error(
        `leads.json names mastermind "${leadRow.mastermind}" for set "${setAbbr}", ` +
          `which does not match any mastermind in ${setAbbr}.json. Fix the mastermind ` +
          `slug in leads.json or update the source data.`,
      );
    }
    for (const groupSlug of leadRow.villainGroups) {
      const villainGroup = groupBySlug.get(groupSlug);
      if (!villainGroup) {
        throw new Error(
          `leads.json names villain group "${groupSlug}" led by mastermind ` +
            `"${leadRow.mastermind}" for set "${setAbbr}", which does not match any ` +
            `villain group in ${setAbbr}.json. Fix the group slug in leads.json or ` +
            `update the source data.`,
        );
      }
      pushUnique(mastermind.alwaysLeads, groupSlug);
      pushUnique(villainGroup.ledBy, leadRow.mastermind);
    }
  }
}

/**
 * Applies optional villainDeckTwistCount / villainDeckBystanderCount onto the
 * schemes of an outlier set from scheme-deck-counts.json (WP-169 / D-16803),
 * mirroring applySchemeDeckCounts in convert-cards-v15.mjs. Each count is
 * assigned independently and only when present; an omitted count leaves the
 * scheme's field absent so the engine default applies. Loud-fails (before
 * writeFileSync) if a scheme slug matches no scheme in the set, or if an entry
 * carries neither count.
 *
 * @param setData - The outlier set object (mutated in place).
 * @param setAbbr - The set abbreviation being processed.
 * @throws If an entry matches no scheme, or carries neither count.
 */
function applySchemeDeckCounts(setData, setAbbr) {
  const setSchemeCounts = SCHEME_DECK_COUNTS[setAbbr];
  if (!setSchemeCounts) return;

  const schemeBySlug = new Map();
  for (const scheme of setData.schemes ?? []) {
    schemeBySlug.set(scheme.slug, scheme);
  }
  for (const [schemeSlug, counts] of Object.entries(setSchemeCounts)) {
    const scheme = schemeBySlug.get(schemeSlug);
    if (!scheme) {
      throw new Error(
        `scheme-deck-counts.json entry for set "${setAbbr}" names scheme ` +
          `"${schemeSlug}", which does not match any scheme in ${setAbbr}.json. ` +
          `Fix the scheme slug in scheme-deck-counts.json or update the source data.`,
      );
    }
    const hasTwistCount = typeof counts.villainDeckTwistCount === 'number';
    const hasBystanderCount = typeof counts.villainDeckBystanderCount === 'number';
    if (!hasTwistCount && !hasBystanderCount) {
      throw new Error(
        `scheme-deck-counts.json entry for set "${setAbbr}" scheme "${schemeSlug}" ` +
          `carries neither villainDeckTwistCount nor villainDeckBystanderCount. Every ` +
          `entry must specify at least one count (D-16803); remove the entry or add a count.`,
      );
    }
    // why: assign each count only when present so an omitted count keeps the
    // scheme's engine default (8 twists / numPlayers bystanders) per D-16803;
    // never write an undefined-valued key.
    if (hasTwistCount) {
      scheme.villainDeckTwistCount = counts.villainDeckTwistCount;
    }
    if (hasBystanderCount) {
      scheme.villainDeckBystanderCount = counts.villainDeckBystanderCount;
    }
  }
}

// why: WP-135 D-13501 fallback map — kept in lockstep with the same map
// in convert-cards-v15.mjs so outlier-set heroes that lack cardCounts
// data still get a positive integer count from rarityLabel.
const RARITY_LABEL_FALLBACK_COUNT = {
  'Common':     5,
  'Common 1':   5,
  'Common 2':   5,
  'Common 3':   5,
  'Common 4':   5,
  'Uncommon':   3,
  'Uncommon 2': 3,
  'Rare':       1,
};

/**
 * Builds the R2 image URL for a hero physical card from its sides array.
 * Mirrors heroImageUrl in convert-cards-v15.mjs verbatim — D-13802 sort lock
 * (Array.prototype.sort() with NO comparator argument; see D-13802 for the
 * full forbidden list of locale-aware comparison APIs).
 */
function heroPhysicalImageUrl(setAbbr, heroSlug, sides) {
  const sortedSides = sides.slice().sort();
  const filename = `${setAbbr}-hr-${heroSlug}-${sortedSides.join('-')}.webp`;
  return `${R2_BASE_URL}/${setAbbr}/${filename}`;
}

/**
 * Resolves count for a solo-auto-path physicalCard. cardCounts wins when
 * present; otherwise the rarity-label fallback; last-resort 1.
 */
function resolveSoloCardCount(hero, card) {
  if (hero.cardCounts && typeof hero.cardCounts[card.name] === 'number') {
    return hero.cardCounts[card.name];
  }
  if (card.rarityLabel && RARITY_LABEL_FALLBACK_COUNT[card.rarityLabel]) {
    return RARITY_LABEL_FALLBACK_COUNT[card.rarityLabel];
  }
  return 1;
}

/**
 * Synthesises hero.physicalCards[] for an outlier set hero via the
 * solo-auto-path (D-13803). The four outlier sets (2099, amwp, wpnx, wtif)
 * have no patch-declared physicalCards[] under Phase 1a; every cards[]
 * entry becomes a single-side physicalCard, so deck size for split-side
 * heroes in these sets is over-counted relative to the truth — that
 * wrongness is non-blocking under Phase 1a (no consumer reads
 * physicalCards[] as authoritative yet) and gets corrected when the
 * Phase 1b patch authors land per-set declarations.
 */
function synthesizeSoloPhysicalCards(setAbbr, hero) {
  return (hero.cards || []).map((card, index) => ({
    id:       `p${index + 1}`,
    count:    resolveSoloCardCount(hero, card),
    imageUrl: heroPhysicalImageUrl(setAbbr, hero.slug, [card.slug]),
    sides:    [card.slug],
  }));
}

// why: the four sets that exist in legendary-arena's data/cards/ but were
// never published to @master-strike/data. The main converter cannot touch
// them because it requires a corresponding .js source under inputs/cards/.
// New sets that meet the same criterion get added here.
const TARGET_SETS = ['2099', 'amwp', 'wpnx', 'wtif'];

const cardCountsPatch = JSON.parse(readFileSync(PATCH_PATH, 'utf8'));

console.log('🧩 Overlaying hero cardCounts onto outlier sets...\n');

let setsTouched = 0;
let heroesPopulated = 0;
let heroesSkipped = 0;

for (const setAbbr of TARGET_SETS) {
  const targetPath = join(OUTPUT_DIR, `${setAbbr}.json`);
  let setData;
  try {
    setData = JSON.parse(readFileSync(targetPath, 'utf8'));
  } catch (err) {
    throw new Error(
      `Could not read target set "${setAbbr}" at ${targetPath}: ${err.message}. ` +
        `Either the file does not exist, or it is not valid JSON. ` +
        `Adjust TARGET_SETS in apply-card-counts.mjs if this set should not be processed.`,
    );
  }

  const setPatch = cardCountsPatch[setAbbr];
  if (!setPatch) {
    console.log(`  ⊘  ${setAbbr}: no patch entries — leaving as-is`);
    continue;
  }

  if (!Array.isArray(setData.heroes)) {
    console.log(`  ⊘  ${setAbbr}: file has no heroes array — leaving as-is`);
    continue;
  }

  console.log(`Processing ${setAbbr}.json ...`);

  for (const hero of setData.heroes) {
    const heroPatch = setPatch[hero.slug];
    if (heroPatch) {
      const cardNamesInJson = new Set();
      for (const card of hero.cards ?? []) {
        if (typeof card.name === 'string') cardNamesInJson.add(card.name);
      }

      const newCardCounts = {};
      for (const [patchCardName, count] of Object.entries(heroPatch)) {
        if (count === null || count === undefined) continue;
        if (!cardNamesInJson.has(patchCardName)) {
          throw new Error(
            `Patch entry "${setAbbr}/${hero.slug}/${patchCardName}" does not match any card name ` +
              `in ${targetPath}. Hero "${hero.slug}" has cards: ` +
              `[${[...cardNamesInJson].map((n) => `"${n}"`).join(', ')}]. ` +
              `Fix the typo in inputs/hero-card-counts.json or update the source data.`,
          );
        }
        newCardCounts[patchCardName] = count;
      }

      if (Object.keys(newCardCounts).length === 0) {
        hero.cardCounts = null;
        heroesSkipped++;
        console.log(`  ⊘  ${hero.slug}: all patch entries are null — cardCounts left null`);
      } else {
        hero.cardCounts = newCardCounts;
        heroesPopulated++;
        console.log(`  ✏  ${hero.slug}: populated ${Object.keys(newCardCounts).length} card count(s)`);
      }
    } else {
      heroesSkipped++;
    }

    // why: D-15101 — hero card imageUrl removed; physicalCards[].imageUrl
    // is the sole hero image source. Strip any stale imageUrl from hero cards.
    for (const card of hero.cards ?? []) {
      delete card.imageUrl;
    }

    // why: WP-138 Phase 1a — every hero in every outlier set must carry a
    // physicalCards[] (D-13803 uniform model). Phase 1a runs solo-auto-path
    // here because no Phase 1b per-set patches are authored yet for the 4
    // outliers. Re-run after Phase 1b patches land for these sets.
    if (Array.isArray(hero.cards) && hero.cards.length > 0) {
      hero.physicalCards = synthesizeSoloPhysicalCards(setAbbr, hero);
    } else {
      hero.physicalCards = [];
    }
  }

  // WP-167: villain deck composition overlay for the outlier sets — copies on
  // every villain card plus the alwaysLeads/ledBy relationship. Throws before
  // writeFileSync so a mismatched set is never partially overwritten.
  applyVillainCopies(setData, setAbbr);
  applyLeadsRelationships(setData, setAbbr);
  // WP-169: scheme villain-deck twist/bystander counts for the outlier sets.
  // Throws before writeFileSync so a mismatched set is never partially written.
  applySchemeDeckCounts(setData, setAbbr);

  writeFileSync(targetPath, JSON.stringify(setData, null, 2), 'utf8');
  console.log(`  ✅ Saved ${targetPath}\n`);
  setsTouched++;
}

console.log(`Done. ${setsTouched} set(s) updated, ${heroesPopulated} hero(es) populated, ${heroesSkipped} skipped.`);
