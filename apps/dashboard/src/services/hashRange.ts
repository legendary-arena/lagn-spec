// why: D-19605 (Mock Determinism Contract + Hash Function extension) — the
// dashboard's mock-data determinism guarantees only hold if the seed source
// is itself pure and platform-stable. FNV-1a 32-bit is a simple, well-known
// non-cryptographic hash with no engine-specific quirks (legacy JS
// `String.prototype.hashCode` analogues differ across engines historically).
// SHA-* and crypto-grade hashes are overkill for mock-seed purposes and add
// bundle weight. This file is the SINGLE source for range hashing across
// the dashboard; widgets, composables, and mock generators import this
// function rather than re-implementing inline — the single-source rule
// prevents the "two implementations diverged" failure mode.

const FNV_OFFSET_BASIS_32 = 0x811c9dc5;
const FNV_PRIME_32 = 0x01000193;
const UINT32_MASK = 0xffffffff;

/**
 * Compute the FNV-1a 32-bit hash of a string. Pure function: identical input
 * strings always produce byte-identical 32-bit integer output across every
 * platform, browser, and Node version. Used as the seed source for the
 * dashboard's deterministic mock generators.
 *
 * Collisions are accepted: 32-bit FNV-1a has ~2^16 birthday-attack collisions
 * over the range-string universe. For the mock-seed use case this is
 * harmless — colliding inputs produce identical mock output, not incorrect
 * mock output.
 */
export function hashRange(input: string): number {
  let hash = FNV_OFFSET_BASIS_32;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * FNV_PRIME_32) & UINT32_MASK;
  }
  return hash >>> 0;
}
