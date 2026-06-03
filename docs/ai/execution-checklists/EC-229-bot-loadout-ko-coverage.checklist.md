# EC-229 — Bot Demo Loadout KO Coverage

**Status:** Complete
**Scope:** One playability fix observed during live autoplay on play.legendary-arena.com

## Symptom

The Watch Bot Play demo never KO'd a hero. The default loadout shipped Brotherhood villains + Hand Ninjas henchmen + Magneto mastermind. None of those cards carry an `[effect:koHero*]` marker:

- Juggernaut's KO abilities are magnitude-2 (deferred per WP-188 `_unassigned`, retained per WP-190)
- Mystique's escape turns into a Scheme Twist (no MVP keyword)
- Sabretooth's Fight is a conditional or-clause (no MVP keyword)
- Hand Ninjas has no KO ability at all

The villain ability parser at `villainAbility.setup.ts` reads only `[effect:<keyword>]` markers, never natural language, so the printed KO text was decorative.

## Fix

- [x] `apps/arena-client/public/loadout-test.json` villainGroupIds `core/brotherhood` → `core/skrulls` (Super-Skrull Fight: `[effect:koHeroEachPlayer]`)
- [x] `apps/arena-client/public/loadout-test.json` henchmanGroupIds `core/hand-ninjas` → `core/sentinel` (Sentinel Fight: `[effect:koHeroCurrentPlayer]`)
- [x] Mastermind unchanged (`core/magneto`; ledBy is thematic, not enforced)

## Out of Scope

- Adding magnitude-N each-player-KO vocabulary so Brotherhood's printed KO lines actually fire — deferred to a future engine WP (`koHeroEachPlayerMagN` or parameterized marker)
- The marker-parser contract itself is unchanged; this is a demo-loadout swap only

## Verification

- Manual: next "Watch Bot Play" run on play.legendary-arena.com should show heroes entering KO piles whenever the bot fights a Super-Skrull (each player) or Sentinel (current player)
- No engine, registry, or server code touched; no tests added (data swap only)
