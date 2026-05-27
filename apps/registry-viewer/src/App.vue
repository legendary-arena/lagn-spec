<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import type { FlatCard, CardQueryExtended, HealthReport, CardRegistry, SetIndexEntry, FlatCardType } from "./registry/browser";
import { getRegistry } from "./lib/registryClient";
import { getThemes } from "./lib/themeClient";
import type { ThemeDefinition } from "./lib/themeClient";
import { getKeywordGlossary, getKeywordPdfPages, getRuleGlossary } from "./lib/glossaryClient";
import { getCardTypes } from "./lib/cardTypesClient";
import { getCardAbilities, buildAbilityTagIndex } from "./lib/cardAbilitiesClient";
import { devLog } from "./lib/devLog";
import type { CardTypeEntry, CardAbilityEntry } from "@legendary-arena/registry/schema";
import { setGlossaries } from "./composables/useRules";
import { useGlossary, rebuildGlossaryEntries } from "./composables/useGlossary";
import { useLightbox } from "./composables/useLightbox";
import { useCardViewMode } from "./composables/useCardViewMode";
import CardGrid        from "./components/CardGrid.vue";
import CardSizeSlider  from "./components/CardSizeSlider.vue";
import CardDetail      from "./components/CardDetail.vue";
import ThemeGrid      from "./components/ThemeGrid.vue";
import ThemeSizeSlider from "./components/ThemeSizeSlider.vue";
import ThemeDetail    from "./components/ThemeDetail.vue";
import HealthPanel    from "./components/HealthPanel.vue";
import GlossaryPanel  from "./components/GlossaryPanel.vue";
import ImageLightbox  from "./components/ImageLightbox.vue";
import ViewModeToggle from "./components/ViewModeToggle.vue";
import LoadoutBuilder from "./components/LoadoutBuilder.vue";
import LoadoutPreview from "./components/LoadoutPreview.vue";
import AbilityEffectFilter from "./components/AbilityEffectFilter.vue";
import AppShell from "./components/branding/AppShell.vue";
import { useSetupFromUrl } from "./composables/useSetupFromUrl";
import type {
  MatchSetupDocument,
  MatchSetupValidationError,
  SetupCompositionInput,
} from "@legendary-arena/registry/setupContract";
import type { SetupMatchedCount } from "./composables/useSetupFromUrl";

// ── Glossary panel ───────────────────────────────────────────────────────────
const glossary = useGlossary();

// ── Lightbox ─────────────────────────────────────────────────────────────────
const lightbox = useLightbox();

// ── Card view-mode toggle ────────────────────────────────────────────────────
// why: viewMode is read from localStorage (key 'cardViewMode') at the moment
// useCardViewMode.ts is first imported — the composable uses a module-scoped
// ref seeded from localStorage.getItem with narrowing + self-heal write-back.
// That import runs during App setup (above the template), so the reactive
// state is ready before the first render and the user's preference survives
// page reloads without any explicit onMounted work here. See
// src/composables/useCardViewMode.ts for the narrowing and error-swallow logic.
const { viewMode: cardViewMode } = useCardViewMode();

// ── State ─────────────────────────────────────────────────────────────────────
const registry      = ref<CardRegistry | null>(null);
const loading       = ref(true);
const loadStatus    = ref("Starting up…");
const loadError     = ref<string | null>(null);
const allCards      = ref<FlatCard[]>([]);
const filteredCards = ref<FlatCard[]>([]);
const selectedCard  = ref<FlatCard | null>(null);
const healthReport  = ref<HealthReport | null>(null);
const allSets       = ref<SetIndexEntry[]>([]);
const showDiag      = ref(false);
const searchText    = ref("");
const filterSet     = ref("");
const filterHC      = ref("");
const HC_OPTIONS    = ["covert","instinct","ranged","strength","tech"];

// why: Absolute URL to the rulebook PDF on R2, populated from
// registry-config.json. `config.rulebookPdfUrl ?? null` is the supported
// absence path — when the config field is missing, the GlossaryPanel's
// per-entry anchor template already guards against null, so missing config
// is silent (no warning banner, no fallback UI).
const rulebookPdfUrl = ref<string | null>(null);

// ── View toggle ──────────────────────────────────────────────────────────────
// why: "loadout" is an additive third tab (WP-091); Cards/Themes tabs are
// unaffected. No router library is added (EC-091 L7) — the existing tab
// switcher is extended in place.
type ActiveView = "cards" | "themes" | "loadout";
const activeView = ref<ActiveView>("cards");

// ── URL-driven setup preview (WP-114) ────────────────────────────────────────
// why: A single useSetupFromUrl instance per page prevents duplicate URL
// parsing and duplicate validator runs across the parent (auto-switch
// decision below) and the child (<LoadoutPreview> render). Instantiated
// lazily inside onMounted because the composable needs the real
// CardRegistryReader and registry.value is null until the R2 fetch
// resolves. The composable reads window.location.search exactly once at
// instantiation, so deferring to post-registry-load does not change the
// declarative arrival semantics.
const setupHasUrlParams = ref(false);
const setupPreviewDocument = ref<MatchSetupDocument | null>(null);
const setupValidationErrors = ref<MatchSetupValidationError[]>([]);
const setupMatchedCount = ref<SetupMatchedCount>({
  schemes: 0,
  masterminds: 0,
  villainGroups: 0,
  henchmanGroups: 0,
  heroDecks: 0,
});
const setupParsedParams = ref<Partial<SetupCompositionInput>>({});

// why: One-shot auto-switch — URL params are a declarative arrival signal,
// not a sticky preference. The first render with hasUrlParams=true flips
// activeView to "loadout"; this ref then latches and the auto-switch never
// re-fires, preserving the user's subsequent manual tab navigation.
const hasAppliedUrlAutoSwitch = ref(false);

// ── Filter drawer (collapsible on short viewports) ───────────────────────────
const compactMq = window.matchMedia("(max-height: 800px)");
const filterDrawerOpen = ref(!compactMq.matches);

function onCompactMqChange(e: MediaQueryListEvent) {
  filterDrawerOpen.value = !e.matches;
}
compactMq.addEventListener("change", onCompactMqChange);
onBeforeUnmount(() => compactMq.removeEventListener("change", onCompactMqChange));

const activeFilterCount = computed(() => {
  let n = 0;
  if (filterSet.value) n++;
  if (filterHC.value) n++;
  if (selectedTypes.value.size > 0) n += selectedTypes.value.size;
  if (selectedEffectSlugs.value.size > 0) n += selectedEffectSlugs.value.size;
  return n;
});

// ── Theme state ──────────────────────────────────────────────────────────────
const allThemes       = ref<ThemeDefinition[]>([]);
const filteredThemes  = ref<ThemeDefinition[]>([]);
const selectedTheme   = ref<ThemeDefinition | null>(null);
const themeSearchText = ref("");

// ── Card type groups ──────────────────────────────────────────────────────────

// why: types/subtypes widened from FlatCardType (9-value union) to string so
// the same TypeGroup interface accommodates both LEGACY_TYPE_GROUPS (legacy
// FlatCardType values) and displayedTypeGroups built from card-types.json
// (Phase-2 slugs like "sidekick" / "shield-agent" not yet in the FlatCardType
// union). Phase 2 (separate WP) regenerates per-card cardType emission
// upstream via modern-master-strike.
interface TypeGroup {
  label:    string;
  emoji:    string;
  types:    string[];
  subtypes: { label: string; type: string }[];
}

// why: card-types.json (WP-086) is the new source-of-truth for ribbon shape;
// LEGACY_TYPE_GROUPS lights up only on degraded-fetch fallback when
// getCardTypes() resolves to []. Byte-identical to the legacy hardcoded
// array minus the "Location" subchip — flattenSet() in shared.ts never
// assigned cardType="location" (the 8 hardcoded literals are
// hero/mastermind/villain/henchman/scheme/bystander/wound/other; "location"
// was orphan UI). Dead code on the happy path.
const LEGACY_TYPE_GROUPS: TypeGroup[] = [
  {
    label: "Hero", emoji: "🦸",
    types: ["hero"],
    subtypes: [{ label: "Hero", type: "hero" }],
  },
  {
    label: "Mastermind", emoji: "🦹",
    types: ["mastermind"],
    subtypes: [{ label: "Mastermind", type: "mastermind" }],
  },
  {
    label: "Villain", emoji: "💀",
    types: ["villain"],
    subtypes: [{ label: "Villain", type: "villain" }],
  },
  {
    label: "Henchman", emoji: "🗡️",
    types: ["henchman"],
    subtypes: [{ label: "Henchman", type: "henchman" }],
  },
  {
    label: "Scheme", emoji: "📜",
    types: ["scheme"],
    subtypes: [{ label: "Scheme", type: "scheme" }],
  },
  {
    label: "Bystander", emoji: "🧑",
    types: ["bystander"],
    subtypes: [{ label: "Bystander", type: "bystander" }],
  },
  {
    label: "Wound", emoji: "🩸",
    types: ["wound"],
    subtypes: [{ label: "Wound", type: "wound" }],
  },
  {
    label: "Other", emoji: "🃏",
    types: ["other"],
    subtypes: [{ label: "Other", type: "other" }],
  },
];

// Live taxonomy fetched from card-types.json. Empty until onMounted resolves;
// stays empty if fetch fails or schema rejects (non-blocking by design —
// cardTypesClient.ts never throws).
const cardTypes = ref<CardTypeEntry[]>([]);

// why: Set<string> rather than Set<FlatCardType> because the displayed ribbon
// can include Phase-2 slugs (sidekick, shield-agent, shield-officer,
// shield-trooper) not in the FlatCardType 9-value union. The registry.query()
// call site casts back to FlatCardType[] before passing through the existing
// query() type signature.
const selectedTypes = ref<Set<string>>(new Set());

// ── Card-abilities effect-tag taxonomy (WP-125 / EC-127) ──────────────────────
// Live taxonomy fetched from card-abilities.json. Empty until onMounted
// resolves; stays empty if fetch fails or schema rejects (non-blocking by
// design — cardAbilitiesClient.ts never throws). The chip ribbon stays
// hidden when this is empty.
const abilitiesTaxonomy = ref<CardAbilityEntry[]>([]);
const abilityTagIndex = ref<Map<string, Set<string>> | null>(null);
const selectedEffectSlugs = ref<Set<string>>(new Set());

function toggleGroup(group: TypeGroup) {
  const allSelected = group.types.every((t) => selectedTypes.value.has(t));
  const next = new Set(selectedTypes.value);
  if (allSelected) {
    group.types.forEach((t) => next.delete(t));
  } else {
    group.types.forEach((t) => next.add(t));
  }
  selectedTypes.value = next;
  applyFilters();
}

function isGroupActive(group: TypeGroup): boolean {
  return group.types.some((t) => selectedTypes.value.has(t));
}

function isGroupFullyActive(group: TypeGroup): boolean {
  return group.types.every((t) => selectedTypes.value.has(t));
}

function clearTypes() {
  selectedTypes.value = new Set();
  applyFilters();
}

/** Resets all card filters to their default state and re-applies. */
function clearAllFilters() {
  searchText.value = "";
  filterSet.value = "";
  filterHC.value = "";
  selectedTypes.value = new Set();
  selectedEffectSlugs.value = new Set();
  selectedCard.value = null;
  applyFilters();
}

// ── Load registry + themes ────────────────────────────────────────────────────
onMounted(async () => {
  try {
    loadStatus.value = "Fetching set index from R2…";
    const configResponse = await fetch("/registry-config.json");
    if (!configResponse.ok) throw new Error(`Cannot load registry-config.json: ${configResponse.status}`);
    const config = await configResponse.json();
    const metadataBaseUrl = config.metadataBaseUrl as string;
    rulebookPdfUrl.value = (config.rulebookPdfUrl as string | undefined) ?? null;

    const reg = await getRegistry();
    loadStatus.value = "Parsing card data…";
    registry.value      = reg;
    allSets.value       = reg.listSets();
    allCards.value      = reg.listCards();
    filteredCards.value = allCards.value;
    healthReport.value  = reg.validate();

    // WP-114: instantiate the URL-preview composable exactly once with the
    // real registry, snapshot its outputs into top-level refs (the
    // composable's inputs are stable for the page lifetime so a single read
    // is sufficient), and apply the one-shot auto-switch.
    const setupApi = useSetupFromUrl(reg);
    setupHasUrlParams.value = setupApi.hasUrlParams.value;
    setupPreviewDocument.value = setupApi.previewDocument.value;
    setupValidationErrors.value = setupApi.validationErrors.value;
    setupMatchedCount.value = setupApi.matchedCount.value;
    setupParsedParams.value = setupApi.parsedParams.value;

    if (
      setupHasUrlParams.value &&
      !hasAppliedUrlAutoSwitch.value &&
      activeView.value !== "loadout"
    ) {
      activeView.value = "loadout";
      hasAppliedUrlAutoSwitch.value = true;
    } else if (setupHasUrlParams.value) {
      hasAppliedUrlAutoSwitch.value = true;
    }

    // Load themes in parallel (non-blocking — card view works even if themes fail)
    loadStatus.value = "Loading themes…";
    try {
      const themes = await getThemes(metadataBaseUrl);
      allThemes.value = themes;
      filteredThemes.value = themes;
    } catch (themeError) {
      console.warn("[Themes] Load failed (non-blocking):", themeError);
    }

    // why: card-types.json (WP-086) drives the ribbon as the authoritative
    // taxonomy. cardTypesClient.ts is non-blocking — HTTP failure or schema
    // rejection resolves to []; displayedTypeGroups computed selects
    // LEGACY_TYPE_GROUPS in that case. No try/catch needed at this seam.
    loadStatus.value = "Loading card types taxonomy…";
    cardTypes.value = await getCardTypes(metadataBaseUrl);
    if (cardTypes.value.length === 0) {
      // why: diagnostic-parity emission — makes degraded-fetch mode visible
      // in the console without changing control flow. displayedTypeGroups
      // computed handles the actual fallback to LEGACY_TYPE_GROUPS. Fires
      // at most once per page session because onMounted runs once.
      devLog("cardTypes", "using legacy fallback");
    }

    // why: Parallel to the cardTypes / glossary fetches — the abilities
    // client is non-blocking (resolves to [] on HTTP failure or schema
    // rejection). When the taxonomy is empty the chip ribbon stays
    // silently hidden via v-if on AbilityEffectFilter.vue's outer
    // wrapper; the cards view remains fully functional.
    loadStatus.value = "Loading abilities taxonomy…";
    abilitiesTaxonomy.value = await getCardAbilities(metadataBaseUrl);
    if (abilitiesTaxonomy.value.length > 0) {
      // why: build the per-card effect-tag index exactly once after both
      // registry and taxonomy resolve. Keyed by card.key (the
      // ${abbr}-${cardType}-${slug} string established by WP-122).
      // Subsequent chip toggles consult the index without recomputing —
      // see applyFilters() below.
      abilityTagIndex.value = buildAbilityTagIndex(
        allCards.value,
        abilitiesTaxonomy.value,
      );
    }

    // why: Parallel to getThemes() above — glossary fetch is non-blocking.
    // If R2 is unreachable or the JSON files are missing, console.warn and
    // continue; tooltips will be absent but the card view remains functional.
    loadStatus.value = "Loading glossary…";
    try {
      const [keywords, keywordPdfPages, rules] = await Promise.all([
        getKeywordGlossary(metadataBaseUrl),
        getKeywordPdfPages(metadataBaseUrl),
        getRuleGlossary(metadataBaseUrl),
      ]);
      setGlossaries(keywords, keywordPdfPages, rules);
      rebuildGlossaryEntries();
    } catch (glossaryError) {
      console.warn("[Glossary] Load failed (non-blocking):", glossaryError);
    }
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err);
    console.error("[Registry] Load failed:", err);
  } finally {
    loading.value = false;
  }

  // why: keyboard shortcuts are registered on window so they work regardless
  // of focus. Ctrl/Cmd+K toggles the glossary, Esc closes it when open.
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
});

function handleKeydown(event: KeyboardEvent) {
  // Ctrl/Cmd + K toggles the glossary panel
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    glossary.toggle();
    return;
  }
  // why: Esc closes the topmost overlay. Lightbox takes priority because
  // it's fully modal; glossary is secondary.
  if (event.key === "Escape") {
    if (lightbox.isOpen.value) {
      lightbox.closeLightbox();
      return;
    }
    if (glossary.isOpen.value) {
      glossary.close();
    }
  }
}

// ── Filtering ─────────────────────────────────────────────────────────────────
function applyFilters() {
  if (!registry.value) return;
  const q: CardQueryExtended = {};
  // why: cast to FlatCardType[] because selectedTypes can hold Phase-2 slugs
  // (e.g., "sidekick", "shield-agent") not yet in the FlatCardType 9-value
  // union. applyQuery() gracefully returns zero results for unknown slugs
  // (Phase 1 invariant covered by registry/shared.test.ts).
  if (selectedTypes.value.size > 0) q.cardTypes = [...selectedTypes.value] as FlatCardType[];
  if (filterSet.value)  q.setAbbr      = filterSet.value;
  if (filterHC.value)   q.heroClass    = filterHC.value as CardQueryExtended["heroClass"];
  if (searchText.value) q.nameContains = searchText.value;
  const queryResults = registry.value.query(q as any);
  // why: the abilities filter is applied *after* applyQuery() rather than
  // inside it. applyQuery() lives in apps/registry-viewer/src/registry/shared.ts
  // (the registry package's per-viewer flatten copy) and an effect-tag
  // concept is out of scope for that helper — keeping the filter outside
  // preserves shared.ts's purity. Semantics: OR within the abilities
  // filter (a card matches if ANY selected effect's tag is present); AND
  // with every other filter (set / hero class / card type / search —
  // existing applyQuery() semantics preserved upstream).
  if (selectedEffectSlugs.value.size > 0 && abilityTagIndex.value) {
    const tagIndex = abilityTagIndex.value;
    const selected = selectedEffectSlugs.value;
    filteredCards.value = queryResults.filter((card) => {
      const tags = tagIndex.get(card.key);
      if (!tags) return false;
      for (const slug of selected) {
        if (tags.has(slug)) return true;
      }
      return false;
    });
  } else {
    filteredCards.value = queryResults;
  }
  selectedCard.value = null;
}

const activeTypeCount = computed(() => selectedTypes.value.size);

// why: displayedTypeGroups selects between the fetched taxonomy
// (data/metadata/card-types.json via cardTypesClient.ts) and the legacy
// hardcoded fallback. cardTypes.value.length === 0 means the fetch returned
// empty (HTTP failure or schema rejection); LEGACY_TYPE_GROUPS preserves the
// original ribbon so the card view stays functional in degraded mode.
const displayedTypeGroups = computed<TypeGroup[]>(() => {
  if (cardTypes.value.length === 0) return LEGACY_TYPE_GROUPS;

  const topLevel = cardTypes.value
    .filter((entry) => entry.parentType === null)
    .sort((a, b) => a.order - b.order);

  return topLevel.map((parent) => {
    const children = cardTypes.value
      .filter((entry) => entry.parentType === parent.slug)
      .sort((a, b) => a.order - b.order);

    if (children.length > 0) {
      return {
        label:    parent.label,
        emoji:    parent.emoji ?? "",
        types:    children.map((child) => child.slug),
        subtypes: children.map((child) => ({ label: child.label, type: child.slug })),
      };
    }
    return {
      label:    parent.label,
      emoji:    parent.emoji ?? "",
      types:    [parent.slug],
      subtypes: [{ label: parent.label, type: parent.slug }],
    };
  });
});

// ── Theme filtering ──────────────────────────────────────────────────────────
function applyThemeFilters() {
  const needle = themeSearchText.value.toLowerCase().trim();
  if (!needle) {
    filteredThemes.value = allThemes.value;
    return;
  }
  filteredThemes.value = allThemes.value.filter((theme) => {
    const searchable = [
      theme.name,
      theme.description,
      theme.setupIntent.mastermindId,
      theme.setupIntent.schemeId,
      ...(theme.tags ?? []),
      ...(theme.setupIntent.heroDeckIds ?? []),
    ].join(" ").toLowerCase();
    return searchable.includes(needle);
  });
  selectedTheme.value = null;
}

/** Cross-link: navigate from theme detail to the card view with a filter. */
function navigateToCard(slug: string, cardType: string) {
  activeView.value = "cards";
  searchText.value = slug;
  selectedTypes.value = new Set();
  filterSet.value = "";
  filterHC.value = "";
  applyFilters();
}
</script>

<template>
  <AppShell>
    <div class="app">
    <header class="header">
      <h1 class="logo">⚔️ <a class="logo-link" href="https://www.legendary-arena.com">Legendary Arena</a> <span class="sub">Registry Viewer</span></h1>
      <div class="header-actions">
        <ViewModeToggle v-if="!loading && !loadError" />
        <button v-if="!loading && !loadError" class="diag-btn" @click="glossary.toggle()" title="Open Rules Glossary (Ctrl+K)">
          📖 Glossary
        </button>
        <button v-if="!loading && !loadError" class="diag-btn" @click="showDiag = !showDiag">
          🔍 Diagnostics
        </button>
      </div>
    </header>

    <!-- Floating glossary toggle button (mobile only — bottom-right FAB) -->
    <button
      v-if="!loading && !loadError && !glossary.isOpen.value"
      class="floating-glossary-btn"
      @click="glossary.open()"
      title="Open Rules Glossary (Ctrl+K)"
      aria-label="Open Rules Glossary"
    >
      📖
    </button>

    <!-- Full-screen image lightbox (mounted once, opened from anywhere) -->
    <ImageLightbox />

    <div
      v-if="loading"
      class="status-screen"
      role="status"
      aria-live="polite"
      :aria-busy="loading"
    >
      <div class="spinner" aria-hidden="true">⏳</div>
      <p class="status-text">{{ loadStatus }}</p>
      <p class="status-hint">Connecting to images.barefootbetters.com…</p>
    </div>

    <div v-else-if="loadError" class="status-screen error">
      <div class="err-icon">❌</div>
      <p class="err-title">Failed to load registry</p>
      <pre class="err-detail">{{ loadError }}</pre>
    </div>

    <template v-else>
      <HealthPanel
        v-if="showDiag && healthReport"
        :report="healthReport"
        :info="registry!.info()"
        :debug-state="{
          searchText: searchText,
          filterSet: filterSet,
          filterHC: filterHC,
          selectedTypes: [...selectedTypes].sort(),
          selectedCardKey: selectedCard?.key ?? null,
          selectedThemeId: selectedTheme?.themeId ?? null,
          filteredCount: filteredCards.length,
          totalCount: allCards.length,
          glossaryOpen: glossary.isOpen.value,
          lightboxOpen: lightbox.isOpen.value,
        }"
        @close="showDiag = false"
      />

      <!-- ── View tabs ──────────────────────────────────────────────────────── -->
      <div class="view-tabs">
        <button class="view-tab" :class="{ active: activeView === 'cards' }" @click="activeView = 'cards'">
          🃏 Cards <span class="tab-count">{{ allCards.length }}</span>
        </button>
        <button class="view-tab" :class="{ active: activeView === 'themes' }" @click="activeView = 'themes'">
          🎭 Themes <span class="tab-count">{{ allThemes.length }}</span>
        </button>
        <!-- why: Loadout tab is additive authoring surface per WP-091; Cards
             and Themes tabs are unaffected. -->
        <button class="view-tab" :class="{ active: activeView === 'loadout' }" @click="activeView = 'loadout'">
          🧰 Loadout
        </button>
      </div>

      <!-- ══════════════════════════════════════════════════════════════════════ -->
      <!-- ── THEMES VIEW (filter bar only) ───────────────────────────────────── -->
      <!-- ══════════════════════════════════════════════════════════════════════ -->
      <template v-if="activeView === 'themes'">
        <div class="filter-bar">
          <input v-model="themeSearchText" class="search" placeholder="Search themes by name, tag, hero…" @input="applyThemeFilters" />
          <ThemeSizeSlider />
          <span class="count">{{ filteredThemes.length }} themes</span>
        </div>
      </template>

      <!-- ══════════════════════════════════════════════════════════════════════ -->
      <!-- ── CARDS VIEW (filter bar + collapsible drawer) ────────────────────── -->
      <!-- ══════════════════════════════════════════════════════════════════════ -->
      <template v-if="activeView === 'cards'">

      <!-- ── Search bar (always visible) ────────────────────────────────────── -->
      <div class="filter-bar">
        <input v-model="searchText" class="search" placeholder="Search cards…" @input="applyFilters" />

        <button
          type="button"
          class="filter-drawer-toggle"
          :aria-expanded="filterDrawerOpen"
          @click="filterDrawerOpen = !filterDrawerOpen"
        >
          Filters
          <span v-if="!filterDrawerOpen && activeFilterCount > 0" class="filter-badge">{{ activeFilterCount }}</span>
          <span class="filter-caret">{{ filterDrawerOpen ? '▴' : '▾' }}</span>
        </button>

        <CardSizeSlider />

        <span class="count">{{ filteredCards.length }} cards</span>
      </div>

      <!-- ── Collapsible filter drawer ──────────────────────────────────────── -->
      <div class="filter-drawer" :class="{ open: filterDrawerOpen }">
        <div class="filter-drawer-inner">

          <!-- Set + Class dropdowns -->
          <div class="filter-drawer-row">
            <select v-model="filterSet" @change="applyFilters" aria-label="Filter by set">
              <option value="">All Sets</option>
              <option v-for="s in allSets" :key="s.abbr" :value="s.abbr">{{ s.name }}</option>
            </select>

            <select v-model="filterHC" @change="applyFilters" aria-label="Filter by hero class">
              <option value="">All Classes</option>
              <option v-for="hc in HC_OPTIONS" :key="hc" :value="hc">{{ hc }}</option>
            </select>
          </div>

          <!-- Card type group toggles -->
          <div class="type-bar">
            <button
              class="type-group-btn"
              :class="{ active: activeTypeCount === 0 }"
              @click="clearTypes"
            >All</button>

            <button
              v-for="group in displayedTypeGroups"
              :key="group.label"
              class="type-group-btn"
              :class="{
                active: isGroupFullyActive(group),
                partial: isGroupActive(group) && !isGroupFullyActive(group)
              }"
              @click="toggleGroup(group)"
              :title="group.subtypes.map(s => s.label).join(', ')"
            >
              {{ group.emoji }} {{ group.label }}
            </button>

            <button
              v-if="activeTypeCount > 0"
              type="button"
              class="clear-link"
              @click="clearTypes"
            >✕ clear</button>
          </div>

          <!-- Effect-tag chip ribbon (WP-125) -->
          <AbilityEffectFilter
            v-if="abilitiesTaxonomy.length > 0"
            :taxonomy="abilitiesTaxonomy"
            :tag-index="abilityTagIndex"
            v-model:selected-effect-slugs="selectedEffectSlugs"
            @update:selected-effect-slugs="applyFilters"
          />

          <!-- Set quick-filter pills -->
          <div class="set-pills">
            <span class="pills-label">Set:</span>
            <button
              v-for="s in allSets"
              :key="s.abbr"
              class="pill"
              :class="{ active: filterSet === s.abbr }"
              @click="filterSet = filterSet === s.abbr ? '' : s.abbr; applyFilters()"
            >{{ s.abbr }}</button>
          </div>

        </div>
      </div>

      </template><!-- end cards filter bar -->

      <!-- ── Main body (single flex row, shared across both views) ──────────── -->
      <!-- why: GlossaryPanel is rendered once here instead of duplicated in each
           view's body div. This eliminates DOM duplication and makes the resizable
           splitter work seamlessly across view switches. -->
      <div class="body">
        <GlossaryPanel :rulebook-pdf-url="rulebookPdfUrl" />

        <!-- Themes content -->
        <template v-if="activeView === 'themes'">
          <ThemeGrid :themes="filteredThemes" :selected-id="selectedTheme?.themeId" @select="selectedTheme = $event" />
          <ThemeDetail v-if="selectedTheme" :theme="selectedTheme" @close="selectedTheme = null" @navigate-to-card="navigateToCard" />
        </template>

        <!-- Cards content -->
        <template v-if="activeView === 'cards'">
          <CardGrid :cards="filteredCards" :selected-key="selectedCard?.key" @select="selectedCard = $event" @clear-filters="clearAllFilters" />
          <CardDetail v-if="selectedCard" :card="selectedCard" :view-mode="cardViewMode" @close="selectedCard = null" />
        </template>

        <!-- Loadout content -->
        <template v-if="activeView === 'loadout' && registry">
          <div class="loadout-tab-stack">
            <LoadoutPreview
              :hasUrlParams="setupHasUrlParams"
              :previewDocument="setupPreviewDocument"
              :validationErrors="setupValidationErrors"
              :matchedCount="setupMatchedCount"
              :parsedParams="setupParsedParams"
              :registry="registry!"
            />
            <LoadoutBuilder :registry="registry!" :themes="allThemes" />
          </div>
        </template>
      </div>
    </template>
    </div>
  </AppShell>
</template>

<style scoped>
/* why: WP-007b mount-layout — .app is now a flex child of
   <AppShell>'s main slot. flex: 1 + min-height: 0 (vs the prior
   height: 100vh) lets the shell's BrandHeader and BrandFooter
   consume the viewport edges while .app fills the remainder. */
.app { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; background: var(--la-color-bg-primary); color: var(--la-color-text-primary); }

.header { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1.25rem; background: #1a1a24; border-bottom: 1px solid #2e2e42; flex-shrink: 0; }
.logo  { margin: 0; font-size: 1.1rem; font-weight: 700; color: #fff; }
.logo-link { color: inherit; text-decoration: none; }
.logo-link:hover, .logo-link:focus-visible { color: var(--la-color-cta, #6aa6ff); text-decoration: underline; }
.sub   { font-weight: 400; color: #8888aa; font-size: 0.85rem; margin-left: 0.5rem; }
.header-actions { display: flex; gap: 0.5rem; align-items: center; }
.diag-btn { background: #2a2a3a; border: 1px solid #3e3e56; color: #c8c8e0; padding: 0.4rem 0.9rem; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-family: inherit; }
.diag-btn:hover { background: #35354a; }

/* ── Floating glossary button (mobile-focused) ─────────────────────────── */
.floating-glossary-btn {
  position: fixed;
  bottom: 1.25rem;
  right: 1.25rem;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #2a2a5a;
  border: 2px solid #7070e0;
  color: #fff;
  font-size: 1.3rem;
  cursor: pointer;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  transition: transform 0.15s, background 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.floating-glossary-btn:hover {
  background: #3a3a7a;
  transform: scale(1.05);
}
/* Hide the floating button on desktop — the header button is sufficient */
@media (min-width: 1024px) {
  .floating-glossary-btn { display: none; }
}

.status-screen { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem; padding: 2rem; }
.spinner { font-size: 2.5rem; animation: spin 1.5s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.status-text { font-size: 1.1rem; color: #c8c8e0; font-weight: 600; margin: 0; }
.status-hint { font-size: 0.85rem; color: #6666aa; margin: 0; }
.status-screen.error { background: #130a0a; }
.err-icon  { font-size: 2.5rem; }
.err-title { font-size: 1.2rem; font-weight: 700; color: #f87171; margin: 0; }
.err-detail { background: #1a0808; border: 1px solid #4a1010; border-radius: 8px; padding: 1rem; color: #fca5a5; font-size: 0.8rem; max-width: 600px; white-space: pre-wrap; word-break: break-all; margin: 0; }

.filter-bar { display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 1.25rem; background: #15151e; border-bottom: 1px solid #22222e; flex-shrink: 0; flex-wrap: wrap; }
.search { flex: 1; min-width: 160px; padding: 0.4rem 0.75rem; background: #22222e; border: 1px solid #33334a; border-radius: 6px; color: #e8e8ee; font-size: 0.9rem; }
.search:focus { outline: none; border-color: #6060c0; }
select { padding: 0.4rem 0.6rem; background: #22222e; border: 1px solid #33334a; border-radius: 6px; color: #e8e8ee; font-size: 0.85rem; cursor: pointer; }
.count { color: #6666aa; font-size: 0.8rem; margin-left: auto; white-space: nowrap; }

/* ── Filter drawer toggle button ─────────────────────────────────────────── */
.filter-drawer-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #2a2a3a;
  border: 1px solid #3e3e56;
  color: #c8c8e0;
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  font-size: 0.85rem;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.filter-drawer-toggle:hover { background: #35354a; }
.filter-badge {
  background: #7070e0;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  min-width: 1.1em;
  height: 1.1em;
  line-height: 1.1em;
  text-align: center;
  border-radius: 9px;
  padding: 0 0.3rem;
}
.filter-caret { font-size: 0.7rem; }

/* ── Collapsible filter drawer ───────────────────────────────────────────── */
.filter-drawer {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.2s ease;
  flex-shrink: 0;
  background: #12121a;
  border-bottom: 1px solid transparent;
}
.filter-drawer.open {
  max-height: 500px;
  border-bottom-color: #22222e;
}
.filter-drawer-inner {
  display: flex;
  flex-direction: column;
}
.filter-drawer-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 1.25rem;
  flex-wrap: wrap;
}

/* ── Type group toggles ──────────────────────────────────────────────────── */
.type-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1.25rem;
  background: #12121a;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.type-group-btn {
  background: #1e1e2e;
  border: 1.5px solid #33334a;
  color: #8888cc;
  padding: 0.3rem 0.75rem;
  border-radius: 20px;
  font-size: 0.78rem;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  font-weight: 500;
}
.type-group-btn:hover  { background: #2a2a3e; color: #c8c8ee; border-color: #5555aa; }
.type-group-btn.active { background: #2a2a5a; border-color: #7070e0; color: #c0c0ff; font-weight: 700; }
.type-group-btn.partial { background: #1e1e3a; border-color: #5555aa; color: #9999dd; border-style: dashed; }
/* why: .clear-link became a <button> (EC-103). Reset native button styles to
   preserve the original visual (text-like link); keep native focus outline. */
.clear-link {
  appearance: none;
  -webkit-appearance: none;
  border: none;
  background: none;
  padding: 0;
  margin-left: 0.25rem;
  font: inherit;
  font-size: 0.72rem;
  color: #6666aa;
  cursor: pointer;
}
.clear-link:hover { color: #f87171; }

/* ── Set pills ───────────────────────────────────────────────────────────── */
.set-pills { display: none; gap: 0.35rem; padding: 0.35rem 1.25rem; background: #0f0f13; flex-wrap: wrap; align-items: center; flex-shrink: 0; }
@media (min-width: 768px) { .set-pills { display: flex; } }
.pills-label { font-size: 0.65rem; color: #44445a; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }
.pill { background: #161620; border: 1px solid #2a2a38; color: #66669a; padding: 0.15rem 0.45rem; border-radius: 3px; font-size: 0.67rem; cursor: pointer; }
.pill:hover  { background: #22223a; color: #aaaadd; }
.pill.active { background: #22225a; border-color: #5555aa; color: #9999ff; }

/* ── View tabs ──────────────────────────────────────────────────────────── */
.view-tabs {
  display: flex;
  gap: 0;
  background: #1a1a24;
  border-bottom: 1px solid #2e2e42;
  flex-shrink: 0;
}
.view-tab {
  flex: 1;
  background: #15151e;
  border: none;
  border-bottom: 2px solid transparent;
  color: #6666aa;
  padding: 0.6rem 1rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.view-tab:hover { background: #1e1e2e; color: #9999dd; }
.view-tab.active { background: #1a1a24; border-bottom-color: #7070e0; color: #c0c0ff; }
.tab-count { font-size: 0.7rem; color: #44445a; margin-left: 0.35rem; font-weight: 400; }
.view-tab.active .tab-count { color: #7070e0; }

.body { display: flex; flex: 1; overflow: hidden; }

/* WP-114: stack LoadoutPreview above LoadoutBuilder inside the Loadout tab */
.loadout-tab-stack { display: flex; flex-direction: column; flex: 1; overflow: auto; }

/* ── Compact mode for short viewports ────────────────────────────────────── */
@media (max-height: 800px) {
  .header { padding-block: 0.4rem; }
  .logo { font-size: 0.95rem; }
  .view-tab { padding: 0.35rem 0.75rem; }
  .filter-bar { padding-block: 0.4rem; }
  .filter-drawer-row { padding-block: 0.35rem; }
  .type-bar { padding-block: 0.35rem; }
  .set-pills { padding-block: 0.25rem; }
}
</style>
