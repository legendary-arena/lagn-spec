/**
 * skinManifest.ts
 *
 * Canonical source of truth for the bundled-with-client skin set per
 * D-13001 (discovery mechanism = bundled at MVP) and D-13003 (locked
 * bundled set = `classic` + `comic` + `minimal`). The `SkinName` type
 * is derived from the keys of `skinManifest`; the schema-validation
 * narrower in `playmatSchema.ts` MUST derive its closed set from the
 * same keys via `Object.keys(skinManifest)` rather than re-declaring
 * the union by hand. Hand-duplicating the union alongside the manifest
 * is forbidden — see `EC-133 §3 Guardrails` and `EC-133 §Common Failure
 * Smells`.
 *
 * Asset URL resolution uses the `new URL(path, import.meta.url).href`
 * pattern. Vite transforms this at build time into a hashed bundle URL
 * (production) or a dev-server URL (dev); Node resolves it to a
 * `file://` URL (tests). The manifest never tries to read the asset
 * contents at module-load time, so the same module loads cleanly under
 * Vite, Node, and the `tsx` test loader.
 *
 * To add a new bundled skin: drop a folder under
 * `apps/arena-client/src/assets/skins/<name>/` containing
 * `board-background.png`, `card-frame.png`, and `theme.css`, then add
 * the matching entry to the `skinManifest` literal below. The
 * `SkinName` type and the schema's closed set update automatically;
 * the drift-detection test in `playmatSchema.test.ts` enforces the
 * invariant.
 *
 * @see WP-130 §A "Pinia preferences store" — canonical-source rule
 * @see DECISIONS.md D-13001 (bundled discovery), D-13003 (bundled set)
 */

// why: the `new URL(relative, import.meta.url).href` pattern is the
// cross-environment idiom recommended by Vite for runtime-resolvable
// static asset URLs. Vite rewrites the call site at build time to a
// final bundle URL string; Node resolves it to a `file://` URL with no
// disk access. Using the static `?url` query-suffix import would also
// work in Vite, but the test runner (`node --import tsx`) does not
// strip query suffixes from import specifiers and would fail to
// resolve.
const moduleUrl = import.meta.url;
const classicBoardBackgroundUrl = new URL('../assets/skins/classic/board-background.png', moduleUrl).href;
const classicCardFrameUrl = new URL('../assets/skins/classic/card-frame.png', moduleUrl).href;
const classicThemeCssUrl = new URL('../assets/skins/classic/theme.css', moduleUrl).href;
const comicBoardBackgroundUrl = new URL('../assets/skins/comic/board-background.png', moduleUrl).href;
const comicCardFrameUrl = new URL('../assets/skins/comic/card-frame.png', moduleUrl).href;
const comicThemeCssUrl = new URL('../assets/skins/comic/theme.css', moduleUrl).href;
const minimalBoardBackgroundUrl = new URL('../assets/skins/minimal/board-background.png', moduleUrl).href;
const minimalCardFrameUrl = new URL('../assets/skins/minimal/card-frame.png', moduleUrl).href;
const minimalThemeCssUrl = new URL('../assets/skins/minimal/theme.css', moduleUrl).href;

/**
 * One bundled skin's resolved asset URLs and the CSS class name that
 * `useSkinApplier` toggles on the `<PlayViewport>` root element.
 *
 * The CSS class name (`skin-<name>`) must match the selector in the
 * companion `theme.css` file under
 * `apps/arena-client/src/assets/skins/<name>/`.
 */
export interface SkinManifestEntry {
  readonly boardBackgroundUrl: string;
  readonly cardFrameUrl: string;
  readonly themeCssUrl: string;
  readonly cssClassName: string;
}

/**
 * The bundled skin manifest. Keys are the canonical `SkinName` values;
 * order is preserved by `Object.keys()` per JS insertion-order semantics
 * (used by `availableSkins` in the Pinia store).
 *
 * Locked at three entries by D-13003 — `classic` (default), `comic`,
 * `minimal` (high-contrast a11y-baseline).
 */
export const skinManifest = {
  classic: {
    boardBackgroundUrl: classicBoardBackgroundUrl,
    cardFrameUrl: classicCardFrameUrl,
    themeCssUrl: classicThemeCssUrl,
    cssClassName: 'skin-classic',
  },
  comic: {
    boardBackgroundUrl: comicBoardBackgroundUrl,
    cardFrameUrl: comicCardFrameUrl,
    themeCssUrl: comicThemeCssUrl,
    cssClassName: 'skin-comic',
  },
  minimal: {
    boardBackgroundUrl: minimalBoardBackgroundUrl,
    cardFrameUrl: minimalCardFrameUrl,
    themeCssUrl: minimalThemeCssUrl,
    cssClassName: 'skin-minimal',
  },
} as const satisfies Record<string, SkinManifestEntry>;

/**
 * The closed set of bundled skin names. Derived from the manifest keys
 * via `keyof typeof skinManifest` so `playmatSchema.ts` and the
 * selector UI never drift from the manifest.
 */
export type SkinName = keyof typeof skinManifest;
