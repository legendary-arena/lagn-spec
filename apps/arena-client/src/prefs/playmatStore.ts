/**
 * playmatStore.ts
 *
 * Pinia setup store for the active playmat skin preference. Single
 * section, single key, single setter — the WP-121 / WP-124 single-key
 * preferences pattern (`useCardSize` / `useThemeSize`) wrapped in a
 * `defineStore('playmat', () => { … })` setup store so Vue devtools
 * surfaces it consistently with the existing arena-client UI store
 * (`stores/uiState.ts`).
 *
 * The multi-section preferences subsystem (`createPreferencesStore`
 * factory, section registry, schema-version envelope) sketched by the
 * unmerged WP-068 branch is **out of scope** per pre-flight 2026-05-04
 * PS-1 Option A. Should arena-client gain a second preference section
 * in the future, that's the trigger for the deferred WP-068 work — not
 * a refactor of this store.
 *
 * The store lazy-initializes on first `usePlaymat()` call (the
 * standard Pinia setup-store contract); no side-effect bootstrap
 * import is required in `apps/arena-client/src/main.ts`.
 *
 * @see WP-130 §A "Pinia preferences store"
 * @see DECISIONS.md D-13001..D-13005
 */

import { defineStore } from 'pinia';
import { ref, type Ref } from 'vue';
import { skinManifest, type SkinName } from './skinManifest';
import { loadActiveSkin, saveActiveSkin } from './persistence';

/**
 * `usePlaymat()` returns the singleton Pinia store. The first call
 * reads `localStorage` once via `loadActiveSkin()`; subsequent calls
 * within the same client lifetime reuse the same reactive ref.
 *
 * Pinia auto-unwraps refs returned from the setup function: consumers
 * read `store.activeSkin` (a `SkinName`, reactive via Pinia's Proxy)
 * rather than `store.activeSkin.value`. Use `storeToRefs(store)` only
 * when an explicit `Ref` is required (e.g., to pass into a `watch`
 * outside the store).
 *
 * Adding new bundled skins is purely a manifest concern — no store or
 * schema change is required (see `skinManifest.ts`).
 */
export const usePlaymat = defineStore('playmat', () => {
  const initial = loadActiveSkin();
  const activeSkin: Ref<SkinName> = ref(initial);

  // why: `Object.keys()` returns insertion-order keys per the JS
  // spec, so the manifest declaration order in `skinManifest.ts`
  // becomes the selector display order. Adding a new bundled skin
  // therefore controls its placement in the selector by where it
  // sits in the manifest literal. Casting through `SkinName[]` is
  // safe because the manifest-keys-to-`SkinName` invariant is
  // guarded by the drift test in `playmatSchema.test.ts`.
  const availableSkins: readonly SkinName[] = Object.keys(skinManifest) as SkinName[];

  /**
   * Sets the active skin synchronously: the Pinia ref update and the
   * `localStorage` write happen in the same tick. No `async`, no
   * `await`, no network round-trip — locked under EC-133 §3.
   *
   * Caller responsibility: pass a value that is already a member of
   * the closed `SkinName` set (the selector UI reads `availableSkins`
   * so this holds by construction). Defensive validation lives in
   * `loadActiveSkin()` for the `localStorage` round-trip path.
   */
  function setActiveSkin(name: SkinName): void {
    // why: WP-121 / WP-124 sync-write precedent — the in-memory ref
    // updates before persistence so a `setItem` failure leaves the
    // UI in the correct state for the rest of the session. EC-133
    // §3 forbids making this async or wrapping it in a network
    // call; a future WP that adds server-side sync per D-13004 is
    // expected to layer on top of this sync write rather than
    // replace it.
    activeSkin.value = name;
    saveActiveSkin(name);
  }

  return {
    activeSkin,
    availableSkins,
    setActiveSkin,
  };
});
