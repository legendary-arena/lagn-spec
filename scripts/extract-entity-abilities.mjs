#!/usr/bin/env node
/**
 * extract-entity-abilities.mjs — One-shot helper for WP-184 classification.
 *
 * Reads every data/cards/*.json file and emits four newline-delimited text
 * blocks (heroes, villains, henchmen, masterminds), one entity per record,
 * showing the key `${setAbbr}/${slug}` plus the full ability text from every
 * card in that entity's set.
 *
 * Output: written to scripts/out/entities-{heroes,villains,henchmen,masterminds}.txt
 * so the classifier has a single linear stream to skim per taxonomy.
 *
 * Not used at runtime — pure ops tool for the one-time pattern assignment.
 */

import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const CARDS_DIR = "data/cards";
const OUT_DIR = "scripts/out";

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const setFiles = (await readdir(CARDS_DIR)).filter((f) => f.endsWith(".json"));

  const heroLines = [];
  const villainLines = [];
  const henchmanLines = [];
  const mastermindLines = [];

  for (const file of setFiles) {
    const abbr = file.replace(/\.json$/, "");
    const raw = await readFile(join(CARDS_DIR, file), "utf8");
    const set = JSON.parse(raw);

    for (const hero of set.heroes ?? []) {
      const key = `${abbr}/${hero.slug}`;
      const abilitiesByCard = (hero.cards ?? []).map((c) => {
        const rarity = c.rarityLabel ?? c.rarity ?? "?";
        const text = (c.abilities ?? []).join(" | ");
        return `[${rarity}] ${c.name ?? c.slug}: ${text}`;
      }).join("\n    ");
      heroLines.push(`${key}  (team=${hero.team ?? "?"})\n    ${abilitiesByCard}\n`);
    }

    for (const group of set.villains ?? []) {
      const key = `${abbr}/${group.slug}`;
      const abilitiesByCard = (group.cards ?? []).map((c) => {
        const text = (c.abilities ?? []).join(" | ");
        return `${c.name}: ${text}`;
      }).join("\n    ");
      villainLines.push(`${key}\n    ${abilitiesByCard}\n`);
    }

    for (const henchman of set.henchmen ?? []) {
      if (typeof henchman !== "object" || henchman === null) continue;
      const slug = henchman.slug ?? henchman.name ?? "henchman";
      const key = `${abbr}/${slug}`;
      let abilitiesText;
      if (Array.isArray(henchman.cards) && henchman.cards.length > 0) {
        abilitiesText = henchman.cards.map((c) => {
          const text = (c.abilities ?? []).join(" | ");
          return `${c.name ?? c.slug}: ${text}`;
        }).join("\n    ");
      } else {
        abilitiesText = (henchman.abilities ?? []).join(" | ");
      }
      henchmanLines.push(`${key}\n    ${abilitiesText}\n`);
    }

    for (const mm of set.masterminds ?? []) {
      const key = `${abbr}/${mm.slug}`;
      const abilitiesByCard = (mm.cards ?? []).map((c) => {
        const tag = c.tactic ? "[tactic]" : "[main]";
        const text = (c.abilities ?? []).join(" | ");
        return `${tag} ${c.name}: ${text}`;
      }).join("\n    ");
      mastermindLines.push(`${key}\n    ${abilitiesByCard}\n`);
    }
  }

  await writeFile(join(OUT_DIR, "entities-heroes.txt"), heroLines.join("\n"));
  await writeFile(join(OUT_DIR, "entities-villains.txt"), villainLines.join("\n"));
  await writeFile(join(OUT_DIR, "entities-henchmen.txt"), henchmanLines.join("\n"));
  await writeFile(join(OUT_DIR, "entities-masterminds.txt"), mastermindLines.join("\n"));

  console.log(`heroes:      ${heroLines.length}`);
  console.log(`villains:    ${villainLines.length}`);
  console.log(`henchmen:    ${henchmanLines.length}`);
  console.log(`masterminds: ${mastermindLines.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
