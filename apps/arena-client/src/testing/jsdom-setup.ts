/**
 * Side-effect module that installs jsdom globals for component tests that
 * call `@vue/test-utils.mount()` under Vue 3.5.x + Node 22+.
 *
 * Consumers import this as the FIRST line of any component `*.test.ts`:
 *
 *   import '../testing/jsdom-setup';
 *
 * No exports — this file exists for its side effects only.
 */

import { JSDOM } from 'jsdom';

// why: jsdom globals injection mirrors the WP-065
// `packages/vue-sfc-loader/src/loader.test.ts` driver. Under Vue 3.5.x
// (pnpm resolves this against the `^3.4.27` peerDep pin per D-6502),
// `@vue/runtime-dom.resolveRootNamespace` probes `SVGElement` and
// `MathMLElement` during `app.mount()`. Missing any of these globals
// surfaces as a cascade of `ReferenceError` rooted inside the Vue
// runtime, not inside the test — expensive to diagnose without this
// precedent.
//
// why: the `{ url: 'http://localhost/' }` constructor argument is
// load-bearing for any consumer that touches `window.localStorage` or
// `window.sessionStorage`:
//   - JSDOM defaults to an opaque origin (the implicit `about:blank`
//     URL produces an opaque tuple origin under WHATWG).
//   - opaque origins withhold `window.localStorage` and
//     `window.sessionStorage` per the WHATWG Storage spec; first
//     access throws `SecurityError: The operation is insecure`.
//   - passing `{ url: 'http://localhost/' }` produces a non-opaque
//     tuple origin, so the document exposes a working `Storage`
//     pair on `window` to consumers without per-test boilerplate.
//   - the URL literal is locked by WP-136 D-13601 (verbatim,
//     including trailing slash); see DECISIONS.md for the full
//     rejected-alternatives list.
//   - bridging `localStorage` / `sessionStorage` onto `globalThis`
//     is load-bearing because production code reads bare globals,
//     not `window.X` (see the bridging `// why:` block adjacent to
//     the `installGlobal('localStorage', ...)` calls below).
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });

function installGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, {
    value,
    writable: true,
    configurable: true,
  });
}

installGlobal('window', dom.window);
installGlobal('document', dom.window.document);
installGlobal('HTMLElement', dom.window.HTMLElement);
installGlobal('Element', dom.window.Element);
installGlobal('Node', dom.window.Node);
installGlobal('SVGElement', dom.window.SVGElement);
installGlobal('MathMLElement', dom.window.MathMLElement);

// why: Node 22+ exposes `globalThis.navigator` as a read-only getter, so a
// plain assignment `globalThis.navigator = dom.window.navigator` throws
// `TypeError: Cannot set property navigator of #<Object> which has only
// a getter`. `Object.defineProperty` bypasses the getter and installs the
// jsdom navigator as a writable / configurable property. Precedent:
// WP-065 `loader.test.ts`; the load-bearing detail there and here.
installGlobal('navigator', dom.window.navigator);

// why: globalThis.window !== globalThis. JSDOM places `localStorage` and
// `sessionStorage` on `dom.window` only. Production code in
// `apps/arena-client/src/prefs/persistence.ts:58,80,83` reads bare
// `localStorage`, which resolves through `globalThis`, not `dom.window`.
// Without these two bridges, the URL fix alone leaves bare references
// unresolved (`ReferenceError: localStorage is not defined` on first
// access). WP-136 / D-13601.
installGlobal('localStorage', dom.window.localStorage);
installGlobal('sessionStorage', dom.window.sessionStorage);

// why: Vite `define` constants (__APP_VERSION__, __BUILD_TIMESTAMP__,
// __GIT_SHA__) are string-replaced at build time but absent in the
// node:test runner. VersionBadge.vue reads them as bare globals.
installGlobal('__APP_VERSION__', '0.0.0-test');
installGlobal('__BUILD_TIMESTAMP__', new Date().toISOString());
installGlobal('__GIT_SHA__', 'test');
