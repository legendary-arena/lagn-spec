/**
 * convert-cards.mjs  v15
 *
 * Converts master-strike-data dist .js files into editable JSON files
 * with R2 image URLs for barefootbetters.com
 *
 * Run from your project root:
 *   node convert-cards.mjs
 *
 * Prerequisites:
 *   node convert-keywords.mjs   ← must run first to generate keywords.json and rules.json
 *
 * v9 changes:
 *   - Hero imageUrls now use {cost}{rarityCode} pattern (e.g. 3c1, 5u, 7r)
 *     instead of slot numbers. Zero collisions verified across all 40 sets.
 *   - Mastermind base and epic imageUrls drop redundant double slug:
 *     bkpt-mm-killmonger.webp (was bkpt-mm-killmonger-killmonger.webp)
 *   - Full naming convention: {set}-{prefix}-{slug(s)}.webp
 *     where prefix comes directly from card-types.json
 * v10 changes:
 *   - applyPatch regenerates imageUrl for ALL hero cards after merge
 *     ensuring slot/rarity corrections are reflected in URLs
 *     (covers appended, full-replace, and slot-correction patches)
 * v12 changes:
 *   - Card patch field-by-field merge now applies ALL fields including
 *     abilities — previously abilities were preserved from npm source
 * v14 changes:
 *   - Mastermind imageUrls from npm source only preserved when they start with "http".
 *   - parseAbilities now handles object-style ability lines (fixes [object Object] output).
 *     Extracted parsePart() helper shared by both array and object ability entries.
 * v13 changes:
 *   - Loads src/data/hero-card-counts.json and attaches cardCounts to
 *     each hero object. null entries are skipped gracefully.
 *     File is maintained manually; missing counts don't break conversion.
 * v15 changes:
 *   - Card patches support "_slug" field to rename a card's slug during merge.
 *     The patch matches the card by its current "slug", then overwrites the slug
 *     with the "_slug" value. Useful for fixing misspellings in npm source slugs.
 * v16 changes:
 *   - Hero card imageUrls now use the card's slug instead of cost+rarity+slot.
 *     Pattern: {setAbbr}-hr-{heroSlug}-{cardSlug}.webp
 *     (was:    {setAbbr}-hr-{heroSlug}-{cost}{rarityCode}{slot}.webp)
 *     Self-documenting filenames; survive slot/cost/rarity reordering in source
 *     data. Eliminates the silent-swap risk that bit Wolfsbane's Night Vision
 *     vs Wolf Out (both cost 3 common). Image migration on R2 driven by
 *     scripts/convert-cards/generate-rename-scripts.mjs.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Configuration ──────────────────────────────────────────────────────────────
// why: paths anchored to the script's own directory so the script runs
// correctly regardless of cwd. INPUTS_DIR holds raw npm-derived card sources
// plus per-set patches and hero-card-counts.json. OUTPUT_DIR points at the
// legendary-arena registry-consumed location two levels up at the repo root.
// Migrated from bbcode/modern-master-strike on 2026-05-06; @master-strike/data
// dependency is being retired in favor of in-repo data ownership.
const INPUTS_DIR  = join(__dirname, 'inputs');
const CARDS_DIR   = join(INPUTS_DIR, 'cards');
const OUTPUT_DIR  = join(__dirname, '..', '..', 'data', 'cards');
const DATA_DIR    = INPUTS_DIR;
const PATCHES_DIR = join(INPUTS_DIR, 'patches');
const R2_BASE_URL = 'https://images.barefootbetters.com';

// why: WP-138 §B / executive review §⚠️4 — `--strict` (or env
// LEGENDARY_CONVERT_STRICT=1) makes audit warnings for paired-equal
// cardCounts patterns lacking explicit physicalCards declarations fail
// conversion with a non-zero exit code (CI mode). Without --strict
// (developer-iteration mode), the same patterns emit warnings to stderr
// but the script still exits 0. CI green-state under Phase 1a expects
// --strict to FAIL until Phase 1b lands every per-set patch; locally
// dev iteration may run without --strict.
const STRICT_MODE = process.argv.includes('--strict') ||
                    process.env.LEGENDARY_CONVERT_STRICT === '1';

// why: WP-135 D-13501 fallback map — when a hero has no cardCounts
// entry for a given card, the physicalCard count derives from the
// rarity label. This mirrors RARITY_COPY_COUNT in the engine so
// solo-auto-path output matches engine reservoir expectations for
// heroes that never gained explicit cardCounts data. Numbered Common /
// Uncommon labels map to the same count as their unnumbered base
// because rarity (not slot ordering) is what drives copy count.
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

// ── Load keyword and rule lookup maps ─────────────────────────────────────────

/**
 * Builds a Map<id, label> from a JSON metadata file.
 * Falls back to empty map with a warning if file not found.
 */
function loadLabelMap(filePath, name) {
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8'));
    const map = new Map();
    for (const entry of data) {
      if (entry.id > 0 && entry.label) map.set(entry.id, entry.label);
    }
    console.log(`  Loaded ${map.size} ${name} labels`);
    return map;
  } catch (e) {
    console.warn(`  ⚠ Could not load ${filePath}: ${e.message}`);
    console.warn(`    Run "node convert-keywords.mjs" first to generate this file.`);
    return new Map();
  }
}

const KEYWORD_LABEL_MAP = loadLabelMap(join(DATA_DIR, 'keywords.json'), 'keyword');
const RULE_LABEL_MAP    = loadLabelMap(join(DATA_DIR, 'rules.json'), 'rule');

// ── Load hero card counts ──────────────────────────────────────────────────────

/**
 * Loads hero-card-counts.json — a manually maintained file mapping
 * set → hero slug → card name → count.
 * Returns a nested Map: setAbbr → heroSlug → cardName → count.
 * Missing entries (null values) are skipped gracefully.
 */
function loadCardCounts(filePath) {
  // why: hero card counts are required input — they carry per-card copy
  // overrides for sets whose rarity-to-count mapping is non-standard
  // (2099 = 5/5/3/1; AMWP = 3/3/3/2/2/1; etc.). The previous warn-and-empty-Map
  // fallback silently produced data/cards/*.json with cardCounts: null across
  // all 40 sets, which then forced the engine into the rarity-based fallback
  // map and broke any set whose rarity labels exceeded the four locked
  // values. Throwing on missing/malformed file makes a misfiled or omitted
  // input fail the run loudly instead of corrupting output.
  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  const map = new Map();
  for (const [setAbbr, heroes] of Object.entries(raw)) {
    const heroMap = new Map();
    for (const [heroSlug, cards] of Object.entries(heroes)) {
      const cardMap = new Map();
      for (const [cardName, count] of Object.entries(cards)) {
        if (count !== null && count !== undefined) cardMap.set(cardName, count);
      }
      heroMap.set(heroSlug, cardMap);
    }
    map.set(setAbbr, heroMap);
  }
  const totalHeroes = [...map.values()].reduce((n, h) => n + h.size, 0);
  const totalCards  = [...map.values()].reduce((n, hm) =>
    n + [...hm.values()].reduce((m, cm) => m + cm.size, 0), 0);
  console.log(`  Loaded card counts: ${totalCards} cards across ${totalHeroes} heroes`);
  return map;
}

const CARD_COUNTS = loadCardCounts(join(DATA_DIR, 'hero-card-counts.json'));

// ── Set abbreviation map ───────────────────────────────────────────────────────

const SET_ABBR_MAP = {
  'CoreSet':                   'core',
  'DarkCity':                  'dkcy',
  'FantasticFour':              'ff04',
  'PaintTheTownRed':            'pttr',
  'Villains':                   'vill',
  'GuardiansOfTheGalaxy':       'gotg',
  'FearItself':                 'fear',
  'ThreeDimension':             '3dtc',
  'SecretWars1':                'ssw1',
  'SecretWars2':                'ssw2',
  'CaptainAmerica':             'ca75',
  'CivilWar':                   'cvwr',
  'Deadpool':                   'dead',
  'Noir':                       'noir',
  'XMen':                       'xmen',
  'SpiderManHomecoming':        'smhc',
  'Champions':                  'chmp',
  'WorldWarHulk':               'wwhk',
  'MarvelStudios':              'msp1',
  'AntMan':                     'antm',
  'Venom':                      'vnom',
  'Dimensions':                 'dims',
  'Revelations':                'rvlt',
  'Shield':                     'shld',
  'HeroesOfAsgard':             'asrd',
  'NewMutants':                 'nmut',
  'IntoTheCosmos':              'cosm',
  'RealmOfKings':               'rlmk',
  'Annihilation':               'anni',
  'MessiahComplex':             'msmc',
  'DoctorStrange':              'dstr',
  'MSGuardiansOfTheGalaxy':     'mgtg',
  'BlackPanther':               'bkpt',
  'BlackWidow':                 'bkwd',
  'MSInfinitySaga':             'msis',
  'MidnightSuns':               'mdns',
  'MSWhatIf':                   'wtif',
  'MSAntManWasp':               'amwp',
  'Marvel2099':                 '2099',
  'WeaponX':                    'wpnx',
};

// Maps hc number → hero class slug (matches hero-classes.json and SVG filenames)
const HC_SLUG_MAP = {
  1: 'covert',
  2: 'instinct',
  3: 'ranged',
  4: 'strength',
  5: 'tech',
};

// Maps team number → team slug (matches hero-teams.json and SVG filenames)
const TEAM_SLUG_MAP = {
  0:  'unaffiliated',
  1:  'avengers',
  2:  'shield',
  3:  'spider-friends',
  4:  'x-men',
  5:  'fantastic-four',
  6:  'marvel-knights',
  7:  'x-force',
  8:  'crime-syndicate',
  9:  'sinister-six',
  10: 'foes-of-asgard',
  11: 'brotherhood',
  12: 'guardians-of-the-galaxy',
  13: 'hydra',
  14: 'cabal',
  15: 'illuminati',
  16: 'new-warriors',
  17: 'mercs-for-money',
  18: 'champions',
  19: 'warbound',
  20: 'venomverse',
  21: 'heroes-of-asgard',
  22: 'inhumans',
  23: 'x-factor-investigations',
  24: 'heroes-of-wakanda',
  25: 'guardians-of-the-multiverse',
};

// Maps icon number → icon name (matches card-info SVG filenames)
const ICON_SLUG_MAP = {
  1: 'attack',
  2: 'recruit',
  3: 'vp',
  4: 'piercing',
};

// Rarity number → hero card slot number (used in image filename)
const RARITY_TO_SLOT = {
  1: null, // Commons need special handling (common1 vs common2)
  2: 3,    // Uncommon → slot 3
  3: 4,    // Rare → slot 4
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Converts a display name to a URL-friendly slug
 * "Doctor Doom 2099" → "doctor-doom-2099"
 */
function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/s\.h\.i\.e\.l\.d\./g, 'shield')  // S.H.I.E.L.D. → shield
    .replace(/h\.y\.d\.r\.a\./g, 'hydra')        // H.Y.D.R.A. → hydra
    .replace(/['']/g, '')                              // remove apostrophes
    .replace(/[^a-z0-9]+/g, '-')                       // non-alphanumeric → hyphen
    .replace(/^-+|-+$/g, '');                          // trim leading/trailing hyphens
}

/**
 * Builds the R2 image URL for a hero card using the card's slug.
 * Solo (single-side) pattern:  {setAbbr}-hr-{heroSlug}-{cardSlug}.webp
 *   e.g. nmut-hr-wolfsbane-night-vision.webp
 * Split (two-side) pattern:    {setAbbr}-hr-{heroSlug}-{sortedA}-{sortedB}.webp
 *   e.g. bkwd-hr-falcon-winter-soldier-attune-atone.webp
 *
 * why: cardSlug-based naming makes filenames self-documenting and survives
 * any future slot/cost/rarity reordering in upstream source data. The previous
 * {cost}{rarityCode}{slot} encoding was opaque — two cards in a hero's deck
 * with the same cost and rarity (e.g. Wolfsbane's Night Vision and Wolf Out at
 * cost 3 common 1/2) could be silently swapped on R2 if their slot ordering
 * changed in source, with no way to detect the swap from the filename alone.
 *
 * why: D-13802 sort lock — the two-side filename uses
 * `Array.prototype.sort()` with NO comparator argument (UTF-16 code-unit
 * ordering). See D-13802 for the full forbidden list of locale-aware
 * comparison APIs and the rationale: locale-dependent collation would
 * produce non-deterministic URLs across environments (e.g., Turkish
 * locale's dotless-i rule would reorder any side slug containing "i").
 * The sort happens on a fresh slice so the caller's array order is never
 * mutated.
 *
 * @param setAbbr - Set abbreviation (e.g., "bkwd").
 * @param heroSlug - Hero slug (e.g., "falcon-winter-soldier").
 * @param sides - Array of one or two card-side slugs (e.g., ["attune", "atone"]).
 * @returns The full R2 image URL for the resulting physical card.
 */
function heroImageUrl(setAbbr, heroSlug, sides) {
  if (!Array.isArray(sides) || sides.length < 1 || sides.length > 2) {
    throw new Error(
      `heroImageUrl(setAbbr="${setAbbr}", heroSlug="${heroSlug}"): sides must be ` +
      `an array of length 1 or 2 (D-13802 ceiling lock); received ${JSON.stringify(sides)}.`
    );
  }
  const sortedSides = sides.slice().sort();
  const filename = `${setAbbr}-hr-${heroSlug}-${sortedSides.join('-')}.webp`;
  return `${R2_BASE_URL}/${setAbbr}/${filename}`;
}

/**
 * Builds the R2 image URL for non-hero cards using group + card slug.
 * Pattern: {setAbbr}-{prefix}-{groupSlug}-{cardSlug}.webp
 *
 * Examples:
 *   villain:   2099-vi-alchemax-enforcers-cyber-nostra.webp
 *   tactic:    2099-mt-sinister-six-2099-electro-2099.webp
 *   epic:      2099-me-sinister-six-2099-electro-2099.webp
 *   scheme:    2099-sc-pull-reality-into-cyberspace.webp  (no groupSlug)
 *   henchman:  core-hm-hand-ninjas.webp                  (no cardSlug)
 */
function groupCardImageUrl(setAbbr, prefix, groupSlug, cardSlug) {
  const filename = cardSlug
    ? `${setAbbr}-${prefix}-${groupSlug}-${cardSlug}.webp`
    : `${setAbbr}-${prefix}-${groupSlug}.webp`;
  return `${R2_BASE_URL}/${setAbbr}/${filename}`;
}

/**
 * Builds the R2 image URL for standalone cards with no group (schemes, henchmen).
 * Pattern: {setAbbr}-{prefix}-{cardSlug}.webp
 */
function standaloneImageUrl(setAbbr, prefix, cardSlug) {
  const filename = `${setAbbr}-${prefix}-${cardSlug}.webp`;
  return `${R2_BASE_URL}/${setAbbr}/${filename}`;
}

/**
 * Builds the R2 image URL for an individual henchman card inside a multi-card
 * henchman group. Pattern: {setAbbr}-hm-{groupSlug}-{cardSuffix}.webp
 *
 * The cardSuffix is derived from cardSlug with the groupSlug prefix stripped
 * when present, so we don't double-name the asset filename.
 *
 *   Tardigrade group "tardigrade", card "Tardigrade (Covert)"
 *     → cardSlug "tardigrade-covert" → suffix "covert"
 *     → amwp-hm-tardigrade-covert.webp        (matches existing patched URL)
 *
 *   Mandarin's Rings group "mandarins-rings", card "Daimonic, The White Light"
 *     → cardSlug "daimonic-the-white-light" → suffix "daimonic-the-white-light"
 *     → rvlt-hm-mandarins-rings-daimonic-the-white-light.webp
 */
function henchmanCardImageUrl(setAbbr, groupSlug, cardSlug) {
  const suffix = cardSlug.startsWith(`${groupSlug}-`)
    ? cardSlug.slice(groupSlug.length + 1)
    : cardSlug;
  return `${R2_BASE_URL}/${setAbbr}/${setAbbr}-hm-${groupSlug}-${suffix}.webp`;
}

/**
 * Parses ability arrays into readable strings with slug/label-based placeholders.
 *
 * Replacements:
 *   [hc:1]        → [hc:covert]
 *   [team:3]      → [team:spider-friends]
 *   [icon:1]      → [icon:attack]
 *   [keyword:60]  → [keyword:Undercover]
 *   [rule:8]      → [rule:Adapt]
 */
function parsePart(part) {
  if (typeof part === 'string') return part;
  // Divider — UI separator, not card text; skip it
  if (part.divider !== undefined) return '';
  if (part.keyword !== undefined) {
    // Use text override when present (e.g. { keyword: 56, text: "Switcheroo 5" })
    // This preserves the full display text including any numeric value
    if (part.text) return `[keyword:${part.text}]`;
    const label = KEYWORD_LABEL_MAP.get(part.keyword) ?? String(part.keyword);
    return `[keyword:${label}]`;
  }
  if (part.rule !== undefined) {
    const label = part.text ?? RULE_LABEL_MAP.get(part.rule) ?? String(part.rule);
    return `[rule:${label}]`;
  }
  if (part.bold !== undefined) return part.bold;
  if (part.italic !== undefined) return part.italic;
  if (part.hc !== undefined) {
    const slug = HC_SLUG_MAP[part.hc] ?? part.hc;
    return `[hc:${slug}]`;
  }
  if (part.team !== undefined) {
    const slug = TEAM_SLUG_MAP[part.team] ?? part.team;
    return `[team:${slug}]`;
  }
  if (part.icon !== undefined) {
    const slug = ICON_SLUG_MAP[part.icon] ?? part.icon;
    return `[icon:${slug}]`;
  }
  return JSON.stringify(part);
}

function parseAbilities(abilities) {
  if (!abilities) return [];
  return abilities
    .map(line => {
      if (Array.isArray(line)) {
        const parts = line.map(part => parsePart(part)).filter(s => s !== null && s !== '');
        return parts.length ? parts.join('') : null;
      }
      if (typeof line === 'object' && line !== null) return parsePart(line);
      return String(line);
    })
    .filter(line => line !== null && line !== '');  // drop dividers and empty lines
}

// ── Main conversion ────────────────────────────────────────────────────────────

function convertSet(jsFilePath, setAbbr) {
  const raw = readFileSync(jsFilePath, 'utf8');

  // why: @master-strike/data ships its dist as CommonJS (`exports.CoreSet =
  // {...}`), not ESM (`export const CoreSet = {...}`). Match either form so
  // the script works regardless of which compilation target the upstream
  // package uses. The `\{` immediately after `=\s*` skips the `exports.X =
  // void 0` declaration line that precedes the real value assignment in
  // CJS-compiled output.
  const match = raw.match(/(?:export\s+const\s+|exports\.)(\w+)\s*=\s*(\{[\s\S]*\});\s*(?:\/\/.*)?$/m);
  if (!match) {
    console.warn(`  ⚠ Could not parse export from ${jsFilePath}`);
    return null;
  }

  const exportName = match[1];
  const objStr = match[2];

  let setData;
  try {
    setData = new Function(`return ${objStr}`)();
  } catch (e) {
    console.warn(`  ⚠ Could not evaluate ${jsFilePath}: ${e.message}`);
    return null;
  }

  const result = {
    id: setData.id,
    abbr: setAbbr,
    exportName,
    heroes: [],
    masterminds: [],
    villains: [],
    henchmen: [],
    schemes: [],
    bystanders: [],
    wounds: [],
    other: [],
  };

  // ── Heroes ──────────────────────────────────────────────────────────────────
  if (setData.heroes) {
    for (const hero of setData.heroes) {
      const heroSlug = toSlug(hero.name);
      let commonCount = 0;
      let uncommonCount = 0;
      // Count total commons first so uncommon slots start after all commons
      const totalCommons = (hero.cards || []).filter(c => c.rarity === 1).length;

      const convertedCards = (hero.cards || []).map(card => {
        let slot;
        if (card.rarity === 1) {
          // Commons: slots 1, 2, 3...
          commonCount++;
          slot = commonCount;
        } else if (card.rarity === 2) {
          // Uncommons: slots start after all commons (e.g. slot 3 or 4 for standard sets,
          // slot 4 or 5 for What If sets with 3 commons)
          uncommonCount++;
          slot = totalCommons + uncommonCount;
        } else {
          // Rare: slot after all commons + uncommons
          const totalUncommons = (hero.cards || []).filter(c => c.rarity === 2).length;
          slot = totalCommons + totalUncommons + 1;
        }

        const rarityLabel =
          card.rarity === 1 ? `Common ${commonCount}` :
          card.rarity === 2 ? (uncommonCount > 1 ? `Uncommon ${uncommonCount}` : 'Uncommon') :
          card.rarity === 3 ? 'Rare' : `Rarity ${card.rarity}`;

        return {
          name: card.name,
          displayName: card.name,
          slug: toSlug(card.name),
          rarity: card.rarity,
          rarityLabel,
          slot,
          hc: card.hc != null ? (HC_SLUG_MAP[card.hc] ?? card.hc) : null,
          cost: card.cost ?? null,
          attack: card.attack ?? null,
          recruit: card.recruit ?? null,
          imageUrl: heroImageUrl(setAbbr, heroSlug, [toSlug(card.name)]),
          abilities: parseAbilities(card.abilities),
        };
      });

      // ── Card counts overlay (v13) ──────────────────────────────────────────
      // Reads from src/data/hero-card-counts.json — manually maintained.
      // Only applies counts that have been filled in (non-null).
      // Cards without a count entry are omitted from cardCounts.
      const setCountMap  = CARD_COUNTS.get(setAbbr);
      const heroCountMap = setCountMap?.get(heroSlug);
      let cardCounts = null;
      if (heroCountMap?.size) {
        cardCounts = {};
        for (const card of convertedCards) {
          const count = heroCountMap.get(card.name);
          if (count != null) cardCounts[card.name] = count;
        }
        if (!Object.keys(cardCounts).length) cardCounts = null;
      }

      result.heroes.push({
        id: hero.id,
        name: hero.name,
        slug: heroSlug,
        team: hero.team != null ? (TEAM_SLUG_MAP[hero.team] ?? hero.team) : null,
        cardCounts,
        cards: convertedCards,
      });
    }
  }

  // ── Masterminds ─────────────────────────────────────────────────────────────
  if (setData.masterminds) {
    for (const mm of setData.masterminds) {
      const mmSlug = toSlug(mm.name);
      const convertedCards = (mm.cards || []).map(card => {
        const cardSlug = toSlug(card.name ?? mm.name);
        const isEpic = (card.name ?? '').toLowerCase().startsWith('epic ');

        let mmImageUrl;
        if (isEpic) {
          // Epic: {set}-me-{mmSlug}.webp
          mmImageUrl = standaloneImageUrl(setAbbr, 'me', mmSlug);
        } else if (!card.tactic) {
          // Base mastermind: {set}-mm-{mmSlug}.webp
          mmImageUrl = standaloneImageUrl(setAbbr, 'mm', mmSlug);
        } else {
          // Tactic: {set}-mt-{mmSlug}-{cardSlug}.webp
          mmImageUrl = groupCardImageUrl(setAbbr, 'mt', mmSlug, cardSlug);
        }
        // Only preserve imageUrl from source if it is a valid R2 URL (ignore legacy /CardImages/ paths)
        if (card.imageUrl && card.imageUrl.startsWith('http')) mmImageUrl = card.imageUrl;

        return {
          name: card.name ?? mm.name,
          slug: cardSlug,
          tactic: card.tactic ?? false,
          vAttack: card.vAttack ?? null,
          imageUrl: mmImageUrl,
          abilities: parseAbilities(card.abilities),
        };
      });

      result.masterminds.push({
        id: mm.id,
        name: mm.name,
        slug: mmSlug,
        alwaysLeads: [],
        vp: mm.vp ?? null,
        cards: convertedCards,
      });
    }
  }

  // ── Villains ──────────────────────────────────────────────────────────────────
  if (setData.villains) {
    for (const vg of setData.villains) {
      const vgSlug = toSlug(vg.name);
      const convertedCards = (vg.cards || []).map(card => {
        const cardSlug = toSlug(card.name ?? vg.name);
        return {
          name: card.name ?? vg.name,
          slug: cardSlug,
          vp: card.vp ?? null,
          vAttack: card.vAttack ?? null,
          imageUrl: groupCardImageUrl(setAbbr, 'vi', vgSlug, cardSlug),
          abilities: parseAbilities(card.abilities),
        };
      });

      result.villains.push({
        id: vg.id,
        name: vg.name,
        slug: vgSlug,
        ledBy: [],
        cards: convertedCards,
      });
    }
  }

  // ── Henchmen ──────────────────────────────────────────────────────────────────
  // Single-card groups (Hand Ninjas etc.) keep the existing flat shape:
  // top-level imageUrl uses {set}-hm-{groupSlug}.webp with no per-card array.
  // Multi-card groups (Mandarin's Rings, Tardigrade, Ultron Sentries) emit a
  // `cards` array with per-card name / slug / imageUrl / abilities so the
  // viewer can show each variant individually. Top-level imageUrl falls back
  // to the first card's URL so engine consumers that read the group field
  // continue to resolve a real R2 asset.
  if (setData.henchmen) {
    for (const hm of setData.henchmen) {
      const hmSlug = toSlug(hm.name);
      const sourceCards = hm.cards || [];

      if (sourceCards.length <= 1) {
        const onlyCard = sourceCards[0];
        result.henchmen.push({
          id: hm.id,
          name: hm.name,
          slug: hmSlug,
          imageUrl: standaloneImageUrl(setAbbr, 'hm', hmSlug),
          abilities: parseAbilities(onlyCard?.abilities ?? hm.abilities),
        });
        continue;
      }

      const convertedCards = sourceCards.map(card => {
        const cardName = card.name ?? hm.name;
        const cardSlug = toSlug(cardName);
        return {
          name: cardName,
          slug: cardSlug,
          imageUrl: henchmanCardImageUrl(setAbbr, hmSlug, cardSlug),
          abilities: parseAbilities(card.abilities),
        };
      });

      result.henchmen.push({
        id: hm.id,
        name: hm.name,
        slug: hmSlug,
        imageUrl: convertedCards[0].imageUrl,
        abilities: [],
        cards: convertedCards,
      });
    }
  }

  // ── Schemes ───────────────────────────────────────────────────────────────────
  if (setData.schemes) {
    for (const sc of setData.schemes) {
      const scSlug = toSlug(sc.name);
      result.schemes.push({
        id: sc.id,
        name: sc.name,
        slug: scSlug,
        imageUrl: standaloneImageUrl(setAbbr, 'sc', scSlug),
        cards: (sc.cards || []).map(card => ({
          abilities: parseAbilities(card.abilities),
        })),
      });
    }
  }


  // ── Bystanders ────────────────────────────────────────────────────────────────
  // Bystanders are shared cards — image is standalone (no group slug needed)
  // Pattern: {setAbbr}-by-{slug}.webp
  if (setData.bystanders) {
    for (const by of setData.bystanders) {
      const bySlug = toSlug(by.name);
      result.bystanders.push({
        id: by.id,
        name: by.name,
        slug: bySlug,
        vp: by.vp ?? null,
        imageUrl: standaloneImageUrl(setAbbr, 'by', bySlug),
        cards: (by.cards || []).map(card => ({
          qtd: card.qtd ?? null,
          abilities: parseAbilities(card.abilities),
        })),
      });
    }
  }

  // ── Wounds ────────────────────────────────────────────────────────────────────
  // Wounds are shared cards — image is standalone (no group slug needed)
  // Pattern: {setAbbr}-wd-{slug}.webp  e.g. core-wd-wound.webp
  // Uses filterName if present (e.g. "Wound (Core)") to distinguish set-specific wounds
  if (setData.wounds) {
    for (const wd of setData.wounds) {
      const wdSlug = toSlug(wd.filterName ?? wd.name);
      result.wounds.push({
        id: wd.id,
        name: wd.name,
        filterName: wd.filterName ?? null,
        slug: wdSlug,
        imageUrl: standaloneImageUrl(setAbbr, 'wd', wdSlug),
        cards: (wd.cards || []).map(card => ({
          qtd: card.qtd ?? null,
          abilities: parseAbilities(card.abilities),
        })),
      });
    }
  }

  return result;
}


// ── Patch system ───────────────────────────────────────────────────────────────

/**
 * Loads a patch file for a set if one exists.
 * Patch files live in src/data/patches/{setAbbr}.patch.json
 * Each entry requires a "slug" to locate its target and "_op" to specify the action:
 *   "_op": "merge"  — find the existing item by slug and deep-merge the patch fields
 *   "_op": "append" — item does not exist in npm data, append it to the array
 * Cards within a hero/mastermind/villain are also matched by slug and merged.
 * A card patch with "_slug" renames the card's slug after matching (v15).
 *
 * Set-level fields (non-section keys):
 *   "_abilityTokenRewrite" — map of literal-string → literal-string substitutions
 *   applied to every abilities[] line in the set after all section patches have
 *   merged. Intended for fixing systematic tokenization errors in upstream npm
 *   data (e.g. phrases tagged [rule:X] that should be [keyword:X]) without
 *   duplicating full ability strings for every affected card.
 */
function applyPatch(result, setAbbr) {
  const patchPath = join(PATCHES_DIR, `${setAbbr}.patch.json`);
  if (!existsSync(patchPath)) return;

  let patch;
  try {
    patch = JSON.parse(readFileSync(patchPath, 'utf8'));
  } catch (e) {
    console.warn(`  ⚠ Could not load patch ${patchPath}: ${e.message}`);
    return;
  }

  const sections = ['heroes', 'masterminds', 'villains', 'henchmen', 'schemes', 'bystanders', 'wounds', 'other'];

  for (const section of sections) {
    if (!patch[section]) continue;
    for (const patchEntry of patch[section]) {
      const op = patchEntry._op ?? 'merge';
      const { _op, ...fields } = patchEntry;

      if (op === 'append') {
        // Add a new entry that doesn't exist in npm data
        // Auto-generate imageUrl for hero cards missing one (skip if patch set it explicitly)
        // Always regenerate hero card imageUrls under v16 cardSlug naming —
        // any explicit imageUrl in the patch is from the v9-v15 era and uses
        // the obsolete {cost}{rarityCode}{slot} pattern. Patch imageUrls for
        // hero cards are now no-ops; remove them at convenience.
        if (section === 'heroes' && fields.cards) {
          for (const card of fields.cards) {
            const cardSlug = card.slug ?? toSlug(card.name ?? '');
            if (cardSlug) {
              card.imageUrl = heroImageUrl(setAbbr, fields.slug, [cardSlug]);
            }
          }
        }
        result[section].push(fields);
        console.log(`  📎 Patch: appended ${section} "${fields.name ?? fields.slug}"`);
        continue;
      }

      if (op === 'merge') {
        // Find existing entry by slug
        const target = result[section].find(item => item.slug === fields.slug);
        if (!target) {
          console.warn(`  ⚠ Patch merge: could not find ${section} slug "${fields.slug}" — skipping`);
          continue;
        }

        // v15: _slug renames the entry's slug at top level (e.g. fixing npm source slugs)
        if (fields._slug) {
          target.slug = fields._slug;
        }

        // Merge top-level fields (except slug, _slug, cards — handle separately)
        for (const [key, val] of Object.entries(fields)) {
          if (key === 'slug' || key === '_slug' || key === 'cards') continue;
          target[key] = val;
        }

        // Card patch logic:
        // If patch card has a "name" field with real display text, it carries full data
        // Card patch logic (v12):
        // If patch cards have full display data (name + hc + cost), do a full replacement.
        // Otherwise merge field-by-field — ALL patch fields are applied including abilities,
        // while npm fields not mentioned in the patch (name, hc, cost, etc.) are preserved.
        if (fields.cards) {
          const patchHasFullData = fields.cards.some(c => c.name && c.hc !== undefined && c.cost !== undefined);
          if (patchHasFullData) {
            // Full replacement — patch contains complete card data
            target.cards = fields.cards;
          } else {
            // Field-by-field merge — applies ALL patch fields (imageUrl, slot, rarityLabel,
            // abilities, vAttack, vp, etc.) while preserving npm fields not in the patch.
            for (const patchCard of fields.cards) {
              const targetCard = target.cards?.find(c => c.slug === patchCard.slug);
              if (targetCard) {
                // v15: _slug renames the card's slug (e.g. fixing misspellings)
                if (patchCard._slug) {
                  targetCard.slug = patchCard._slug;
                }
                for (const [key, val] of Object.entries(patchCard)) {
                  if (key === 'slug' || key === '_slug') continue;
                  targetCard[key] = val;
                }
              } else {
                target.cards = target.cards ?? [];
                target.cards.push(patchCard);
              }
            }
            // Re-sort cards by slot to preserve correct display order
            if (target.cards) {
              target.cards.sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
            }
          }
        }

        // Regenerate imageUrl for ALL hero cards using the card's slug.
        // why: under v16 cardSlug naming, the URL is fully derivable from the
        // card slug — patch-set imageUrls from the v9-v15 era used the
        // {cost}{rarityCode}{slot} pattern and are now obsolete. Always
        // regenerating supersedes those stale overrides; a card-slug rename
        // via _slug also propagates to the imageUrl this way.
        if (section === 'heroes' && target.cards) {
          for (const card of target.cards) {
            if (card.slug) {
              card.imageUrl = heroImageUrl(setAbbr, target.slug, [card.slug]);
            }
          }
        }

        console.log(`  📎 Patch: merged ${section} "${fields.slug}"`);
      }
    }
  }

  // Set-level ability token rewrites — applied after all section patches so
  // they affect both npm-sourced and patch-sourced ability text.
  // why: fixes systematic upstream mis-tagging (e.g. [rule:Wound a Villain]
  // that should be [keyword:Wound a Villain]) without forcing each affected
  // card to duplicate its entire abilities array into the patch file.
  const rewriteMap = patch._abilityTokenRewrite;
  if (rewriteMap && typeof rewriteMap === 'object') {
    const rewriteEntries = Object.entries(rewriteMap);
    if (rewriteEntries.length > 0) {
      let rewriteCount = 0;
      for (const section of sections) {
        if (!result[section]) continue;
        for (const entry of result[section]) {
          if (!entry.cards) continue;
          for (const card of entry.cards) {
            if (!Array.isArray(card.abilities)) continue;
            for (let lineIndex = 0; lineIndex < card.abilities.length; lineIndex++) {
              const originalLine = card.abilities[lineIndex];
              if (typeof originalLine !== 'string') continue;
              let rewrittenLine = originalLine;
              for (const [findText, replaceText] of rewriteEntries) {
                rewrittenLine = rewrittenLine.split(findText).join(replaceText);
              }
              if (rewrittenLine !== originalLine) {
                card.abilities[lineIndex] = rewrittenLine;
                rewriteCount++;
              }
            }
          }
        }
      }
      if (rewriteCount > 0) {
        console.log(`  📎 Patch: applied ${rewriteCount} ability-token rewrite(s)`);
      }
    }
  }
}

// ── Physical card synthesis (WP-138 Phase 1a) ────────────────────────────────

/**
 * Loads a set's patch JSON file or returns null if no patch exists.
 * Mirrors applyPatch's loading; kept as a separate read so buildPhysicalCards
 * can consume the patch's hero[].physicalCards declarations without coupling
 * to applyPatch's internal mutation flow.
 */
function loadPatchFile(setAbbr) {
  const patchPath = join(PATCHES_DIR, `${setAbbr}.patch.json`);
  if (!existsSync(patchPath)) return null;
  try {
    return JSON.parse(readFileSync(patchPath, 'utf8'));
  } catch (e) {
    console.warn(`  ⚠ Could not load patch ${patchPath} for physicalCards: ${e.message}`);
    return null;
  }
}

/**
 * Resolves the deck-instance count for a given hero card, in priority order:
 *   1. hero.cardCounts[card.name] when populated (D-13701 — authoritative)
 *   2. RARITY_LABEL_FALLBACK_COUNT[card.rarityLabel] (D-13501 fallback)
 *   3. 1 (last-resort default; logged as a warning candidate)
 *
 * The function never throws; missing data yields a count of 1 with a
 * subdued log line so callers can still produce structurally-valid output.
 *
 * @param hero - The hero object with optional cardCounts.
 * @param card - The card object with optional rarityLabel.
 * @returns A positive integer count for the card's deck instances.
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
 * Synthesises hero.physicalCards[] for every hero in a converted set.
 *
 * Two paths:
 *   - Patch-declared (D-13805): the patch file lists hero.physicalCards[]
 *     entries with explicit { count, sides } pairs. IDs are assigned in
 *     declaration order (first declared = "p1") for byte-identical
 *     re-conversion stability. Image URLs are computed from the (sorted)
 *     sides via heroImageUrl per D-13802.
 *   - Solo auto-path (D-13803): no patch declaration. Every cards[] entry
 *     becomes a single-side physicalCard. IDs follow the cards[] array
 *     order (first card = "p1"). Counts come from resolveSoloCardCount.
 *
 * Audit warnings are collected for each hero whose cardCounts contains a
 * paired-equal pattern (two cards whose count matches and rarity matches)
 * but for which no patch declaration exists — these are the Phase 1b
 * worklist candidates per WP-138 §B.
 *
 * Drift validation: when a hero has both cardCounts AND patch-declared
 * physicalCards, the sum of physicalCards[].count over physicalCards
 * whose sides[] includes each side slug must equal cardCounts[displayName]
 * for that side. Drift fails conversion with a full-sentence error.
 *
 * @param result - The converted set object (mutated in place).
 * @param setAbbr - The set abbreviation.
 * @param patch - The loaded patch JSON, or null if no patch exists.
 * @param auditWarnings - Output array; warnings appended for paired-equal candidates.
 * @throws If drift validation fails for any hero with both cardCounts and patch-declared physicalCards.
 */
function buildPhysicalCards(result, setAbbr, patch, auditWarnings) {
  const patchHeroDeclarations = new Map();
  if (patch && Array.isArray(patch.heroes)) {
    for (const patchHero of patch.heroes) {
      if (Array.isArray(patchHero.physicalCards) && patchHero.physicalCards.length > 0) {
        patchHeroDeclarations.set(patchHero.slug, patchHero.physicalCards);
      }
    }
  }

  for (const hero of result.heroes) {
    const declared = patchHeroDeclarations.get(hero.slug);

    if (declared) {
      hero.physicalCards = declared.map((entry, index) => {
        const sides = entry.sides;
        return {
          id:       `p${index + 1}`,
          count:    entry.count,
          imageUrl: heroImageUrl(setAbbr, hero.slug, sides),
          sides,
        };
      });

      if (hero.cardCounts) {
        for (const [sideName, expectedCount] of Object.entries(hero.cardCounts)) {
          const card = (hero.cards || []).find(c => c.name === sideName);
          if (!card) continue;
          const sideSlug = card.slug;
          let actualCount = 0;
          for (const physicalCard of hero.physicalCards) {
            if (physicalCard.sides.includes(sideSlug)) {
              actualCount += physicalCard.count;
            }
          }
          if (actualCount !== expectedCount) {
            throw new Error(
              `Drift validation failed for set "${setAbbr}" hero "${hero.slug}": ` +
              `cardCounts["${sideName}"] = ${expectedCount} but physicalCards summing ` +
              `for side slug "${sideSlug}" = ${actualCount}. ` +
              `physicalCards[] is the authoritative deck-composition surface ` +
              `(D-13801); the patch's physicalCards declarations must sum to ` +
              `match cardCounts.`
            );
          }
        }
      }

      console.log(`  📎 Pair: hero=${hero.slug} physicalCards=${hero.physicalCards.length} ` +
                  `(${hero.physicalCards.filter(p => p.sides.length === 2).length} split, ` +
                  `${hero.physicalCards.filter(p => p.sides.length === 1).length} solo)`);
      continue;
    }

    hero.physicalCards = (hero.cards || []).map((card, index) => ({
      id:       `p${index + 1}`,
      count:    resolveSoloCardCount(hero, card),
      imageUrl: heroImageUrl(setAbbr, hero.slug, [card.slug]),
      sides:    [card.slug],
    }));

    if (hero.cardCounts) {
      const countsByValue = new Map();
      for (const [cardName, count] of Object.entries(hero.cardCounts)) {
        const list = countsByValue.get(count) ?? [];
        list.push(cardName);
        countsByValue.set(count, list);
      }
      for (const [count, cardNames] of countsByValue) {
        if (cardNames.length >= 2 && count >= 2) {
          auditWarnings.push({
            setAbbr,
            heroSlug: hero.slug,
            count,
            candidateNames: cardNames,
            message:
              `Set "${setAbbr}" hero "${hero.slug}" has ${cardNames.length} cards ` +
              `with cardCounts === ${count} (${cardNames.join(', ')}). ` +
              `This is a candidate paired-equal pattern — if these are split-side ` +
              `dual-faced cards (e.g., bkwd/falcon-winter-soldier Attune/Atone), ` +
              `add an explicit physicalCards[] declaration to ` +
              `scripts/convert-cards/inputs/patches/${setAbbr}.patch.json (Phase 1b worklist).`,
          });
        }
      }
    }
  }
}

// ── Run ────────────────────────────────────────────────────────────────────────

console.log('🃏 Converting master-strike-data JS files to JSON...\n');
if (STRICT_MODE) {
  console.log('🔒 STRICT mode: audit warnings will fail conversion (CI mode).\n');
}

mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(PATCHES_DIR, { recursive: true });

const files = readdirSync(CARDS_DIR).filter(f => f.endsWith('.js') && f !== 'index.js');
let successCount = 0;
const auditWarnings = [];

for (const file of files) {
  const jsPath = join(CARDS_DIR, file);

  const raw = readFileSync(jsPath, 'utf8');
  // why: matches both ESM (`export const X = {...}`) and CJS (`exports.X =
  // {...}`) forms. Requiring `{` immediately after the `=` filters out the
  // CJS-compiled `exports.X = void 0;` declaration line that precedes the
  // real value assignment.
  const exportMatch = raw.match(/(?:export\s+const\s+|exports\.)(\w+)\s*=\s*\{/);
  const exportName = exportMatch ? exportMatch[1] : null;
  const setAbbr = exportName ? SET_ABBR_MAP[exportName] : null;

  if (!setAbbr) {
    console.warn(`⚠ Skipping ${file} — no set abbreviation found for export "${exportName}"`);
    continue;
  }

  console.log(`Converting ${file} → ${setAbbr}.json ...`);
  const result = convertSet(jsPath, setAbbr);

  if (result) {
    applyPatch(result, setAbbr);
    const patch = loadPatchFile(setAbbr);
    buildPhysicalCards(result, setAbbr, patch, auditWarnings);
    const outputPath = join(OUTPUT_DIR, `${setAbbr}.json`);
    writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
    console.log(`  ✅ Saved ${outputPath}`);
    successCount++;
  }
}

console.log(`\n✅ Done! Converted ${successCount} sets → ${OUTPUT_DIR}`);

if (auditWarnings.length > 0) {
  console.warn(`\n⚠ Audit warnings (${auditWarnings.length}) — paired-equal cardCounts patterns lacking explicit physicalCards declarations:\n`);
  for (const warning of auditWarnings) {
    console.warn(`  - ${warning.message}`);
  }
  console.warn(`\nThese candidates form the Phase 1b worklist for split-side hero patch curation.`);
  if (STRICT_MODE) {
    console.error(`\n❌ STRICT mode: ${auditWarnings.length} audit warning(s) — exiting non-zero (CI gate).`);
    process.exit(1);
  } else {
    console.warn(`Run with --strict (or LEGENDARY_CONVERT_STRICT=1) to make these failures in CI.`);
  }
}

// why: regenerated JSONs are local-only until pushed to R2. The registry
// loader in production reads from R2 (https://images.barefootbetters.com/
// metadata/<set>.json), so a conversion that doesn't sync leaves prod
// unchanged. Print the canonical sync command so the operator doesn't
// have to remember the path mapping (data/cards/ → r2:legendary-images/metadata).
// Companion script: also re-run apply-card-counts.mjs if any of the four
// outlier sets (2099, amwp, wpnx, wtif) had cardCounts edits.
console.log('');
console.log('📤 Next step — sync to R2 (production-canonical path):');
console.log('');
console.log('  do not use rclone sync as it deletes all files in the directory and then uploads ');
console.log('  rclone copy C:\\pcloud\\BB\\DEV\\legendary-arena\\data\\cards r2:legendary-images/metadata --progress');
console.log('  rclone copy C:\\pcloud\\BB\\DEV\\legendary-arena\\data\\metadata r2:legendary-images/metadata --progress');
console.log('');
console.log('   (Run apply-card-counts.mjs first if you edited cardCounts for 2099, amwp, wpnx, or wtif.)');
console.log('   (Run node scripts/convert-cards/apply-card-counts.mjs)');