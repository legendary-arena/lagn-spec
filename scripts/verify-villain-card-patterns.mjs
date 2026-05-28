#!/usr/bin/env node
/**
 * verify-villain-card-patterns.mjs — Self-validating QA for the per-card
 * villain assignments. For each slug, asserts that every assigned card's
 * source text contains a plausible signal for that slug, and reports only
 * the failures. Scratch diagnostic for the WP-184 per-card fix.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const a = JSON.parse(await readFile("data/metadata/villain-pattern-assignments.json", "utf8"));
const text = new Map();
for (const file of (await readdir("data/cards")).filter((f) => f.endsWith(".json"))) {
  const abbr = file.replace(/\.json$/, "");
  const set = JSON.parse(await readFile(join("data/cards", file), "utf8"));
  for (const g of set.villains ?? []) {
    for (const c of g.cards ?? []) {
      text.set(`${abbr}/${g.slug}/${c.slug}`, (c.abilities ?? []).join(" | "));
    }
  }
}

// Loose plausibility check per slug — does the source text mention the concept
// at all? (Catches gross misfires, not timing nuances.)
const check = {
  "fight-ko-hero":      (t) => /\bKO\b[^|]*\b(Hero|Heroes|Ally|Allies)\b/i.test(t),
  "fight-gain-hero":    (t) => /Gain this as a Hero/i.test(t) || /gain (a|an|this)[^|]*Hero from the (HQ|KO pile)/i.test(t),
  "fight-rescue":       (t) => /[Rr]escue[^|]*Bystander/i.test(t),
  "fight-draw":         (t) => /\bDraws?\b[^|]*card/i.test(t),
  "fight-recruit":      (t) => /\[icon:recruit\]/i.test(t) || /New Recruit/i.test(t),
  "fight-wound-others": (t) => /gain[^|]*Wound/i.test(t) || /\[keyword:Demolish\]/i.test(t),
  "ambush-capture":     (t) => /captures?[^|]*(Bystander|Human Shield|Hidden Witness)/i.test(t),
  "ambush-cascade":     (t) => /Villain Deck/i.test(t) || /enters the city/i.test(t),
};

let total = 0, fails = 0;
for (const [key, slug] of Object.entries(a)) {
  if (key.startsWith("_")) continue;
  total++;
  const t = text.get(key);
  if (t === undefined) { console.log(`MISSING SOURCE: ${key}`); fails++; continue; }
  const fn = check[slug];
  if (!fn) { console.log(`UNKNOWN SLUG: ${key} => ${slug}`); fails++; continue; }
  if (!fn(t)) { console.log(`MISFIRE [${slug}] ${key}\n    ${t.slice(0, 160)}`); fails++; }
}
console.log(`\nassigned: ${total}; plausibility failures: ${fails}`);
