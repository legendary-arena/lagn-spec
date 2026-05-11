/**
 * Legendary Arena — R2 Data & Image Validation
 *
 * Validates the health of the Cloudflare R2 card data store.
 * Four sequential phases: registry, metadata, images, cross-set duplicates.
 *
 * Run via: pnpm validate (no .env needed — R2 is publicly readable)
 *
 * Exit code 0 = clean or warnings only. Exit code 1 = errors found.
 */

const R2_BASE_URL = 'https://images.legendary-arena.com';

const DELAY_BETWEEN_SETS_MS = 50;
// why: R2 rate-limits aggressive parallel fetches. A 50ms pause between
// sequential set fetches keeps us well under the limit for 40+ sets.

let errorCount = 0;
let warningCount = 0;
let missingImageCount = 0;

const errors = [];
const warnings = [];

/**
 * Pauses execution for the specified number of milliseconds.
 * @param {number} milliseconds - Duration to sleep
 * @returns {Promise<void>}
 */
function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

/**
 * Records an error with a full-sentence message.
 * @param {string} message - Human-readable error description
 */
function recordError(message) {
  errorCount++;
  errors.push(message);
  console.log(`    ERROR: ${message}`);
}

/**
 * Records a warning with a full-sentence message.
 * @param {string} message - Human-readable warning description
 */
function recordWarning(message) {
  warningCount++;
  warnings.push(message);
  console.log(`    WARN:  ${message}`);
}

// ---------------------------------------------------------------------------
// Phase 1 — Registry Check
// ---------------------------------------------------------------------------

/**
 * Fetches the set index from R2 and returns the list of set abbreviations.
 * Uses metadata/sets.json as the registry source.
 * @returns {Promise<Array<{abbr: string, name: string}>>} Array of set entries
 */
async function checkRegistry() {
  console.log('REGISTRY');

  const registryUrl = `${R2_BASE_URL}/metadata/sets.json`;

  try {
    const response = await fetch(registryUrl, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) {
      recordError(`Registry fetch failed: ${registryUrl} returned HTTP ${response.status}.`);
      return [];
    }

    const setEntries = await response.json();

    if (!Array.isArray(setEntries)) {
      recordError('Registry JSON is not an array. Expected an array of set entries.');
      return [];
    }

    if (setEntries.length === 0) {
      recordError('Registry JSON is an empty array. No sets found.');
      return [];
    }

    console.log(`  ✓ metadata/sets.json loaded`);
    console.log(`  ✓ ${setEntries.length} sets found`);

    return setEntries;
  } catch (fetchError) {
    recordError(`Registry fetch failed: ${fetchError.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Phase 2 — Metadata Validation
// ---------------------------------------------------------------------------

/**
 * Validates the slug format: lowercase, hyphens only, non-empty.
 * @param {string} slugValue - The slug to validate
 * @param {string} setAbbreviation - Set abbreviation for error messages
 * @param {string} context - Description of where this slug appears
 */
function validateSlugFormat(slugValue, setAbbreviation, context) {
  if (!slugValue || typeof slugValue !== 'string') {
    recordWarning(`[${setAbbreviation}] ${context} has an empty or missing slug.`);
    return;
  }

  if (slugValue !== slugValue.toLowerCase()) {
    recordWarning(`[${setAbbreviation}] ${context} slug "${slugValue}" contains uppercase characters.`);
  }

  if (slugValue.includes('_')) {
    recordWarning(`[${setAbbreviation}] ${context} slug "${slugValue}" contains underscores — expected hyphens only.`);
  }

  if (slugValue.includes(' ')) {
    recordWarning(`[${setAbbreviation}] ${context} slug "${slugValue}" contains spaces.`);
  }

  if (slugValue !== slugValue.trim()) {
    recordWarning(`[${setAbbreviation}] ${context} slug "${slugValue}" contains leading or trailing whitespace.`);
  }
}

/**
 * Validates hero deck records within a set's metadata.
 * @param {Array} heroDecks - The heroes array from set JSON
 * @param {string} setAbbreviation - Set abbreviation for error messages
 */
function validateHeroDecks(heroDecks, setAbbreviation) {
  for (const heroDeck of heroDecks) {
    if (!heroDeck.slug || typeof heroDeck.slug !== 'string') {
      recordError(`[${setAbbreviation}] A hero deck is missing the required "slug" field.`);
      continue;
    }

    validateSlugFormat(heroDeck.slug, setAbbreviation, `hero "${heroDeck.slug}"`);

    if (!heroDeck.name || typeof heroDeck.name !== 'string') {
      recordError(`[${setAbbreviation}] Hero "${heroDeck.slug}" is missing the required "name" field.`);
    }

    if (!Array.isArray(heroDeck.cards)) {
      recordError(`[${setAbbreviation}] Hero "${heroDeck.slug}" is missing the required "cards" array.`);
      continue;
    }

    if (heroDeck.cards.length === 0) {
      recordError(`[${setAbbreviation}] Hero "${heroDeck.slug}" has an empty "cards" array.`);
    }

    for (const heroCard of heroDeck.cards) {
      if (!heroCard.imageUrl || typeof heroCard.imageUrl !== 'string') {
        recordWarning(`[${setAbbreviation}] Hero card "${heroCard.name || heroCard.slug || 'unknown'}" in deck "${heroDeck.slug}" is missing "imageUrl".`);
      } else if (!heroCard.imageUrl.startsWith('https://')) {
        recordWarning(`[${setAbbreviation}] Hero card "${heroCard.name || 'unknown'}" imageUrl does not start with https://.`);
      }

      if (heroCard.cost === undefined || heroCard.cost === null) {
        recordWarning(`[${setAbbreviation}] Hero card "${heroCard.name || 'unknown'}" in deck "${heroDeck.slug}" is missing "cost".`);
      }

      if (!heroCard.hc || typeof heroCard.hc !== 'string') {
        recordWarning(`[${setAbbreviation}] Hero card "${heroCard.name || 'unknown'}" in deck "${heroDeck.slug}" is missing "hc" (hero class).`);
      }

      // Known data quality issue: [object Object] in abilities
      if (Array.isArray(heroCard.abilities)) {
        for (let abilityIndex = 0; abilityIndex < heroCard.abilities.length; abilityIndex++) {
          if (heroCard.abilities[abilityIndex] === '[object Object]') {
            recordWarning(`[${setAbbreviation}] Hero card "${heroCard.name || 'unknown'}" abilities[${abilityIndex}] is "[object Object]" — known data quality issue.`);
          }
        }
      }
    }
  }
}

/**
 * Validates mastermind records within a set's metadata.
 * @param {Array} mastermindsData - The masterminds array from set JSON
 * @param {string} setAbbreviation - Set abbreviation for error messages
 */
function validateMasterminds(mastermindsData, setAbbreviation) {
  for (const mastermind of mastermindsData) {
    if (!mastermind.slug || typeof mastermind.slug !== 'string') {
      recordError(`[${setAbbreviation}] A mastermind is missing the required "slug" field.`);
      continue;
    }

    validateSlugFormat(mastermind.slug, setAbbreviation, `mastermind "${mastermind.slug}"`);

    if (!mastermind.name || typeof mastermind.name !== 'string') {
      recordError(`[${setAbbreviation}] Mastermind "${mastermind.slug}" is missing the required "name" field.`);
    }

    // why: some masterminds (e.g., Ronan, Ego) have no VP printed on the
    // physical card. A null/missing vp is valid data, not a defect.
    // The game engine defaults missing VP to 0 at scoring time.

    if (!Array.isArray(mastermind.cards)) {
      recordError(`[${setAbbreviation}] Mastermind "${mastermind.slug}" is missing the required "cards" array.`);
    } else if (mastermind.cards.length === 0) {
      recordError(`[${setAbbreviation}] Mastermind "${mastermind.slug}" has an empty "cards" array.`);
    }
  }
}

/**
 * Validates villain group records within a set's metadata.
 * @param {Array} villainGroupsData - The villains array from set JSON
 * @param {string} setAbbreviation - Set abbreviation for error messages
 */
function validateVillainGroups(villainGroupsData, setAbbreviation) {
  for (const villainGroup of villainGroupsData) {
    if (!villainGroup.slug || typeof villainGroup.slug !== 'string') {
      recordError(`[${setAbbreviation}] A villain group is missing the required "slug" field.`);
      continue;
    }

    validateSlugFormat(villainGroup.slug, setAbbreviation, `villain group "${villainGroup.slug}"`);

    if (!villainGroup.name || typeof villainGroup.name !== 'string') {
      recordError(`[${setAbbreviation}] Villain group "${villainGroup.slug}" is missing the required "name" field.`);
    }

    if (!Array.isArray(villainGroup.cards)) {
      recordError(`[${setAbbreviation}] Villain group "${villainGroup.slug}" is missing the required "cards" array.`);
      continue;
    }

    if (villainGroup.cards.length === 0) {
      recordError(`[${setAbbreviation}] Villain group "${villainGroup.slug}" has an empty "cards" array.`);
    }

    for (const villainCard of villainGroup.cards) {
      if (!villainCard.slug || typeof villainCard.slug !== 'string') {
        recordWarning(`[${setAbbreviation}] A card in villain group "${villainGroup.slug}" is missing the required "slug" field.`);
      } else {
        validateSlugFormat(villainCard.slug, setAbbreviation, `villain card "${villainCard.slug}"`);
      }
    }
  }
}

/**
 * Validates henchman records within a set's metadata.
 * Henchmen are flat records (each entry IS the card), unlike villain groups
 * which have a nested cards[] array. Shape: { slug, name, imageUrl, vAttack, vp }.
 * @param {Array} henchmenData - The henchmen array from set JSON
 * @param {string} setAbbreviation - Set abbreviation for error messages
 */
function validateHenchmen(henchmenData, setAbbreviation) {
  for (const henchman of henchmenData) {
    if (!henchman.slug || typeof henchman.slug !== 'string') {
      recordError(`[${setAbbreviation}] A henchman is missing the required "slug" field.`);
      continue;
    }

    validateSlugFormat(henchman.slug, setAbbreviation, `henchman "${henchman.slug}"`);

    if (!henchman.name || typeof henchman.name !== 'string') {
      recordError(`[${setAbbreviation}] Henchman "${henchman.slug}" is missing the required "name" field.`);
    }

    if (!henchman.imageUrl || typeof henchman.imageUrl !== 'string') {
      recordWarning(`[${setAbbreviation}] Henchman "${henchman.slug}" is missing "imageUrl".`);
    }
  }
}

/**
 * Validates scheme records within a set's metadata.
 * @param {Array} schemesData - The schemes array from set JSON
 * @param {string} setAbbreviation - Set abbreviation for error messages
 */
function validateSchemes(schemesData, setAbbreviation) {
  for (const scheme of schemesData) {
    // Known data quality issue: scheme with id: null (transform reverse-side)
    if (scheme.id === null) {
      // Silently skip — known transform reverse-side pattern per 00.2 §12
      continue;
    }

    if (!scheme.slug || typeof scheme.slug !== 'string') {
      recordError(`[${setAbbreviation}] A scheme is missing the required "slug" field.`);
      continue;
    }

    validateSlugFormat(scheme.slug, setAbbreviation, `scheme "${scheme.slug}"`);

    if (!scheme.name || typeof scheme.name !== 'string') {
      recordError(`[${setAbbreviation}] Scheme "${scheme.slug}" is missing the required "name" field.`);
    }
  }
}

/**
 * Checks for duplicate slugs within a single set's metadata.
 * @param {object} setJson - The full set JSON object
 * @param {string} setAbbreviation - Set abbreviation for error messages
 */
function checkIntraSetDuplicateSlugs(setJson, setAbbreviation) {
  const seenSlugs = new Set();
  const duplicateSlugs = new Set();

  // Collect slugs from all card types using explicit for...of loops
  if (Array.isArray(setJson.heroes)) {
    for (const heroDeck of setJson.heroes) {
      if (heroDeck.slug) {
        if (seenSlugs.has(heroDeck.slug)) {
          duplicateSlugs.add(heroDeck.slug);
        }
        seenSlugs.add(heroDeck.slug);
      }
    }
  }

  if (Array.isArray(setJson.masterminds)) {
    for (const mastermind of setJson.masterminds) {
      if (mastermind.slug) {
        if (seenSlugs.has(mastermind.slug)) {
          duplicateSlugs.add(mastermind.slug);
        }
        seenSlugs.add(mastermind.slug);
      }
    }
  }

  if (Array.isArray(setJson.villains)) {
    for (const villainGroup of setJson.villains) {
      if (villainGroup.slug) {
        if (seenSlugs.has(villainGroup.slug)) {
          duplicateSlugs.add(villainGroup.slug);
        }
        seenSlugs.add(villainGroup.slug);
      }
    }
  }

  if (Array.isArray(setJson.henchmen)) {
    for (const henchmanGroup of setJson.henchmen) {
      if (henchmanGroup.slug) {
        if (seenSlugs.has(henchmanGroup.slug)) {
          duplicateSlugs.add(henchmanGroup.slug);
        }
        seenSlugs.add(henchmanGroup.slug);
      }
    }
  }

  if (Array.isArray(setJson.schemes)) {
    for (const scheme of setJson.schemes) {
      if (scheme.slug) {
        if (seenSlugs.has(scheme.slug)) {
          duplicateSlugs.add(scheme.slug);
        }
        seenSlugs.add(scheme.slug);
      }
    }
  }

  for (const duplicateSlug of duplicateSlugs) {
    recordWarning(`[${setAbbreviation}] Duplicate slug "${duplicateSlug}" found within this set's metadata.`);
  }
}

/**
 * Validates mastermind alwaysLeads references against villain/henchman slugs.
 * @param {object} setJson - The full set JSON object
 * @param {string} setAbbreviation - Set abbreviation for error messages
 */
function checkAlwaysLeadsReferences(setJson, setAbbreviation) {
  if (!Array.isArray(setJson.masterminds)) {
    return;
  }

  const villainSlugs = new Set();
  if (Array.isArray(setJson.villains)) {
    for (const villainGroup of setJson.villains) {
      if (villainGroup.slug) {
        villainSlugs.add(villainGroup.slug);
      }
    }
  }

  const henchmenSlugs = new Set();
  if (Array.isArray(setJson.henchmen)) {
    for (const henchmanGroup of setJson.henchmen) {
      if (henchmanGroup.slug) {
        henchmenSlugs.add(henchmanGroup.slug);
      }
    }
  }

  for (const mastermind of setJson.masterminds) {
    if (!Array.isArray(mastermind.alwaysLeads) || mastermind.alwaysLeads.length === 0) {
      // Empty or absent alwaysLeads is acceptable — some masterminds lead any group
      continue;
    }

    for (const leadsEntry of mastermind.alwaysLeads) {
      const leadsSlug = typeof leadsEntry === 'string' ? leadsEntry : leadsEntry?.slug;

      if (!leadsSlug) {
        continue;
      }

      if (leadsSlug === 'PLACEHOLDER_DELETE_THIS') {
        // Known placeholder — skip silently per 00.2 §12
        continue;
      }

      if (!villainSlugs.has(leadsSlug) && !henchmenSlugs.has(leadsSlug)) {
        recordWarning(`[${setAbbreviation}] Mastermind "${mastermind.slug}" alwaysLeads entry "${leadsSlug}" does not match any villain or henchman slug in this set.`);
      }
    }
  }
}

/**
 * Fetches and validates metadata for all sets sequentially.
 * @param {Array<{abbr: string}>} setEntries - Set entries from registry
 * @returns {Promise<Map<string, object>>} Map of setAbbreviation -> set JSON
 */
async function checkMetadataForAllSets(setEntries) {
  console.log('');
  console.log(`METADATA — ${setEntries.length} sets to check`);

  const allSetMetadata = new Map();
  let setsWithIssues = 0;
  let setsPassed = 0;

  for (const setEntry of setEntries) {
    const setAbbreviation = setEntry.abbr;
    const metadataUrl = `${R2_BASE_URL}/metadata/${setAbbreviation}.json`;
    const errorsBefore = errorCount;
    const warningsBefore = warningCount;

    try {
      const response = await fetch(metadataUrl, { signal: AbortSignal.timeout(10000) });

      if (!response.ok) {
        recordError(`[${setAbbreviation}] Metadata fetch failed: HTTP ${response.status} from ${metadataUrl}.`);
        setsWithIssues++;
        await sleep(DELAY_BETWEEN_SETS_MS);
        continue;
      }

      const setJson = await response.json();
      allSetMetadata.set(setAbbreviation, setJson);

      // Structural checks — top-level keys
      if (!setJson.heroes) {
        recordWarning(`[${setAbbreviation}] Metadata JSON is missing the "heroes" key.`);
      } else if (!Array.isArray(setJson.heroes)) {
        recordError(`[${setAbbreviation}] "heroes" key exists but is not an array.`);
      } else {
        validateHeroDecks(setJson.heroes, setAbbreviation);
      }

      if (!setJson.masterminds) {
        recordWarning(`[${setAbbreviation}] Metadata JSON is missing the "masterminds" key.`);
      } else if (!Array.isArray(setJson.masterminds)) {
        recordError(`[${setAbbreviation}] "masterminds" key exists but is not an array.`);
      } else {
        validateMasterminds(setJson.masterminds, setAbbreviation);
      }

      if (!setJson.villains) {
        recordWarning(`[${setAbbreviation}] Metadata JSON is missing the "villains" key.`);
      } else if (!Array.isArray(setJson.villains)) {
        recordError(`[${setAbbreviation}] "villains" key exists but is not an array.`);
      } else {
        validateVillainGroups(setJson.villains, setAbbreviation);
      }

      if (!setJson.henchmen) {
        recordWarning(`[${setAbbreviation}] Metadata JSON is missing the "henchmen" key.`);
      } else if (!Array.isArray(setJson.henchmen)) {
        recordError(`[${setAbbreviation}] "henchmen" key exists but is not an array.`);
      } else {
        validateHenchmen(setJson.henchmen, setAbbreviation);
      }

      if (!setJson.schemes) {
        recordWarning(`[${setAbbreviation}] Metadata JSON is missing the "schemes" key.`);
      } else if (!Array.isArray(setJson.schemes)) {
        recordError(`[${setAbbreviation}] "schemes" key exists but is not an array.`);
      } else {
        validateSchemes(setJson.schemes, setAbbreviation);
      }

      // Intra-set slug duplicates
      checkIntraSetDuplicateSlugs(setJson, setAbbreviation);

      // Relationship checks
      checkAlwaysLeadsReferences(setJson, setAbbreviation);

      if (errorCount > errorsBefore || warningCount > warningsBefore) {
        setsWithIssues++;
      } else {
        setsPassed++;
      }
    } catch (fetchError) {
      recordError(`[${setAbbreviation}] Metadata fetch failed: ${fetchError.message}`);
      setsWithIssues++;
    }

    await sleep(DELAY_BETWEEN_SETS_MS);
  }

  console.log(`  ✓ ${setsPassed} sets passed all checks`);
  if (setsWithIssues > 0) {
    console.log(`  ✗ ${setsWithIssues} sets have issues (see above)`);
  }

  return allSetMetadata;
}

// ---------------------------------------------------------------------------
// Phase 3 — Image Spot-Checks
// ---------------------------------------------------------------------------

/**
 * Performs HEAD-request spot-checks on sample images from each set.
 * @param {Map<string, object>} allSetMetadata - Map of set abbreviation -> set JSON
 */
async function spotCheckImages(allSetMetadata) {
  console.log('');

  let totalChecked = 0;
  let totalPassed = 0;
  const missingImages = [];

  for (const [setAbbreviation, setJson] of allSetMetadata) {
    // Mastermind image: use stored imageUrl from the base (non-tactic) card
    // why: some masterminds have only tactic cards and no base mastermind image.
    // Using the stored imageUrl from the first card avoids constructing URLs
    // for cards that don't exist.
    if (Array.isArray(setJson.masterminds) && setJson.masterminds.length > 0) {
      const firstMastermind = setJson.masterminds[0];
      if (Array.isArray(firstMastermind.cards) && firstMastermind.cards.length > 0) {
        const baseCard = firstMastermind.cards.find(card => card.tactic === false);
        const cardToCheck = baseCard || firstMastermind.cards[0];

        if (cardToCheck.imageUrl) {
          const mastermindResult = await headCheckImage(cardToCheck.imageUrl);
          totalChecked++;

          if (mastermindResult) {
            totalPassed++;
          } else {
            missingImages.push(cardToCheck.imageUrl);
          }
        }
      }
    }

    // Villain image: use stored imageUrl when available, fall back to constructed URL
    if (Array.isArray(setJson.villains) && setJson.villains.length > 0) {
      const firstVillainGroup = setJson.villains[0];
      if (Array.isArray(firstVillainGroup.cards) && firstVillainGroup.cards.length > 0) {
        const firstVillainCard = firstVillainGroup.cards[0];

        // why: prefer stored imageUrl (same principle as hero cards per 00.2 §3.2).
        // Fall back to constructed URL only if imageUrl is absent.
        const villainImageUrl = firstVillainCard.imageUrl
          || `${R2_BASE_URL}/${setAbbreviation}/${setAbbreviation}-vi-${firstVillainGroup.slug}-${firstVillainCard.slug}.webp`;

        const villainResult = await headCheckImage(villainImageUrl);
        totalChecked++;

        if (villainResult) {
          totalPassed++;
        } else {
          missingImages.push(villainImageUrl);
        }
      }
    }

    // Hero image: use stored imageUrl directly (per 00.2 §3.2)
    if (Array.isArray(setJson.heroes) && setJson.heroes.length > 0) {
      const firstHeroDeck = setJson.heroes[0];
      if (Array.isArray(firstHeroDeck.cards) && firstHeroDeck.cards.length > 0) {
        const firstHeroCard = firstHeroDeck.cards[0];

        // why: 00.2 §3.2 says to always prefer the stored imageUrl field over
        // constructing URLs. The stored imageUrl is the authority for hero cards.
        if (firstHeroCard.imageUrl) {
          const heroResult = await headCheckImage(firstHeroCard.imageUrl);
          totalChecked++;

          if (heroResult) {
            totalPassed++;
          } else {
            missingImages.push(firstHeroCard.imageUrl);
          }
        }
      }
    }

    await sleep(DELAY_BETWEEN_SETS_MS);
  }

  // why: Spot-checking samples only a few images per set instead of all 1000+.
  // This validates URL patterns and R2 availability without excessive requests.
  console.log(`IMAGES — spot-checked ${totalChecked} URLs`);
  console.log(`  ✓ ${totalPassed} returned 200`);

  if (missingImages.length > 0) {
    missingImageCount = missingImages.length;
    console.log(`  ✗ ${missingImages.length} returned 404:`);
    for (const missingUrl of missingImages) {
      console.log(`    ${missingUrl}`);
    }
  }
}

/**
 * Performs a HEAD request to check if an image URL is reachable.
 * @param {string} imageUrl - The full image URL to check
 * @returns {Promise<boolean>} True if the image exists (HTTP 200)
 */
async function headCheckImage(imageUrl) {
  try {
    // why: HEAD requests check URL reachability without downloading image data.
    // A 200 response confirms the image exists at R2; we do not need the bytes.
    const headResponse = await fetch(imageUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });

    return headResponse.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Phase 4 — Cross-Set Duplicate Slugs
// ---------------------------------------------------------------------------

/**
 * Finds slugs that appear in more than one set's metadata.
 * @param {Map<string, object>} allSetMetadata - Map of set abbreviation -> set JSON
 */
function findCrossSetDuplicateSlugs(allSetMetadata) {
  console.log('');
  console.log('CROSS-SET DUPLICATES');

  // why: Cross-set slug duplicates are silent bugs during PostgreSQL seeding.
  // An upsert on a duplicate slug overwrites the first set's data with the
  // second set's data, producing wrong card records with no error thrown.
  const slugToSets = new Map();

  for (const [setAbbreviation, setJson] of allSetMetadata) {
    // Heroes
    if (Array.isArray(setJson.heroes)) {
      for (const heroDeck of setJson.heroes) {
        if (heroDeck.slug) {
          if (!slugToSets.has(heroDeck.slug)) {
            slugToSets.set(heroDeck.slug, []);
          }
          slugToSets.get(heroDeck.slug).push(setAbbreviation);
        }
      }
    }

    // Masterminds
    if (Array.isArray(setJson.masterminds)) {
      for (const mastermind of setJson.masterminds) {
        if (mastermind.slug) {
          if (!slugToSets.has(mastermind.slug)) {
            slugToSets.set(mastermind.slug, []);
          }
          slugToSets.get(mastermind.slug).push(setAbbreviation);
        }
      }
    }

    // Villains
    if (Array.isArray(setJson.villains)) {
      for (const villainGroup of setJson.villains) {
        if (villainGroup.slug) {
          if (!slugToSets.has(villainGroup.slug)) {
            slugToSets.set(villainGroup.slug, []);
          }
          slugToSets.get(villainGroup.slug).push(setAbbreviation);
        }
      }
    }

    // Henchmen
    if (Array.isArray(setJson.henchmen)) {
      for (const henchmanGroup of setJson.henchmen) {
        if (henchmanGroup.slug) {
          if (!slugToSets.has(henchmanGroup.slug)) {
            slugToSets.set(henchmanGroup.slug, []);
          }
          slugToSets.get(henchmanGroup.slug).push(setAbbreviation);
        }
      }
    }

    // Schemes
    if (Array.isArray(setJson.schemes)) {
      for (const scheme of setJson.schemes) {
        if (scheme.slug && scheme.id !== null) {
          if (!slugToSets.has(scheme.slug)) {
            slugToSets.set(scheme.slug, []);
          }
          slugToSets.get(scheme.slug).push(setAbbreviation);
        }
      }
    }
  }

  let duplicateCount = 0;
  for (const [slug, sets] of slugToSets) {
    if (sets.length > 1) {
      duplicateCount++;
      recordWarning(`Slug "${slug}" appears in ${sets.length} sets: ${sets.join(', ')}`);
    }
  }

  if (duplicateCount === 0) {
    console.log('  ✓ No duplicate slugs found across sets');
  } else {
    console.log(`  ✗ ${duplicateCount} duplicate slug(s) found (see warnings above)`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Runs all four validation phases in order and prints a final summary.
 */
async function main() {
  console.log('');
  console.log('=== Legendary Arena — R2 Validation Report ===');
  console.log(`Run at: ${new Date().toISOString()}`);
  console.log('');

  // Phase 1: Registry
  const setEntries = await checkRegistry();

  if (setEntries.length === 0) {
    console.log('');
    console.log('Cannot continue — registry returned no sets.');
    process.exit(1);
  }

  console.log('');

  // Phase 2: Metadata
  const allSetMetadata = await checkMetadataForAllSets(setEntries);

  // Phase 3: Image spot-checks
  await spotCheckImages(allSetMetadata);

  // Phase 4: Cross-set duplicates
  findCrossSetDuplicateSlugs(allSetMetadata);

  // Summary
  console.log('');
  console.log('===');

  if (errorCount === 0 && warningCount === 0 && missingImageCount === 0) {
    console.log('SUMMARY: All checks passed. R2 data is healthy.');
  } else {
    const summaryParts = [];
    if (errorCount > 0) {
      summaryParts.push(`${errorCount} error(s)`);
    }
    if (warningCount > 0) {
      summaryParts.push(`${warningCount} warning(s)`);
    }
    if (missingImageCount > 0) {
      summaryParts.push(`${missingImageCount} missing image(s)`);
    }
    console.log(`SUMMARY: ${summaryParts.join(', ')}`);
  }

  console.log('');

  // why: Exit code 1 signals to CI that the seed script must not run.
  // Warnings are informational — they do not block seeding.
  if (errorCount > 0) {
    console.log('ACTION REQUIRED before running seed script.');
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main();
