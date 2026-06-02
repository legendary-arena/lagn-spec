<script setup lang="ts">
/**
 * VisionCard — pinned read-only surface for Legendary Arena's Primary Vision
 * Goals (#1–5) and the Financial Sustainability covenant ("No margin, no
 * mission").
 *
 * Curated condensed string sourced from `docs/01-VISION.md` Primary Vision
 * Goals (Non-Negotiable) §1–5 and §Financial Sustainability ("No Margin, No
 * Mission"), at the following PS-3 baseline:
 *
 *   Source file:   docs/01-VISION.md
 *   Source SHA:    9fbf819cb4cc198d7007e61230a9c0b0a10d18a9
 *   Capture date:  2026-06-02
 *
 * why: D-19803 — the card renders a curated condensed STATIC string in the
 * component. No runtime file read (browser-impossible), no build-time
 * generator dependency (over-engineering for a one-paragraph card), no Vite
 * raw-asset import. The JSDoc header above is the auditable drift-protection
 * anchor — any future WP that bumps the VISION.md SHA without updating the
 * curated string + the SHA cited above MUST fail the SHA-pin grep gate in
 * EC-224a §After Completing.
 *
 * why: D-19803 — four-state widget contract (loading / error / empty / data)
 * is intentionally NOT followed here. The data is literal in-bundle; the
 * three non-`data` states are unreachable. EC-224a §Locked Values §VisionCard
 * "Four-state contract exemption" + WP-198 §C permit this divergence for
 * static-content widgets.
 *
 * The card has NO edit / dismiss / hide affordance per EC-224a §Guardrails —
 * the whole point of pinning is that it is always visible.
 */
</script>

<template>
  <section class="vision-card" aria-labelledby="vision-card-title">
    <header class="vision-header">
      <h3 id="vision-card-title">Vision</h3>
      <p class="vision-tagline">Legendary Arena&apos;s non-negotiable Primary Goals and the financial covenant that keeps them shippable.</p>
    </header>

    <div class="vision-body">
      <section class="vision-column" aria-labelledby="vision-primary-title">
        <h4 id="vision-primary-title" class="column-heading">Primary Goals</h4>
        <ol class="vision-list">
          <li>
            <strong>Rules Authenticity.</strong>
            Follows the exact rules of Marvel Legendary — no simplifications, no digital-only shortcuts, strict and deterministic enforcement.
          </li>
          <li>
            <strong>Content Authenticity.</strong>
            Uses the same card images, names, text, and semantics as the physical cards; presentation never alters rules meaning.
          </li>
          <li>
            <strong>Player Trust &amp; Fairness.</strong>
            No hidden modifiers; randomness verifiably fair and reproducible; the system never makes strategic decisions on behalf of players.
          </li>
          <li>
            <strong>Faithful Multiplayer.</strong>
            Mirrors the tabletop cooperative experience; correctness over convenience; reliable synchronization, reconnection, late-joining.
          </li>
          <li>
            <strong>Longevity &amp; Expandability.</strong>
            Built for decades of expansions, heroes, villains, and rule complexity; core systems scale without rewrites.
          </li>
        </ol>
      </section>

      <section class="vision-column" aria-labelledby="vision-financial-title">
        <h4 id="vision-financial-title" class="column-heading">Financial Sustainability</h4>
        <p class="financial-tagline"><em>&ldquo;No margin, no mission.&rdquo;</em></p>
        <ul class="vision-list">
          <li>The game must be <strong>financially self-sustaining</strong> from launch onward.</li>
          <li>The core experience (all rules, all content, full multiplayer, scoring, replays, exports) stays <strong>permanently free</strong>.</li>
          <li>Monetization is limited to distribution, access, presentation, and participation — never gameplay advantage.</li>
          <li>A non-negotiable royalty portion flows directly to Upper Deck and Marvel on every revenue stream.</li>
          <li>If revenue falls short, non-essential features scale back <strong>before</strong> any compromise to rules, fairness, accessibility, or royalties.</li>
        </ul>
      </section>
    </div>
  </section>
</template>

<style scoped>
.vision-card {
  background: var(--p-surface-card, var(--p-content-background));
  border: 1px solid var(--p-surface-border, var(--p-content-border-color));
  border-left: 4px solid var(--p-primary-color);
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
}

.vision-header {
  margin-bottom: 1rem;
}

.vision-header h3 {
  margin: 0 0 0.25rem;
  font-size: 0.9rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--p-primary-color);
}

.vision-tagline {
  margin: 0;
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

.vision-body {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
}

@media (min-width: 768px) {
  .vision-body {
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
  }
}

.vision-column {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.column-heading {
  margin: 0;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}

.financial-tagline {
  margin: 0;
  font-size: 0.85rem;
  color: var(--p-text-color);
}

.vision-list {
  margin: 0;
  padding-left: 1.1rem;
  color: var(--p-text-color);
  font-size: 0.82rem;
  line-height: 1.45;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.vision-list li::marker {
  color: var(--p-primary-color);
}

.vision-list strong {
  color: var(--p-text-color);
}
</style>
