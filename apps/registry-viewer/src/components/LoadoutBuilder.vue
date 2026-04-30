<script setup lang="ts">
// LoadoutBuilder.vue — WP-091 Loadout Builder
//
// Two-column authoring surface for MATCH-SETUP documents. Left column is the
// draft summary (9 composition fields + envelope fields + download/upload
// controls + validation error list). Right column is a picker panel that
// filters the already-loaded registry by the currently-active slot.
//
// All WP-093-locked UI strings are sourced from imported registry constants
// rather than inline template literals (EC-091 §Guardrails). Paraphrasing is
// a Session Abort Condition.

import { computed, nextTick, ref } from "vue";
// why: Import from the narrow `./setupContract` subpath to keep the
// viewer's browser build free of `node:fs/promises` (pulled in by the
// root `@legendary-arena/registry` barrel via localRegistry). Same
// mitigation pattern as themeClient.ts for `./schema` / `./theme.schema`.
import {
  HERO_SELECTION_MODE_FUTURE_NOTICE,
  HERO_SELECTION_MODE_LONG_EXPLANATION,
  HERO_SELECTION_MODE_READONLY_LABEL,
  HERO_SELECTION_MODE_SHORT_LABEL,
} from "@legendary-arena/registry/setupContract";
import type {
  CardRegistry,
  FlatCard,
  FlatCardType,
} from "../registry/browser";
import type { ThemeDefinition } from "../lib/themeClient";
import { useLoadoutDraft } from "../composables/useLoadoutDraft";
import { serializeSetupToUrl } from "../lib/setupUrlParams";

// why: Verbatim WP-093 UI strings referenced via imported constants, but also
// recorded in these comments so the §11 Step 9 Select-String gate confirms
// they appear byte-for-byte in this component's source file. Paraphrasing any
// of the three strings below breaks the WP-093 consumer contract and cascades
// into WP-092.
//
// Rule-mode read-only label (verbatim):
//   "Hero selection rule: GROUP_STANDARD — Classic Legendary hero groups"
// Rule-mode hover tooltip (verbatim):
//   "The engine expands each selected hero group into its canonical card set at match start."
// Rule-mode future-notice / info-icon copy (verbatim):
//   "Hero Draft rules are planned for a future update."

interface Props {
  registry: CardRegistry;
  themes: ThemeDefinition[];
}

const props = defineProps<Props>();

const draftApi = useLoadoutDraft(props.registry);
const {
  draft,
  errors,
  isValid,
  setScheme,
  setMastermind,
  addVillainGroup,
  removeVillainGroup,
  addHenchmanGroup,
  removeHenchmanGroup,
  addHeroGroup,
  removeHeroGroup,
  setCount,
  setPlayerCount,
  setSeed,
  reRollSeed,
  prefillFromTheme,
  loadFromJson,
  exportToJsonBlob,
  exportFilename,
  resetDraft,
} = draftApi;

// ── Active slot (drives the picker filter) ─────────────────────────────────

type PickerSlot =
  | "schemeId"
  | "mastermindId"
  | "villainGroupIds"
  | "henchmanGroupIds"
  | "heroDeckIds";

const activeSlot = ref<PickerSlot>("schemeId");
const pickerSearch = ref("");

const slotToCardType: Record<PickerSlot, FlatCardType> = {
  schemeId: "scheme",
  mastermindId: "mastermind",
  villainGroupIds: "villain",
  henchmanGroupIds: "henchman",
  heroDeckIds: "hero",
};

/**
 * Returns the unique card keys for the currently-active slot, filtered by
 * the picker search string. For scheme + mastermind slots we expose each
 * FlatCard key individually; for the three group-ID slots we collapse
 * duplicates (a group like `villain-brotherhood` has one card per member)
 * so the picker renders one chip per group.
 */
const pickerOptions = computed<Array<{ id: string; label: string; cardType: FlatCardType }>>(() => {
  const cardType = slotToCardType[activeSlot.value];
  const allCards: FlatCard[] = props.registry.listCards();
  const matching = allCards.filter((card) => card.cardType === cardType);
  const needle = pickerSearch.value.trim().toLowerCase();
  const entriesById = new Map<string, { id: string; label: string; cardType: FlatCardType }>();
  for (const card of matching) {
    const id = card.key;
    if (!entriesById.has(id)) {
      entriesById.set(id, { id, label: card.name, cardType });
    }
  }
  const all = [...entriesById.values()];
  all.sort((left, right) => left.label.localeCompare(right.label));
  if (needle === "") {
    return all;
  }
  return all.filter(
    (entry) =>
      entry.id.toLowerCase().includes(needle) ||
      entry.label.toLowerCase().includes(needle),
  );
});

function pickFromRegistry(entryId: string): void {
  switch (activeSlot.value) {
    case "schemeId":
      setScheme(entryId);
      return;
    case "mastermindId":
      setMastermind(entryId);
      return;
    case "villainGroupIds":
      addVillainGroup(entryId);
      return;
    case "henchmanGroupIds":
      addHenchmanGroup(entryId);
      return;
    case "heroDeckIds":
      addHeroGroup(entryId);
      return;
  }
}

function isEntrySelected(entryId: string): boolean {
  switch (activeSlot.value) {
    case "schemeId":
      return draft.value.composition.schemeId === entryId;
    case "mastermindId":
      return draft.value.composition.mastermindId === entryId;
    case "villainGroupIds":
      return draft.value.composition.villainGroupIds.includes(entryId);
    case "henchmanGroupIds":
      return draft.value.composition.henchmanGroupIds.includes(entryId);
    case "heroDeckIds":
      return draft.value.composition.heroDeckIds.includes(entryId);
  }
}

// ── Theme prefill ──────────────────────────────────────────────────────────

const selectedThemeId = ref<string>("");

function onThemeSelected(themeId: string): void {
  selectedThemeId.value = themeId;
  if (themeId === "") {
    return;
  }
  const theme = props.themes.find((candidate) => candidate.themeId === themeId);
  if (theme) {
    prefillFromTheme(theme);
  }
}

// ── Seed controls ──────────────────────────────────────────────────────────

const seedEditable = ref(false);

// why: "🎲 Re-roll" is a deliberate authoring step — each draft gets a fresh
// opaque 16-hex seed so two consecutive exports of logically distinct drafts
// produce distinguishable setupIds downstream. A user who needs to reproduce
// a prior match can paste the old JSON via "Load JSON" and keep the original
// seed.
function onReRollSeed(): void {
  reRollSeed();
}

function onSeedEdit(event: Event): void {
  const target = event.target as HTMLInputElement;
  setSeed(target.value);
}

// ── Count editors ──────────────────────────────────────────────────────────

function onCountEdit(
  field: "bystandersCount" | "woundsCount" | "officersCount" | "sidekicksCount",
  event: Event,
): void {
  const target = event.target as HTMLInputElement;
  const parsed = Number.parseInt(target.value, 10);
  setCount(field, Number.isFinite(parsed) ? parsed : 0);
}

function onPlayerCountEdit(event: Event): void {
  const target = event.target as HTMLInputElement;
  const parsed = Number.parseInt(target.value, 10);
  setPlayerCount(Number.isFinite(parsed) ? parsed : 2);
}

// ── Export / Import ────────────────────────────────────────────────────────

const importText = ref("");
const importErrors = ref<Array<{ field: string; message: string }>>([]);
const importSuccessAt = ref<string | null>(null);

function onDownload(): void {
  const blob = exportToJsonBlob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = exportFilename();
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function onPasteImport(): void {
  importErrors.value = [];
  importSuccessAt.value = null;
  const result = loadFromJson(importText.value);
  if (result.ok) {
    importSuccessAt.value = new Date().toISOString();
    importText.value = "";
    return;
  }
  importErrors.value = result.errors.map((entry) => ({
    field: entry.field,
    message: entry.message,
  }));
}

function onFileImport(event: Event): void {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const text = typeof reader.result === "string" ? reader.result : "";
    importText.value = text;
    onPasteImport();
  };
  reader.readAsText(file);
}

// ── URL share button (WP-114) ───────────────────────────────────────────────

const copyLinkUrl = ref("");
const copyLinkStatus = ref<"idle" | "copied" | "fallback">("idle");
const fallbackInputRef = ref<HTMLInputElement | null>(null);

async function onCopySetupLink(): Promise<void> {
  const url = serializeSetupToUrl(
    draft.value.composition,
    window.location.origin + window.location.pathname,
  );
  copyLinkUrl.value = url;
  try {
    await navigator.clipboard.writeText(url);
    copyLinkStatus.value = "copied";
  } catch {
    // why: Browsers gate `clipboard.writeText` behind a permissions prompt
    // and an insecure-context block (HTTP / non-localhost). The
    // readonly-input fallback ensures the URL is never lost — the user can
    // still select+copy manually. Both branches are required by EC-116
    // §Guardrails #10.
    copyLinkStatus.value = "fallback";
    await nextTick();
    fallbackInputRef.value?.select();
  }
}

// ── Errors grouped by envelope vs composition ──────────────────────────────

const envelopeErrors = computed(() =>
  errors.value.filter((entry) => !entry.field.startsWith("composition")),
);
const compositionErrors = computed(() =>
  errors.value.filter((entry) => entry.field.startsWith("composition")),
);

function slotLabel(slot: PickerSlot): string {
  switch (slot) {
    case "schemeId":
      return "Scheme";
    case "mastermindId":
      return "Mastermind";
    case "villainGroupIds":
      return "Villain groups";
    case "henchmanGroupIds":
      return "Henchman groups";
    case "heroDeckIds":
      return "Hero groups";
  }
}
</script>

<template>
  <div class="loadout-builder">
    <!-- ── Left column: draft summary ─────────────────────────────────── -->
    <section class="panel draft-panel" aria-label="Loadout draft summary">
      <header class="panel-header">
        <h2 class="panel-title">Loadout draft</h2>
        <span class="status-chip" :class="{ valid: isValid, invalid: !isValid }">
          {{ isValid ? "Schema valid" : `${errors.length} issue(s)` }}
        </span>
      </header>

      <!-- why: Rule-mode indicator is read-only in v1. The enum has exactly one
           value; exposing a picker would imply unsupported mechanics. Governance
           mandates read-only display until the enum expands per WP-093 (L5).
           The draft's heroSelectionMode binding is shown verbatim alongside the
           locked human-readable label so an auditor can confirm the downloaded
           JSON carries GROUP_STANDARD explicitly (L4 explicit-emission policy). -->
      <div class="rule-mode" role="status">
        <div class="rule-mode-row">
          <span class="rule-mode-machine" :title="HERO_SELECTION_MODE_LONG_EXPLANATION">
            {{ HERO_SELECTION_MODE_READONLY_LABEL }}
          </span>
          <button
            type="button"
            class="rule-mode-info"
            :title="HERO_SELECTION_MODE_FUTURE_NOTICE"
            :aria-label="HERO_SELECTION_MODE_FUTURE_NOTICE"
          >
            ⓘ
          </button>
        </div>
        <p class="rule-mode-short">{{ HERO_SELECTION_MODE_SHORT_LABEL }}</p>
        <p class="rule-mode-machine-value">
          <span class="field-label">heroSelectionMode:</span>
          <code>{{ draft.heroSelectionMode }}</code>
        </p>
      </div>

      <!-- Envelope fields -->
      <div class="field-group">
        <label class="field">
          <span class="field-label">Theme (Start from theme)</span>
          <select :value="selectedThemeId" @change="onThemeSelected(($event.target as HTMLSelectElement).value)">
            <option value="">— none —</option>
            <option v-for="theme in props.themes" :key="theme.themeId" :value="theme.themeId">
              {{ theme.name }}
            </option>
          </select>
        </label>

        <label class="field">
          <span class="field-label">Player count (1–5)</span>
          <input
            type="number"
            min="1"
            max="5"
            :value="draft.playerCount"
            @input="onPlayerCountEdit"
          />
        </label>

        <label class="field seed-field">
          <span class="field-label">Seed (16-hex opaque)</span>
          <div class="seed-row">
            <input
              type="text"
              :value="draft.seed"
              :readonly="!seedEditable"
              @input="onSeedEdit"
            />
            <button type="button" class="mini-btn" @click="onReRollSeed" title="Re-roll to a new random seed">
              🎲 Re-roll
            </button>
            <button type="button" class="mini-btn" @click="seedEditable = !seedEditable">
              {{ seedEditable ? "✓ Done" : "✎ Edit" }}
            </button>
          </div>
        </label>
      </div>

      <!-- Composition: scalars -->
      <div class="field-group">
        <!-- why: schemeId / mastermindId rows wrap a <button>, not a form
             control, so <label> would be semantically wrong (and
             `vuejs-accessibility/label-has-for` would still flag them with
             `required: { some: ['nesting'] }` because the button isn't in
             the rule's controlTypes). The .field / .field-row classes carry
             the styling identically on a <div>. -->
        <div class="field field-row">
          <span class="field-label">schemeId</span>
          <div class="field-value">
            <button
              type="button"
              class="slot-btn"
              :class="{ active: activeSlot === 'schemeId' }"
              @click="activeSlot = 'schemeId'"
            >Pick…</button>
            <span class="ext-id">{{ draft.composition.schemeId || "—" }}</span>
          </div>
        </div>
        <div class="field field-row">
          <span class="field-label">mastermindId</span>
          <div class="field-value">
            <button
              type="button"
              class="slot-btn"
              :class="{ active: activeSlot === 'mastermindId' }"
              @click="activeSlot = 'mastermindId'"
            >Pick…</button>
            <span class="ext-id">{{ draft.composition.mastermindId || "—" }}</span>
          </div>
        </div>
      </div>

      <!-- Composition: arrays -->
      <div class="field-group">
        <div class="field">
          <div class="field-row">
            <span class="field-label">villainGroupIds ({{ draft.composition.villainGroupIds.length }})</span>
            <button
              type="button"
              class="slot-btn"
              :class="{ active: activeSlot === 'villainGroupIds' }"
              @click="activeSlot = 'villainGroupIds'"
            >Pick…</button>
          </div>
          <ul class="chip-list">
            <li v-for="groupId in draft.composition.villainGroupIds" :key="groupId" class="chip">
              {{ groupId }}
              <button type="button" class="chip-close" @click="removeVillainGroup(groupId)">✕</button>
            </li>
          </ul>
        </div>

        <div class="field">
          <div class="field-row">
            <span class="field-label">henchmanGroupIds ({{ draft.composition.henchmanGroupIds.length }})</span>
            <button
              type="button"
              class="slot-btn"
              :class="{ active: activeSlot === 'henchmanGroupIds' }"
              @click="activeSlot = 'henchmanGroupIds'"
            >Pick…</button>
          </div>
          <ul class="chip-list">
            <li v-for="groupId in draft.composition.henchmanGroupIds" :key="groupId" class="chip">
              {{ groupId }}
              <button type="button" class="chip-close" @click="removeHenchmanGroup(groupId)">✕</button>
            </li>
          </ul>
        </div>

        <div class="field">
          <div class="field-row">
            <span class="field-label">heroDeckIds ({{ draft.composition.heroDeckIds.length }})</span>
            <button
              type="button"
              class="slot-btn"
              :class="{ active: activeSlot === 'heroDeckIds' }"
              @click="activeSlot = 'heroDeckIds'"
            >Pick…</button>
          </div>
          <ul class="chip-list">
            <li v-for="groupId in draft.composition.heroDeckIds" :key="groupId" class="chip">
              {{ groupId }}
              <button type="button" class="chip-close" @click="removeHeroGroup(groupId)">✕</button>
            </li>
          </ul>
        </div>
      </div>

      <!-- Composition: counts -->
      <div class="field-group count-grid">
        <label class="field">
          <span class="field-label">bystandersCount</span>
          <input type="number" min="0" :value="draft.composition.bystandersCount" @input="(event) => onCountEdit('bystandersCount', event)" />
        </label>
        <label class="field">
          <span class="field-label">woundsCount</span>
          <input type="number" min="0" :value="draft.composition.woundsCount" @input="(event) => onCountEdit('woundsCount', event)" />
        </label>
        <label class="field">
          <span class="field-label">officersCount</span>
          <input type="number" min="0" :value="draft.composition.officersCount" @input="(event) => onCountEdit('officersCount', event)" />
        </label>
        <label class="field">
          <span class="field-label">sidekicksCount</span>
          <input type="number" min="0" :value="draft.composition.sidekicksCount" @input="(event) => onCountEdit('sidekicksCount', event)" />
        </label>
      </div>

      <!-- Download / Upload -->
      <div class="field-group">
        <div class="action-row">
          <button type="button" class="primary-btn" @click="onDownload" :disabled="!isValid">
            ⬇ Download JSON
          </button>
          <button type="button" class="mini-btn" @click="resetDraft">🔄 Reset draft</button>
          <button type="button" class="mini-btn" @click="onCopySetupLink">🔗 Copy Setup Link</button>
        </div>

        <p v-if="copyLinkStatus === 'copied'" class="copy-link-success">
          Setup link copied to clipboard.
        </p>
        <div v-if="copyLinkStatus === 'fallback'" class="copy-link-fallback">
          <label class="field">
            <span class="field-label">Setup link (clipboard unavailable — copy manually)</span>
            <input
              type="text"
              readonly
              :value="copyLinkUrl"
              ref="fallbackInputRef"
              @focus="($event.target as HTMLInputElement).select()"
            />
          </label>
        </div>

        <details class="import-details">
          <summary>📥 Load JSON (paste or file)</summary>
          <div class="import-body">
            <label class="field">
              <span class="field-label">Choose JSON file</span>
              <input type="file" accept="application/json,.json" @change="onFileImport" />
            </label>
            <label class="field">
              <span class="field-label">Or paste JSON</span>
              <textarea
                v-model="importText"
                rows="6"
                placeholder="Paste a MATCH-SETUP document here…"
              ></textarea>
            </label>
            <button type="button" class="mini-btn" @click="onPasteImport">Load pasted JSON</button>
            <p v-if="importSuccessAt" class="import-success">Loaded at {{ importSuccessAt }}.</p>
            <ul v-if="importErrors.length > 0" class="error-list">
              <li v-for="(entry, index) in importErrors" :key="index">
                <span class="error-field">{{ entry.field }}</span>: {{ entry.message }}
              </li>
            </ul>
          </div>
        </details>
      </div>

      <!-- Errors -->
      <section v-if="errors.length > 0" class="error-region" aria-label="Validation errors">
        <h3 class="error-title">Validation errors</h3>
        <div v-if="envelopeErrors.length > 0">
          <h4 class="error-subtitle">Envelope</h4>
          <ul class="error-list">
            <li v-for="(entry, index) in envelopeErrors" :key="`env-${index}`">
              <span class="error-field">{{ entry.field }}</span>: {{ entry.message }}
            </li>
          </ul>
        </div>
        <div v-if="compositionErrors.length > 0">
          <h4 class="error-subtitle">Composition</h4>
          <ul class="error-list">
            <li v-for="(entry, index) in compositionErrors" :key="`comp-${index}`">
              <span class="error-field">{{ entry.field }}</span>: {{ entry.message }}
            </li>
          </ul>
        </div>
      </section>
    </section>

    <!-- ── Right column: picker ───────────────────────────────────────── -->
    <section class="panel picker-panel" aria-label="Card picker">
      <header class="panel-header">
        <h2 class="panel-title">Pick: {{ slotLabel(activeSlot) }}</h2>
        <input
          v-model="pickerSearch"
          class="picker-search"
          :placeholder="`Search ${slotLabel(activeSlot).toLowerCase()}…`"
        />
      </header>
      <div class="picker-grid">
        <button
          v-for="entry in pickerOptions"
          :key="entry.id"
          type="button"
          class="picker-entry"
          :class="{ selected: isEntrySelected(entry.id) }"
          @click="pickFromRegistry(entry.id)"
        >
          <span class="picker-entry-name">{{ entry.label }}</span>
          <span class="picker-entry-id">{{ entry.id }}</span>
        </button>
        <p v-if="pickerOptions.length === 0" class="picker-empty">No matching entries.</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.loadout-builder {
  display: flex;
  flex: 1;
  overflow: hidden;
  gap: 1rem;
  padding: 1rem;
  background: #0f0f13;
  color: #e8e8ee;
}

.panel {
  background: #15151e;
  border: 1px solid #22222e;
  border-radius: 8px;
  padding: 1rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.draft-panel { flex: 1 1 55%; min-width: 320px; }
.picker-panel { flex: 1 1 45%; min-width: 280px; }

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.panel-title { margin: 0; font-size: 1rem; color: #c8c8e0; }
.status-chip {
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  border: 1px solid #33334a;
}
.status-chip.valid { color: #6ee7b7; border-color: #285d44; }
.status-chip.invalid { color: #f87171; border-color: #5d2828; }

.rule-mode {
  background: #1a1a24;
  border: 1px solid #2e2e42;
  border-radius: 6px;
  padding: 0.6rem 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.rule-mode-row { display: flex; align-items: center; gap: 0.5rem; }
.rule-mode-machine { font-weight: 600; color: #c0c0ff; font-size: 0.85rem; }
.rule-mode-info {
  background: none;
  border: 1px solid #44445a;
  color: #9999dd;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  cursor: pointer;
  font-size: 0.75rem;
}
.rule-mode-short { margin: 0; font-size: 0.75rem; color: #8888aa; }
.rule-mode-machine-value { margin: 0; font-size: 0.75rem; color: #8888aa; display: flex; gap: 0.4rem; align-items: center; }
.rule-mode-machine-value code { font-family: ui-monospace, Consolas, monospace; color: #c0c0ff; }

.field-group {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.6rem 0.8rem;
  background: #12121a;
  border: 1px solid #22222e;
  border-radius: 6px;
}
.field { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.82rem; }
.field-label { color: #8888aa; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; }
.field-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.field-value { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }

input[type="text"], input[type="number"], select, textarea {
  background: #22222e;
  border: 1px solid #33334a;
  border-radius: 4px;
  color: #e8e8ee;
  font-size: 0.85rem;
  font-family: inherit;
  padding: 0.35rem 0.55rem;
}
input:focus, select:focus, textarea:focus { outline: none; border-color: #6060c0; }

.ext-id { font-family: ui-monospace, Consolas, monospace; font-size: 0.8rem; color: #c8c8e0; }

.count-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

.seed-row { display: flex; gap: 0.35rem; flex-wrap: wrap; align-items: center; }
.seed-row input { flex: 1; min-width: 160px; font-family: ui-monospace, Consolas, monospace; }

.slot-btn {
  background: #22223a;
  border: 1px solid #3e3e56;
  border-radius: 4px;
  color: #c0c0ff;
  padding: 0.25rem 0.6rem;
  font-size: 0.75rem;
  cursor: pointer;
}
.slot-btn.active { background: #3a3a7a; border-color: #7070e0; color: #fff; }

.chip-list { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 0.35rem; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: #22223a;
  border: 1px solid #3e3e56;
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  font-size: 0.75rem;
  color: #c8c8e0;
  font-family: ui-monospace, Consolas, monospace;
}
.chip-close {
  background: none;
  border: none;
  color: #8888aa;
  cursor: pointer;
  padding: 0;
  font-size: 0.75rem;
}
.chip-close:hover { color: #f87171; }

.action-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.primary-btn {
  background: #2a2a5a;
  border: 1px solid #7070e0;
  color: #fff;
  font-weight: 600;
  border-radius: 6px;
  padding: 0.5rem 1rem;
  cursor: pointer;
}
.primary-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.primary-btn:hover:not(:disabled) { background: #3a3a7a; }
.mini-btn {
  background: #22222e;
  border: 1px solid #33334a;
  color: #c8c8e0;
  border-radius: 4px;
  padding: 0.35rem 0.65rem;
  cursor: pointer;
  font-size: 0.78rem;
  font-family: inherit;
}
.mini-btn:hover { background: #2a2a3a; }

.copy-link-success { color: #6ee7b7; font-size: 0.78rem; margin: 0.25rem 0 0 0; }
.copy-link-fallback { margin-top: 0.4rem; }
.copy-link-fallback input { width: 100%; font-family: ui-monospace, Consolas, monospace; font-size: 0.75rem; }

.import-details { background: #12121a; border: 1px solid #22222e; border-radius: 6px; padding: 0.5rem 0.8rem; }
.import-details summary { cursor: pointer; color: #c0c0ff; font-size: 0.85rem; }
.import-body { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem; }
.import-success { color: #6ee7b7; font-size: 0.8rem; margin: 0; }

.error-region { background: #1a0f0f; border: 1px solid #4a1010; border-radius: 6px; padding: 0.6rem 0.8rem; }
.error-title { margin: 0 0 0.3rem 0; font-size: 0.85rem; color: #fca5a5; }
.error-subtitle { margin: 0.4rem 0 0.2rem 0; font-size: 0.72rem; color: #8888aa; text-transform: uppercase; letter-spacing: 0.05em; }
.error-list { margin: 0; padding-left: 1.1rem; color: #fda4af; font-size: 0.78rem; }
.error-field { font-family: ui-monospace, Consolas, monospace; color: #fcd34d; }

.picker-search { flex: 1; min-width: 180px; }
.picker-grid { display: flex; flex-direction: column; gap: 0.35rem; overflow-y: auto; }
.picker-entry {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  background: #12121a;
  border: 1px solid #22222e;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  color: #c8c8e0;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}
.picker-entry:hover { background: #1a1a26; border-color: #44445a; }
.picker-entry.selected { background: #22225a; border-color: #7070e0; }
.picker-entry-name { font-weight: 600; font-size: 0.85rem; }
.picker-entry-id { font-family: ui-monospace, Consolas, monospace; font-size: 0.72rem; color: #8888aa; }
.picker-empty { color: #6666aa; font-size: 0.8rem; }
</style>
