# EC-124 — Viewer Henchman Per-Card Emission for Multi-Card Groups (Execution Checklist)

**Source:** Ad-hoc viewer-scoped session (no WP) — coordinate the viewer's
`flattenSet()` with the upstream converter change in
`C:\Users\jjensen\bbcode\modern-master-strike\convert-cards-v15.mjs` that
emits a `cards: [{name, slug, imageUrl, abilities}]` sub-array on
multi-card henchman groups. Without the viewer change, the deployed
pre-EC-123 code at cards.barefootbetters.com finds the new `cards` array
on Mandarin's Rings only and emits 10 ring tiles + zero henchman tiles
for every group that does not have a `cards` array — partial production
regression.
**Layer:** Registry Viewer (`apps/registry-viewer/`)

**Execution Authority:**
This EC is the authoritative execution contract for extending the viewer's
flat-only `flattenSet()` henchman branch (locked under EC-123) to also
emit per-card FlatCards when a henchman group carries a populated
`cards: [...]` sub-array. EC-123 remains authoritative for the flat-shape
branch; EC-124 is strictly additive and must not regress flat-shape
emission.

EC-124 follows the EC-110 / EC-120 ad-hoc precedent: no `WORK_INDEX.md`
row, only an `EC_INDEX.md` registration in the Registry Viewer §EC-101+
Series.

---

## Slot Selection

EC-124 is the next free slot that does not shadow a known/imminent WP.
EC-119 is reserved for WP-115 (Public Leaderboard HTTP Endpoints, draft on
disk). EC-121 was reserved for the unmerged WP-120 Loadout Preview
branch per the EC-122 retarget breadcrumb. EC-124 does not shadow any
in-flight WP.

---

## Before Starting

- [ ] Upstream converter change shipped in `convert-cards-v15.mjs`
      (henchman block emits `cards` array on multi-card groups; single-card
      groups keep the existing flat shape — verified by regenerating
      `data/cards/{rvlt,amwp,wtif}.json` and inspecting Mandarin's Rings,
      Tardigrade, Ultron Sentries)
- [ ] R2 has been republished with the regenerated metadata so the live
      `metadata/rvlt.json` Mandarin's Rings entry has `cards.length === 10`
- [ ] `pnpm --filter registry-viewer test` reproduces the 26-test EC-123
      baseline before edit

---

## Locked Values (do not re-derive)

- **Per-card key shape:** `${abbr}-henchman-${groupSlug}-${cardSlug}` —
  three segments after `henchman-`, mirrors mastermind/villain key shapes
  in the same `flattenSet()`.
- **Flat-shape key shape (preserved):** `${abbr}-henchman-${groupSlug}` —
  one segment after `henchman-`, locked by EC-123 / D-12201.
- **Branch selector:** per-card branch fires when
  `Array.isArray(henchman.cards) && henchman.cards.length > 0`.
  Otherwise the EC-123 flat-shape branch fires byte-equivalent to its
  pre-EC-124 behavior.
- **Upstream contract:** the converter emits group-level `imageUrl` set
  to the first card's URL on multi-card groups so engine consumers that
  read `henchmanGroup.imageUrl` continue to resolve a real R2 asset.

---

## Guardrails

- Do not regress the flat-shape branch — EC-123 tests must continue
  to pass byte-identically (4/4).
- Do not change the engine reads in `buildCardDisplayData.ts` or
  `buildCardStats.ts`. Per-copy in-game henchman art is out of scope and
  must be a separate WP (touches the locked `henchman-{slug}-NN` ext_id
  contract).
- Do not surface `imageUrlByClass` at this seam — the per-card branch
  reads only `cards[*].imageUrl`. The class-keyed map remains deferred
  per EC-123 §why-(g) / D-12201.
- Do not modify `packages/registry/src/shared.ts` — that copy does not
  iterate henchmen at all.

---

## Required `// why:` Comments

- The henchmen block in `apps/registry-viewer/src/registry/shared.ts`
  carries an updated multi-clause `// why:` block (a)–(f) that supersedes
  the EC-123 (a)–(g) block; the new block records the upstream converter
  coordination, the EC-123 → EC-124 supersession of clause (d), and the
  continued deferral of `imageUrlByClass` from clause (f).

---

## Files to Produce

- `apps/registry-viewer/src/registry/shared.ts` — **modified** —
  henchman block extended with a per-card branch; flat-shape branch
  preserved as the fallback.
- `apps/registry-viewer/src/registry/shared.test.ts` — **modified** —
  appends a fifth `it` case under the existing
  `flattenSet henchman emission (WP-122)` describe block, locking the
  per-card branch via a Mandarin's Rings fixture (10 ring cards →
  10 FlatCards with key `${abbr}-henchman-mandarins-rings-${cardSlug}`).
- `data/cards/{rvlt,amwp,wtif}.json` — **modified** — local copies of
  the regenerated upstream JSON, kept in sync with R2 so the registry
  smoke test and engine tests see the same shape as production.

---

## After Completing

- [ ] `pnpm --filter registry-viewer test` exits 0 (27/5/0; +1 test)
- [ ] `pnpm --filter game-engine test` exits 0 (604/132/0 unchanged —
      engine still reads group-level `imageUrl`)
- [ ] `EC_INDEX.md` row added under the Registry Viewer §EC-101+ Series
- [ ] Commit prefix `EC-124:` at execution
- [ ] Manual smoke against the deployed cards.barefootbetters.com after
      Cloudflare Pages redeploys: Mandarin's Rings shows 10 distinct
      tiles, all other henchman groups continue to show 1 tile each,
      total henchman count rises by 9 (10 − 1) plus 4 (Tardigrade 5 − 1)
      plus 4 (Ultron Sentries 5 − 1) = +17 from the EC-123 baseline.

---

## Common Failure Smells

- Only Mandarin's Rings tiles render and other henchmen vanish → the
  deployed viewer is pre-EC-123 (flat-shape branch missing). Push the
  EC-123 commit ahead of EC-124 — both are required for the new R2 data
  shape to render correctly. This was the production symptom that
  triggered EC-124.
- Per-card branch fires for single-card groups (Hand Ninjas etc.) →
  branch selector lost the `length > 0` guard; restore it.
