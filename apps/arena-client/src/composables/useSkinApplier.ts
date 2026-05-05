/**
 * useSkinApplier.ts
 *
 * Applies the active playmat skin's CSS class to the `<PlayViewport>`
 * root element and ensures the matching `<link rel="stylesheet">` is
 * present in `document.head`. The composable is the sole point in the
 * arena-client tree that touches DOM CSS class state for skinning;
 * application to `<body>` or any global document node is forbidden
 * (would bleed skin styling into non-Play pages, contaminate replays,
 * and break Teleport-based overlays).
 *
 * On asset-load failure — defined narrowly per D-13005 as any error
 * resolving the active `SkinName` to a manifest entry OR applying its
 * corresponding CSS class — the applier falls back unconditionally to
 * `'classic'` and emits a single `console.warn` per `00.6` Rule 11.
 * Image preloading, network probing, decode-error retries, and
 * HEAD-checks against R2 are explicitly out of scope.
 *
 * @see WP-130 §D "Skin application"
 * @see DECISIONS.md D-13005 (asset-failure fallback)
 */

import { onMounted, onUnmounted, watchEffect, type Ref } from 'vue';
import { skinManifest, type SkinName } from '../prefs/skinManifest';
import { DEFAULT_SKIN_NAME } from '../prefs/playmatSchema';
import { usePlaymat } from '../prefs/playmatStore';

/**
 * Per-document set of skin theme stylesheet URLs already injected.
 * Module-scoped so multiple `<PlayViewport>` mounts in the same tab
 * (vanishingly rare, but possible during HMR) don't double-inject.
 * Cleared on the rare `useSkinApplier` callsite where the consumer
 * unmounts; we leave injected `<link>` nodes in place because removing
 * them would FOUC the next mount.
 */
const injectedThemeUrls = new Set<string>();

/**
 * Reverse-lookup table from `cssClassName` to the manifest entry, used
 * to remove every stale skin class from the root before applying the
 * active one. Built once at module load.
 */
const ALL_SKIN_CLASS_NAMES: readonly string[] = Object.values(skinManifest).map(
  (entry) => entry.cssClassName,
);

/**
 * Watches the active skin from the playmat store and toggles the
 * matching CSS class on the supplied root element. Pass the ref
 * returned by Vue's `useTemplateRef('viewportRoot')` (or equivalent
 * `ref<HTMLElement | null>`). The effect short-circuits silently when
 * the ref is `null` — typical during the first render tick before the
 * template binds — and re-runs once the element mounts.
 */
export function useSkinApplier(rootElement: Ref<HTMLElement | null>): void {
  const playmat = usePlaymat();

  // why: `watchEffect` re-runs whenever its reactive dependencies
  // change. The effect reads `playmat.activeSkin` (Pinia
  // auto-unwraps the underlying ref through its Proxy and tracks the
  // read) and `rootElement.value` (a real Vue ref); a change to
  // either re-runs the effect, which is exactly the propagation
  // contract WP-130 §D calls for. Vue's reactivity model guarantees
  // the re-run lands within the same tick as the dependency change,
  // so the `<PlayViewport>` root reflects the new skin within one
  // Vue tick per WP-130 §C acceptance criterion.
  watchEffect(() => {
    const root = rootElement.value;
    if (root === null) {
      // Template ref not yet bound — wait for the next tick.
      return;
    }
    const targetSkin = playmat.activeSkin;
    applySkinToElement(root, targetSkin);
  });

  // Mount-time and unmount-time hooks are intentionally omitted: the
  // `watchEffect` above covers initial application as soon as the
  // template ref binds, and tearing down the class on unmount is
  // unnecessary because the element itself is going away. Hooks are
  // declared as no-ops so test harnesses that introspect lifecycle
  // wiring see a stable shape.
  onMounted(() => {
    /* no-op — watchEffect handles initial application */
  });
  onUnmounted(() => {
    /* no-op — element is going away */
  });
}

/**
 * Idempotently applies the named skin's CSS class to the supplied root
 * element and ensures the matching theme stylesheet is loaded. On any
 * failure, falls back to `'classic'` per D-13005 and emits a
 * `console.warn` once.
 *
 * Exported for the unit tests; production callers go through
 * `useSkinApplier()`.
 */
export function applySkinToElement(root: HTMLElement, skin: SkinName): void {
  const entry = skinManifest[skin];
  if (entry === undefined) {
    // why: D-13005 unconditional fallback — the narrow asset-failure
    // definition (any error resolving the active `SkinName` to a
    // manifest entry OR applying its corresponding CSS class) covers
    // this branch. We do not preload images, do not probe network,
    // do not retry; we recover synchronously with the
    // `DEFAULT_SKIN_NAME` and surface the failure once via Rule 11
    // full-sentence diagnostic. Casting to `string` is safe because
    // `skin` is already typed as `SkinName` — the runtime miss
    // means the manifest has drifted from the type, which is the
    // exact case the drift test in `playmatSchema.test.ts` catches
    // at build time.
    console.warn(
      `[playmat] Failed to resolve skin name '${String(skin)}' against the bundled manifest; falling back to '${DEFAULT_SKIN_NAME}' per D-13005. Available skins: ${Object.keys(skinManifest).join(', ')}.`,
    );
    applySkinToElement(root, DEFAULT_SKIN_NAME);
    return;
  }

  ensureThemeStylesheet(entry.themeCssUrl);

  try {
    // why: the CSS class application is exclusive to the
    // `<PlayViewport>` root supplied by the caller. EC-133 §3
    // forbids application to `<body>` or any global document node —
    // global application would bleed skin styling into non-Play
    // pages (lobby, replay-viewer, future routes), contaminate
    // Teleport-based overlays mounted under `document.body`, and
    // make replays render in the original player's skin instead of
    // the spectator's preference.
    for (const stale of ALL_SKIN_CLASS_NAMES) {
      if (stale !== entry.cssClassName) {
        root.classList.remove(stale);
      }
    }
    root.classList.add(entry.cssClassName);
  } catch (error) {
    // why: D-13005 unconditional fallback — class manipulation can
    // throw in obscure situations (the supplied element is detached
    // and a polyfilled `classList` rejects, or the element is not
    // a real `Element` in a degraded JSDOM harness). Recover with
    // the default skin name and surface the cause once.
    console.warn(
      `[playmat] Failed to apply skin class '${entry.cssClassName}' to PlayViewport root; falling back to '${DEFAULT_SKIN_NAME}' per D-13005. Underlying cause: ${error instanceof Error ? error.message : String(error)}.`,
    );
    if (skin !== DEFAULT_SKIN_NAME) {
      applySkinToElement(root, DEFAULT_SKIN_NAME);
    }
  }
}

/**
 * Inserts a `<link rel="stylesheet" href="...">` element into
 * `document.head` for the supplied theme stylesheet URL when one is
 * not already present. Idempotent: subsequent calls with the same URL
 * are no-ops. Side-effects only on the first call per URL per
 * document; safe under HMR and re-mount.
 */
function ensureThemeStylesheet(href: string): void {
  if (typeof document === 'undefined') {
    // SSR or otherwise headless environment — nothing to do; the
    // store-side state is still consistent for the next mount.
    return;
  }
  if (injectedThemeUrls.has(href)) {
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.skinTheme = href;
  document.head.appendChild(link);
  injectedThemeUrls.add(href);
}

/**
 * Test-only hook to clear the per-document injected-stylesheet cache.
 * Production callers must not depend on this; it exists so unit tests
 * can mount/unmount in isolation without leaking link nodes between
 * cases.
 */
export function __resetSkinApplierForTests(): void {
  injectedThemeUrls.clear();
}
