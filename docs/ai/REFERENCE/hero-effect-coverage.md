# Hero-Effect Coverage Gate — Operator Guide

**Tool:** `scripts/hero-effect-coverage.mjs` (run via `pnpm sim:coverage`)
**Packet:** WP-250 / EC-281 · **Decision:** D-24021 · **CI job:** `hero-effect-coverage`

This gate measures how many printed hero abilities the engine actually executes,
and fails CI when that coverage regresses. It is Lever 3 of
`docs/ai/DESIGN-EFFECT-AUTHORING-SCALE.md` — the guardrail that protects the
hero-effect system (and the upcoming Lever 1/2 refactor) from silently dropping
coverage. It is read-only over the engine: it drives the real setup-time parser
(`buildHeroAbilityHooks`) over every hero card in all in-repo sets and changes no
engine/contract code.

## What it measures

Every printed hero ability line is parsed and bucketed:

| Bucket | Meaning |
|---|---|
| `EXECUTABLE` | the parser produced an effect the engine executes today |
| `PARSED_NOT_EXECUTED` | an effect was produced but its keyword is deferred |
| `NO_EFFECT` | the card has ability text but the parser produced no effect (the gated bug class — a card that silently does nothing) |

It also lists **unsupported mechanics**: `[keyword:X]` tokens whose normalized
name is not a recognized `HERO_KEYWORD` — whole mechanics the engine can't model
yet. Vanilla cards (no ability text) never appear; they produce no hook.

## Commands

```bash
pnpm sim:coverage                  # human-readable report (per-set table + unsupported mechanics)
pnpm sim:coverage --json           # deterministic machine-readable report to stdout
pnpm sim:coverage --check          # compare against the committed baseline; sets the exit code
pnpm sim:coverage --update-baseline # rewrite the committed baseline from the current corpus
```

Run after `pnpm -r build` — the probe imports the built `game-engine` and
`registry` `dist/`.

## The gate (hybrid posture, D-24021)

`--check` compares the current corpus to `scripts/coverage/hero-effect-coverage.baseline.json`:

- **HARD-FAIL (exit 1)** — a true regression:
  - a set's `noEffect` count rose above the baseline (an executable line went dark), or
  - a set present in the baseline is missing from the current corpus (the corpus shrank).
- **WARN-only (exit 0)** — a brand-new unsupported `[keyword:X]` mechanic absent
  from the baseline. New mechanics appear routinely as sets get authored, so they
  are surfaced (`WARN: NEW unsupported mechanic: <name>`) but never block CI.
- **PROBE FAILURE (exit 2)** — a broken run: missing/unreadable baseline, missing
  `dist/`, absent/invalid `schemaVersion`, JSON parse failure, or a zero corpus.

Coverage improvements (fewer `noEffect`, fewer mechanics) always pass — the gate
is one-directional.

| Exit code | Meaning |
|---|---|
| `0` | no hard-fail regression (new-mechanic warnings may have printed) |
| `1` | hard-fail regression (a `noEffect` rise or a missing set) |
| `2` | probe failure |

## Updating the baseline

When coverage legitimately changes — e.g. after a markup sweep marks more cards,
a new executor lands, or a new set is added — regenerate the baseline:

```bash
pnpm sim:coverage --update-baseline
```

**Operator-safety rule:** run `--update-baseline` **only on `main`, after
confirming the coverage change is intentional.** Never run it on a feature branch
to silence a regression — that defeats the gate. `--check` and the default/`--json`
modes never write the baseline; `--update-baseline` never compares.

The output is byte-deterministic (sorted keys, fixed formatting), so CI produces
identical results to a local run, and a re-baseline with no real change is a
no-op diff.
