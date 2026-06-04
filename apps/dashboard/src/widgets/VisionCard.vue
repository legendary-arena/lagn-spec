<script setup lang="ts">
/**
 * VisionCard — pinned read-only surface for Legendary Arena's Primary Vision
 * Goals (#1–5) and the Financial Sustainability covenant ("No margin, no
 * mission").
 *
 * Curated condensed string sourced from `docs/01-VISION.md` §Business Survival
 * (Sales & Product), Primary Vision Goals (Non-Negotiable) §1–5, and
 * §Financial Sustainability ("No Margin, No Mission"), at the following PS-3
 * baseline:
 *
 *   Source file:   docs/01-VISION.md
 *   Source SHA:    51aec9e3c251040f36ee2a177fd607117d2bc121
 *   Capture date:  2026-06-03
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
      <p class="vision-tagline">Legendary Arena&apos;s survival truths, the goals that serve them, and the financial covenant that keeps payroll funded.</p>
    </header>

    <section class="vision-survival" aria-labelledby="vision-survival-title">
      <h4 id="vision-survival-title" class="survival-heading">Business Survival</h4>
      <ul class="survival-list">
        <li>
          <strong>Sales.</strong>
          Every dollar funds payroll, royalties to Marvel and Upper Deck, cloud bills, and the next round of content. No sales = no business, no game, no royalties. Selling is the act that funds everything else this card says we care about.
        </li>
        <li>
          <strong>A great product.</strong>
          Players pay for a faithful, reliable, fast Marvel Legendary that gets better every release. The Primary Goals below are not abstract values — they are the engineering truths that make the product worth buying.
        </li>
      </ul>
    </section>

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
          <li>Revenue models protect gameplay fairness — no pay-to-win — and pricing, packaging, and distribution are open commercial decisions.</li>
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

.vision-survival {
  margin-bottom: 1.25rem;
  padding: 0.85rem 1rem;
  border-left: 4px solid var(--p-primary-color);
  border-radius: 0 4px 4px 0;
  background: var(--p-surface-section, transparent);
}

.survival-heading {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--p-primary-color);
  font-weight: 700;
}

.survival-list {
  margin: 0;
  padding-left: 1.1rem;
  color: var(--p-text-color);
  font-size: 0.85rem;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.survival-list li::marker {
  color: var(--p-primary-color);
}

.survival-list strong {
  color: var(--p-primary-color);
  font-weight: 700;
}
</style>
