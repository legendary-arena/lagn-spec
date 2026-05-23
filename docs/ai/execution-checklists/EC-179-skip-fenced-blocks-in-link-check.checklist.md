# EC-179 — Skip Fenced Code Blocks in Wiki Link-Integrity Check (Execution Checklist)

**Source:** Ad-hoc INFRA session (no WP) — surfaced after PR #95
(`EC-178` + `INFRA:` pnpm-version fix) unblocked the `wiki-viewer / build`
CI job. With the upstream pnpm-conflict resolved, the workflow advanced to
`pnpm wiki-viewer:check-links` and reported 5 broken internal links — all
pedagogical `[text](path)` syntax examples inside ` ``` ` fenced code
blocks (image-embedding demos in `wiki/blog-post-authoring.md`,
`wiki/brevo-email-pipeline.md`, and `wiki/wiki-viewer.md`).
**Layer:** Wiki Viewer (`apps/wiki-viewer/scripts/check-links.mjs`)

---

## Execution Authority

The 5 findings are genuine false positives: markdown link syntax inside a
fenced code block is illustration text, not a navigable link. The example
blocks teach authors the Hugo `/`-rooted static-asset URL convention and
intentionally reference paths that don't exist on the engine repo's
filesystem (the matching `ewiki/` and marketing-repo assets live elsewhere
or have not been authored yet).

This is defensible as a checker-correctness bug, not a way to make the
build pass: every reasonable markdown link checker (markdown-link-check,
lychee, etc.) respects fenced code-block boundaries. The naive regex in
`check-links.mjs` did not, so every new image example would trip the gate
by design.

Touching `apps/wiki-viewer/` files requires an `EC-###:` prefix per
`01.3-commit-hygiene-under-ec-mode.md` Rule 5, hence this ad-hoc EC.
EC-179 follows the EC-110 / EC-166 / EC-177 / EC-178 ad-hoc precedent
(no `WORK_INDEX.md` row; only an `EC_INDEX.md` row).

---

## Before Starting

- [ ] PR #95 (EC-178) is the upstream fix that unmasked these findings;
      this EC does not depend on #95 being merged, but the CI signal will
      only be observable once #95 lands and the pnpm step succeeds.
- [ ] `pnpm wiki-viewer:project && pnpm wiki-viewer:check-links` reproduces
      the 5 broken-link diagnostic locally.

---

## Locked Values (do not re-derive)

- **Fence delimiter:** triple-backtick (` ``` `) only. Indented (4-space)
  code blocks are NOT stripped — no current wiki content uses them, and
  speculatively handling them widens the patch beyond the failing class.
- **Fence stripping is non-greedy:** `/` ``` `[\s\S]*?` ``` `/g` matches
  one fenced block at a time so adjacent fences are not merged into one.
- **Single helper, single call site.** `stripFencedCodeBlocks(body)` is
  added once and applied once, immediately before the existing
  `MARKDOWN_LINK_PATTERN` scan.
- **No other parsing change.** `isExternal()`, case-sensitive file
  resolution, `#` anchor handling, and the `INDEX.md → _index.md` mapping
  are unchanged byte-for-byte.

---

## Guardrails

- No source content under `wiki/` is touched. The false positives are in
  source files, but the correct fix is on the checker side.
- Existing `// why:` comments in `check-links.mjs` are preserved verbatim.
- One new `// why:` comment is added at the top of the file documenting
  the fence-stripping rationale, with explicit reference to the three
  source files affected.
- No change to the projection script, the build script, or the
  architecture-inventory exclusion (`fileName === 'architecture-inventory.md'`).
- Commit prefix is `EC-179:` (Rule 5 — staged set includes `apps/`).
- Do NOT bypass hooks with `--no-verify`.

---

## Files to Produce

- `apps/wiki-viewer/scripts/check-links.mjs` — **modified** —
  - Add a new top-of-file `// why:` block documenting fence-strip semantics.
  - Add `FENCED_CODE_BLOCK_PATTERN` constant beside `MARKDOWN_LINK_PATTERN`.
  - Add `stripFencedCodeBlocks(body)` helper.
  - Inside the file loop, scan `stripFencedCodeBlocks(body)` instead of `body`.
- `docs/ai/execution-checklists/EC-179-skip-fenced-blocks-in-link-check.checklist.md` —
  **new** — this file.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — register EC-179.

---

## After Completing

- [ ] `pnpm wiki-viewer:project && pnpm wiki-viewer:check-links` exits 0
- [ ] `pnpm wiki-viewer:check-links` output line confirms ≥ 29 projected
      files scanned (no regression in coverage)
- [ ] Commit subject starts with `EC-179:`
- [ ] EC_INDEX.md EC-179 row marked `Done <date>`
- [ ] On CI (after PR #95 merges), `wiki-viewer / build` job reports SUCCESS

---

## Common Failure Smells

- `Link-integrity check failed with N broken internal link(s)` after the
  fix → either (a) a real out-of-fence broken link exists and was previously
  masked by being lost in the noise, or (b) the regex isn't doing what
  you think. Inspect the diagnostic — the broken-link report still names
  the source file and destination, just with `(in fence: false)` implied
  by virtue of being scanned.
- `COMMIT BLOCKED: Code changes detected but commit is not EC-scoped` →
  commit prefix is not `EC-179:`. Fix the message, do not bypass the hook.

---

## Scope Exclusions (Not in this EC)

- Indented (4-space) code blocks. None of the current wiki content uses
  them; if a future page does and an example link inside trips the gate,
  open a follow-up EC then.
- Single-backtick code spans (`` ` ``…`` ` ``). Same posture — speculative
  fix without a current false positive.
- The 5 source-content broken links. They remain in the wiki files as
  intended (they're pedagogical syntax demos), and the checker now
  correctly classifies them as text rather than links.
