<script setup lang="ts">
/**
 * VisionCard — pinned read-only surface leading with the three Revenue
 * Drivers (Sell, Ship Content, Retain Players), followed by Quality
 * Standards (#1–5 repositioned as guardrails) and the Financial
 * Sustainability covenant ("No margin, no mission").
 *
 * Curated condensed string sourced from `docs/01-VISION.md` §Business Survival
 * (Sales & Product), Primary Vision Goals (Non-Negotiable) §1–5, and
 * §Financial Sustainability ("No Margin, No Mission"), at the following PS-3
 * baseline:
 *
 *   Source file:   docs/01-VISION.md
 *   Source SHA:    51aec9e3c251040f36ee2a177fd607117d2bc121
 *   Capture date:  2026-06-03
 *   Restructured:  2026-06-04 — 80/20 revenue focus per operator directive
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
      <p class="vision-tagline">The 20% of work that drives 80% of income &mdash; and the quality standards that make it worth paying for.</p>
    </header>

    <section class="vision-revenue" aria-labelledby="vision-revenue-title">
      <h4 id="vision-revenue-title" class="revenue-heading">Revenue Drivers &mdash; Daily Focus</h4>
      <ol class="revenue-list">
        <li>
          <strong>Sell.</strong>
          Get players to pay. Marketing, conversion, pricing, packaging. Every dollar funds payroll, royalties to Marvel and Upper Deck, cloud bills, and the next round of content. No sales = no business.
        </li>
        <li>
          <strong>Ship playable content.</strong>
          New sets, schemes, heroes. Content is the product. Content drives purchases and retention.
        </li>
        <li>
          <strong>Keep paying players playing.</strong>
          Reliability, matchmaking, reconnection. Churn kills recurring revenue.
        </li>
      </ol>
    </section>

    <div class="vision-body">
      <section class="vision-column" aria-labelledby="vision-quality-title">
        <h4 id="vision-quality-title" class="column-heading">Quality Standards</h4>
        <p class="quality-tagline">How we do the above well &mdash; guardrails, not goals.</p>
        <ol class="vision-list">
          <li>
            <strong>Rules Authenticity.</strong>
            Exact rules of Marvel Legendary; no simplifications, no digital-only shortcuts.
          </li>
          <li>
            <strong>Content Authenticity.</strong>
            Same card images, names, text, and semantics as the physical cards.
          </li>
          <li>
            <strong>Player Trust &amp; Fairness.</strong>
            No hidden modifiers; verifiably fair randomness; no decisions made on behalf of players.
          </li>
          <li>
            <strong>Faithful Multiplayer.</strong>
            Tabletop cooperative experience; reliable sync, reconnection, late-joining.
          </li>
          <li>
            <strong>Longevity &amp; Expandability.</strong>
            Built for decades of expansions; core systems scale without rewrites.
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

.vision-revenue {
  margin-bottom: 1.25rem;
  padding: 0.85rem 1rem;
  border-left: 4px solid var(--p-primary-color);
  border-radius: 0 4px 4px 0;
  background: var(--p-surface-section, transparent);
}

.revenue-heading {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--p-primary-color);
  font-weight: 700;
}

.revenue-list {
  margin: 0;
  padding-left: 1.1rem;
  color: var(--p-text-color);
  font-size: 0.85rem;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.revenue-list li::marker {
  color: var(--p-primary-color);
}

.revenue-list strong {
  color: var(--p-primary-color);
  font-weight: 700;
}

.quality-tagline {
  margin: 0;
  font-size: 0.78rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}
</style>
