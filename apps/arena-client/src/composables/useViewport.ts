/**
 * Responsive viewport observer for the WP-129 board layout.
 *
 * Exposes exactly two refs ({@link isMobile}, {@link isDesktop}) plus the
 * locked breakpoint constant. The `<PlayViewport>` page-level SFC consumes
 * these refs to switch between `<PlayDesktop>` and `<PlayMobile>` per the
 * D-12909 breakpoint.
 *
 * Single-responsibility per copilot RISK 25 2026-05-04 — this composable
 * does NOT carry any layout-mounting logic, any breakpoint-citation logic,
 * or any per-zone responsive policy. Callers compose those concerns on top
 * of the {isMobile, isDesktop} refs.
 *
 * @see WP-129 §Acceptance Criteria — viewport breakpoint
 * @see EC-132 §2 useViewport single-responsibility lock (RISK 25)
 * @see DECISIONS.md D-12909
 */

import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

// why: D-12909 — desktop/mobile breakpoint locked at 767px (mobile cutoff
// inclusive). 767/768 aligns with iPad Mini portrait cutoff and existing
// Tailwind/CSS breakpoint convention. Rejected alternatives: 640px (too
// narrow — would route mid-size phones to desktop layout); 820px (collides
// with iPad landscape and would route landscape tablets to mobile). Locked
// before the first production component file is written so the value is
// not bikeshed mid-execution. Per copilot RISK 25 2026-05-04, the comment
// lives on the constant declaration site (NOT on the watcher logic) so
// `<PlayViewport>` and tests can import the constant for assertions
// without re-deriving the value.
export const BREAKPOINT_MOBILE_MAX_PX = 767;

interface ViewportRefs {
  isMobile: Ref<boolean>;
  isDesktop: Ref<boolean>;
}

/**
 * Observe the current viewport width and expose a boolean flag for each
 * side of the D-12909 breakpoint. Both refs update reactively on resize
 * via `window.matchMedia`. In server-side or test-without-jsdom contexts
 * (no `window`), the refs default to desktop (`isDesktop=true`) so the
 * page-level SFCs render the desktop layout when no media query is
 * observable.
 */
export function useViewport(): ViewportRefs {
  // why: evaluate the matchMedia query SYNCHRONOUSLY at setup time so the
  // initial render of `<PlayViewport>` mounts the correct page (desktop
  // vs mobile) on the first frame. Deferring to onMounted causes a brief
  // initial render of the wrong page followed by a reactive flip — at
  // best a flicker, at worst a test-time false negative because Vue's
  // post-mount scheduling runs after `mount()` returns.
  const hasMatchMedia =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const initialMatches = hasMatchMedia
    ? window.matchMedia(`(max-width: ${BREAKPOINT_MOBILE_MAX_PX}px)`).matches
    : false;

  const isMobile = ref<boolean>(initialMatches);
  const isDesktop = ref<boolean>(!initialMatches);

  let mediaQueryList: MediaQueryList | null = null;

  function evaluate(matches: boolean): void {
    isMobile.value = matches;
    isDesktop.value = !matches;
  }

  function onChange(event: MediaQueryListEvent): void {
    evaluate(event.matches);
  }

  onMounted(() => {
    if (!hasMatchMedia) {
      return;
    }
    mediaQueryList = window.matchMedia(`(max-width: ${BREAKPOINT_MOBILE_MAX_PX}px)`);
    evaluate(mediaQueryList.matches);
    mediaQueryList.addEventListener('change', onChange);
  });

  onBeforeUnmount(() => {
    if (mediaQueryList !== null) {
      mediaQueryList.removeEventListener('change', onChange);
      mediaQueryList = null;
    }
  });

  return { isMobile, isDesktop };
}
