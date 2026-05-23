#!/usr/bin/env node
// scripts/prune-empty-claude-branch.mjs
//
// Hygiene check for accumulated `claude/*` worktree+branch leftovers
// produced by Claude Code's per-session auto-spawn behavior.
//
// Five modes:
//
//   --report  (default; safe to run from any hook)
//     Read-only audit across all claude/* branches. Counts prunable
//     branches; prints a one-line recommendation only when count
//     exceeds REPORT_THRESHOLD. Add --verbose to see per-branch
//     detail regardless of threshold.
//
//   --execute (operator-driven; never fired by a hook)
//     Deletes each prunable branch (0 commits ahead, no remote)
//     and its worktree. Skips anything that fails the safety contract.
//     Does NOT handle squash-merged branches — use --cleanup-orphans
//     for those.
//
//   --cleanup-orphans (operator-driven; broader than --execute)
//     Like --execute, plus also prunes claude/* branches whose work
//     IS on main via squash-merge (commits ahead of origin/main but
//     a merged PR exists on origin with this branch as head). Catches
//     branches that --execute leaves as "blocked" but are actually safe.
//
//   --verify-current (operator-driven; pre-delete safety gate)
//     Verifies that the CURRENT branch (where the script is invoked
//     from) is safe to delete. Exits 0 on PASS, 1 on FAIL. Use after
//     a PR merges, before `git branch -D`.
//
//   --audit (operator-driven; informational only, never destructive)
//     Surfaces soft-case findings that --report's strict safety contract
//     misses. Reports across four heuristics; the operator decides per
//     finding. Always exits 0. Heuristics:
//
//       abandoned-no-PR      Branch has 1+ commits ahead of main, no PR
//                            on record (any state), and last commit is
//                            older than --abandoned-days (default 7).
//       worktree-idle        Worktree has had no activity for longer
//                            than --idle-days (default 14). Activity =
//                            the most recent of HEAD commit time OR
//                            mtime of any tracked file in the worktree.
//       stale-untracked-spec Worktree has untracked WP-*.md / EC-*.md
//                            drafts whose slug number already exists on
//                            main (the spec shipped via another path).
//       dangling-far-behind  Branch is 0 commits ahead of main but
//                            >--behind-threshold commits behind
//                            (default 50). The work landed via a
//                            different path; the branch is now noise.
//
//     Future concern: a SessionStart hook could surface counts as a
//     chip; not wired in this commit (intentional — surface first,
//     decide on hook integration after operator validation).
//
// Safety contract for --report / --execute (ALL must hold to prune):
//
//   1. Branch name matches /^claude\//
//   2. Branch is 0 commits ahead of origin/main
//   3. Branch has no remote tracking ref on origin
//   4. Worktree (if attached) has no uncommitted changes other than a
//      modification to .claude/settings.local.json (harness state)
//
// Safety contract for --cleanup-orphans (extends --execute):
//
//   Conditions 1 + 4 still apply, PLUS the branch must satisfy ONE OF:
//   (a) Conditions 2 + 3 (the original --execute contract: auto-spawn
//       orphan with no commits ahead and no remote), OR
//   (b) Branch has commits ahead AND a merged PR exists on origin with
//       this branch as head (the squash-merge case).
//
// Safety contract for --verify-current (ALL must hold to PASS):
//
//   1. Current branch name matches /^claude\//
//   2. Working tree has no uncommitted changes (except harness state)
//   3. Branch is in a "merged" state, defined as EITHER:
//      a. 0 commits ahead of origin/main (true merge / fast-forward), OR
//      b. A merged PR exists on origin with this branch as head
//         (the squash-merge case; queried via `gh pr list`)

import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const REPORT_THRESHOLD = 5;
const mode = process.argv.includes('--verify-current') ? 'verify'
  : process.argv.includes('--audit') ? 'audit'
  : process.argv.includes('--cleanup-orphans') ? 'cleanup-orphans'
  : process.argv.includes('--execute') ? 'execute'
  : 'report';
const verbose = process.argv.includes('--verbose');

/**
 * Parses `--<name> <number>` from argv. Returns defaultValue if missing,
 * non-numeric, or non-positive. Used by --audit threshold flags.
 */
function getNumberFlag(name, defaultValue) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return defaultValue;
  const value = Number(process.argv[idx + 1]);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

function git(args, cwd) {
  return execSync(`git ${args}`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * Returns the canonical clone path (first entry in `git worktree list`).
 * The script runs from any worktree, so we anchor git plumbing here.
 */
function getCanonicalRoot() {
  const blocks = git('worktree list --porcelain').split('\n\n');
  for (const block of blocks) {
    if (!block.startsWith('worktree ')) continue;
    if (block.includes('\nbare')) continue;
    return block.split('\n')[0].slice('worktree '.length);
  }
  throw new Error('Could not determine canonical clone path from `git worktree list`.');
}

/** Lists all local `claude/*` branches. */
function listClaudeBranches(repo) {
  const out = git(`branch --list "claude/*"`, repo);
  if (out.length === 0) return [];
  return out
    .split('\n')
    .map(line => line.replace(/^[+* ]+/, '').trim())
    .filter(branch => branch.startsWith('claude/'));
}

/** True if origin has a `refs/heads/<branch>` ref. */
function hasRemoteBranch(repo, branch) {
  const out = git(`ls-remote --heads origin ${branch}`, repo);
  return out.length > 0;
}

/** Number of commits the branch is ahead of origin/main; -1 if unknown. */
function commitsAheadOfMain(repo, branch) {
  try {
    return Number(git(`rev-list --count origin/main..${branch}`, repo));
  } catch {
    return -1;
  }
}

/** Returns the worktree path if the branch is checked out somewhere, else null. */
function findWorktree(repo, branch) {
  const blocks = git('worktree list --porcelain', repo).split('\n\n');
  for (const block of blocks) {
    if (block.includes(`branch refs/heads/${branch}`)) {
      return block.split('\n')[0].slice('worktree '.length);
    }
  }
  return null;
}

/**
 * True if the worktree has no uncommitted changes, or has only a
 * modification to .claude/settings.local.json (the per-worktree Claude
 * harness state file). False if any other modification or any untracked
 * file is present.
 */
function isWorktreeDirtOnly(worktreePath) {
  if (!existsSync(worktreePath)) return true;
  const out = git('status --short', worktreePath);
  if (out.length === 0) return true;
  return out.split('\n').every(line => / \.claude\/settings\.local\.json$/.test(line));
}

/** Classifies every `claude/*` branch into prunable or blocked. */
function audit() {
  const repo = getCanonicalRoot();
  const prunable = [];
  const blocked = [];

  for (const branch of listClaudeBranches(repo)) {
    if (hasRemoteBranch(repo, branch)) {
      blocked.push({ branch, reason: 'has remote tracking ref' });
      continue;
    }
    const ahead = commitsAheadOfMain(repo, branch);
    if (ahead !== 0) {
      blocked.push({ branch, reason: `${ahead} commit(s) ahead of origin/main` });
      continue;
    }
    const worktree = findWorktree(repo, branch);
    if (worktree && !isWorktreeDirtOnly(worktree)) {
      blocked.push({ branch, reason: 'worktree has real uncommitted work' });
      continue;
    }
    prunable.push({ branch, worktree });
  }

  return { repo, prunable, blocked };
}

function report({ prunable, blocked }) {
  const underThreshold = prunable.length < REPORT_THRESHOLD;
  if (underThreshold && !verbose) return 0;

  console.log('');
  if (underThreshold) {
    console.log(`${prunable.length} prunable claude/* branch(es) (under threshold ${REPORT_THRESHOLD}; would be silent without --verbose).`);
  } else {
    console.log(`!  ${prunable.length} prunable claude/* branches detected.`);
  }

  if (verbose) {
    if (prunable.length > 0) {
      console.log(`   Prunable (auto-spawn orphans):`);
      for (const { branch } of prunable) console.log(`     ${branch}`);
    }
    if (blocked.length > 0) {
      console.log(`   Blocked (need review; some may be squash-merge candidates):`);
      for (const { branch, reason } of blocked) console.log(`     ${branch} — ${reason}`);
    }
  } else if (blocked.length > 0) {
    console.log(`   (${blocked.length} additional claude/* branches have real work — review separately. Run with --verbose for per-branch detail.)`);
  }

  console.log(`   To clean up: node scripts/prune-empty-claude-branch.mjs --execute`);
  console.log(`                 (or --cleanup-orphans to also prune squash-merged claude/* branches)`);
  console.log(`   Reference:   docs/ai/REFERENCE/01.8-claude-code-hooks.md`);
  console.log('');
  return 0;
}

function execute({ repo, prunable, blocked }) {
  if (prunable.length === 0) {
    console.log('Nothing to prune. All claude/* branches either have real work or do not exist.');
    if (blocked.length > 0) {
      console.log(`\n${blocked.length} branch(es) with real work (review separately):`);
      for (const { branch, reason } of blocked) console.log(`  ${branch} — ${reason}`);
    }
    return 0;
  }
  console.log(`Pruning ${prunable.length} claude/* branch(es) + worktree(s):\n`);
  let removed = 0;
  let failed = 0;
  for (const { branch, worktree } of prunable) {
    try {
      if (worktree) {
        execSync(`git -C "${repo}" worktree remove --force "${worktree}"`, { stdio: 'pipe' });
      }
      execSync(`git -C "${repo}" branch -D "${branch}"`, { stdio: 'pipe' });
      console.log(`  removed: ${branch}`);
      removed++;
    } catch (err) {
      console.log(`  FAILED:  ${branch} — ${err.message.split('\n')[0]}`);
      failed++;
    }
  }
  console.log(`\nRemoved: ${removed}. Failed: ${failed}.`);
  if (blocked.length > 0) {
    console.log(`\n${blocked.length} branch(es) skipped (real work present):`);
    for (const { branch, reason } of blocked) console.log(`  ${branch} — ${reason}`);
  }
  return failed === 0 ? 0 : 1;
}

/**
 * --cleanup-orphans mode: like --execute, plus also prunes claude/* branches
 * whose work IS on main via squash-merge. Iterates the blocked list from
 * audit(), checks each "commits ahead" branch for a merged PR on origin,
 * and prunes if found. Branches with real uncommitted work in their worktree
 * remain blocked even if a merged PR exists (workspace state precedes
 * remote state).
 */
function cleanupOrphans({ repo, prunable, blocked }) {
  // Pre-classify: start with the prunable list (auto-spawn orphans, the
  // original --execute scope), then promote squash-merge candidates from
  // the blocked list.
  const toDelete = prunable.map(p => ({ ...p, reason: '0 ahead, no remote' }));
  const stillBlocked = [];
  let ghUnavailable = false;

  for (const { branch, reason } of blocked) {
    // Only "commits ahead" entries are squash-merge candidates.
    if (!/commit\(s\) ahead/.test(reason)) {
      stillBlocked.push({ branch, reason });
      continue;
    }

    // worktree-dirt check: real uncommitted work overrides any merged-PR signal
    const worktree = findWorktree(repo, branch);
    if (worktree && !isWorktreeDirtOnly(worktree)) {
      stillBlocked.push({ branch, reason: `${reason}; worktree has uncommitted work` });
      continue;
    }

    const merged = hasMergedPR(branch);
    if (merged === true) {
      toDelete.push({ branch, worktree, reason: `squash-merged via gh PR (${reason})` });
    } else if (merged === null) {
      ghUnavailable = true;
      stillBlocked.push({ branch, reason: `${reason}; gh unavailable (can't verify squash-merge)` });
    } else {
      stillBlocked.push({ branch, reason });
    }
  }

  if (ghUnavailable) {
    console.log('Warning: gh CLI unavailable. Some squash-merge candidates could not be verified and remain blocked.\n');
  }

  if (toDelete.length === 0) {
    console.log('Nothing to prune (no auto-spawn orphans, no squash-merged claude/* branches).');
    if (stillBlocked.length > 0) {
      console.log(`\n${stillBlocked.length} branch(es) blocked (review separately):`);
      for (const { branch, reason } of stillBlocked) console.log(`  ${branch} — ${reason}`);
    }
    return 0;
  }

  console.log(`Pruning ${toDelete.length} claude/* branch(es) + worktree(s):\n`);
  let removed = 0;
  let failed = 0;
  for (const { branch, worktree, reason } of toDelete) {
    try {
      if (worktree) {
        execSync(`git -C "${repo}" worktree remove --force "${worktree}"`, { stdio: 'pipe' });
      }
      execSync(`git -C "${repo}" branch -D "${branch}"`, { stdio: 'pipe' });
      // Also try remote delete — may fail silently if no remote ref exists,
      // which is expected for auto-spawn orphans. We swallow that case.
      try {
        execSync(`git -C "${repo}" push origin --delete "${branch}"`, { stdio: 'pipe' });
      } catch {
        // Remote ref didn't exist — fine.
      }
      console.log(`  removed: ${branch} (${reason})`);
      removed++;
    } catch (err) {
      console.log(`  FAILED:  ${branch} — ${err.message.split('\n')[0]}`);
      failed++;
    }
  }
  console.log(`\nRemoved: ${removed}. Failed: ${failed}.`);
  if (stillBlocked.length > 0) {
    console.log(`\n${stillBlocked.length} branch(es) still blocked (need operator review):`);
    for (const { branch, reason } of stillBlocked) console.log(`  ${branch} — ${reason}`);
  }
  return failed === 0 ? 0 : 1;
}

/**
 * Returns true if origin has a merged PR with the given branch as head.
 * Requires `gh` CLI to be installed and authenticated. Returns null if
 * `gh` is unavailable so the caller can degrade gracefully.
 */
function hasMergedPR(branch) {
  try {
    const out = execSync(
      `gh pr list --state merged --search "head:${branch}" --json number --jq "length"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
    return Number(out) > 0;
  } catch {
    return null;
  }
}

/**
 * Returns the unix timestamp (seconds) of the last commit on the given ref
 * from the given cwd. Returns 0 if the ref is unreachable.
 */
function lastCommitTimestamp(cwd, ref) {
  try {
    return Number(git(`log -1 --format=%ct ${ref}`, cwd));
  } catch {
    return 0;
  }
}

/**
 * Number of commits the branch is behind origin/main; -1 if unknown.
 * Used by --audit's dangling-far-behind heuristic.
 */
function commitsBehindMain(repo, branch) {
  try {
    return Number(git(`rev-list --count ${branch}..origin/main`, repo));
  } catch {
    return -1;
  }
}

/**
 * Returns the max mtime (unix seconds) across all tracked files in the
 * worktree. Used by --audit's worktree-idle heuristic to detect activity
 * beyond just commit timestamps. Returns 0 if the worktree is missing or
 * empty.
 */
function maxTrackedFileMtime(worktreePath) {
  if (!existsSync(worktreePath)) return 0;
  let files;
  try {
    files = git('ls-files', worktreePath).split('\n').filter(Boolean);
  } catch {
    return 0;
  }
  let maxMs = 0;
  for (const relPath of files) {
    const fullPath = path.join(worktreePath, relPath);
    try {
      const stat = statSync(fullPath);
      if (stat.mtimeMs > maxMs) maxMs = stat.mtimeMs;
    } catch {
      // Skip missing files (sparse checkout, broken symlinks, etc.).
    }
  }
  return Math.floor(maxMs / 1000);
}

/**
 * Lists every claude/* worktree as { branch, worktreePath }. Skips the
 * canonical clone (which is never on a claude/* branch in normal use).
 */
function listClaudeWorktrees(repo) {
  const blocks = git('worktree list --porcelain', repo).split('\n\n');
  const results = [];
  for (const block of blocks) {
    let worktreePath = null;
    let branch = null;
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) worktreePath = line.slice('worktree '.length);
      else if (line.startsWith('branch refs/heads/')) branch = line.slice('branch refs/heads/'.length);
    }
    if (worktreePath && branch && branch.startsWith('claude/')) {
      results.push({ branch, worktreePath });
    }
  }
  return results;
}

/**
 * Returns the count of PRs (any state) where the given branch is the
 * head. Returns -1 if the gh CLI is unavailable so the caller can degrade
 * gracefully (--audit emits a single warning and skips the heuristic).
 */
function ghPRCount(branch) {
  try {
    const out = execSync(
      `gh pr list --state all --search "head:${branch}" --json number --jq "length"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
    return Number(out);
  } catch {
    return -1;
  }
}

/**
 * Returns the set of WP and EC numbers present on main (parsed from
 * filenames like `WP-171-pile-browse-modal.md`). Used by --audit's
 * stale-untracked-spec heuristic to decide whether an untracked draft
 * was already superseded by what shipped.
 */
function mainSpecSlugs(repo) {
  const wpNumbers = new Set();
  const ecNumbers = new Set();
  try {
    const wps = git('ls-tree -r --name-only main -- docs/ai/work-packets', repo).split('\n');
    for (const file of wps) {
      const m = file.match(/WP-(\d+)/);
      if (m) wpNumbers.add(m[1]);
    }
  } catch {
    // Tree may not exist in this repo state; treat as empty.
  }
  try {
    const ecs = git('ls-tree -r --name-only main -- docs/ai/execution-checklists', repo).split('\n');
    for (const file of ecs) {
      const m = file.match(/EC-(\d+)/);
      if (m) ecNumbers.add(m[1]);
    }
  } catch {
    // Same as above.
  }
  return { wpNumbers, ecNumbers };
}

/**
 * Returns untracked files in the worktree that match the WP-*.md or
 * EC-*.md naming pattern under docs/ai/. Empty array if the worktree
 * is missing.
 */
function untrackedSpecs(worktreePath) {
  if (!existsSync(worktreePath)) return [];
  let out;
  try {
    out = git('ls-files --others --exclude-standard', worktreePath);
  } catch {
    return [];
  }
  if (!out) return [];
  return out.split('\n').filter(line =>
    /^docs\/ai\/work-packets\/WP-\d+/.test(line) ||
    /^docs\/ai\/execution-checklists\/EC-\d+/.test(line)
  );
}

/**
 * Runs the four soft-case heuristics and returns findings grouped by
 * heuristic name. Pure: no side effects, no destructive operations.
 * The caller (reportAudit) is responsible for printing.
 */
function auditSoftCases() {
  const repo = getCanonicalRoot();
  const abandonedDays = getNumberFlag('--abandoned-days', 7);
  const idleDays = getNumberFlag('--idle-days', 14);
  const behindThreshold = getNumberFlag('--behind-threshold', 50);

  const now = Math.floor(Date.now() / 1000);
  const abandonedThresholdSec = abandonedDays * 86400;
  const idleThresholdSec = idleDays * 86400;

  const findings = {
    'abandoned-no-PR': [],
    'worktree-idle': [],
    'stale-untracked-spec': [],
    'dangling-far-behind': [],
  };
  let ghUnavailable = false;

  const branches = listClaudeBranches(repo);
  const claudeWorktrees = listClaudeWorktrees(repo);
  const { wpNumbers, ecNumbers } = mainSpecSlugs(repo);

  // Heuristic 1 (abandoned-no-PR) + Heuristic 4 (dangling-far-behind) —
  // both keyed on branch state.
  for (const branch of branches) {
    const ahead = commitsAheadOfMain(repo, branch);

    if (ahead > 0) {
      const lastCommit = lastCommitTimestamp(repo, branch);
      if (lastCommit > 0 && (now - lastCommit) >= abandonedThresholdSec) {
        const prCount = ghPRCount(branch);
        if (prCount === 0) {
          const ageDays = Math.floor((now - lastCommit) / 86400);
          findings['abandoned-no-PR'].push({
            target: branch,
            reason: `${ageDays} days since last commit, no PR on record (any state)`,
          });
        } else if (prCount === -1) {
          ghUnavailable = true;
        }
      }
    } else if (ahead === 0) {
      const behind = commitsBehindMain(repo, branch);
      if (behind > behindThreshold) {
        findings['dangling-far-behind'].push({
          target: branch,
          reason: `0 ahead, ${behind} behind origin/main (threshold ${behindThreshold})`,
        });
      }
    }
  }

  // Heuristic 2 (worktree-idle) + Heuristic 3 (stale-untracked-spec) —
  // both keyed on worktree state.
  for (const { branch, worktreePath } of claudeWorktrees) {
    if (!existsSync(worktreePath)) continue;

    const headTimestamp = lastCommitTimestamp(worktreePath, 'HEAD');
    const fileTimestamp = maxTrackedFileMtime(worktreePath);
    const mostRecent = Math.max(headTimestamp, fileTimestamp);
    if (mostRecent > 0 && (now - mostRecent) >= idleThresholdSec) {
      const ageDays = Math.floor((now - mostRecent) / 86400);
      findings['worktree-idle'].push({
        target: worktreePath,
        reason: `${ageDays} days since last activity on ${branch}`,
      });
    }

    for (const file of untrackedSpecs(worktreePath)) {
      const wpMatch = file.match(/work-packets\/WP-(\d+)-/);
      const ecMatch = file.match(/execution-checklists\/EC-(\d+)/);
      if (wpMatch && wpNumbers.has(wpMatch[1])) {
        findings['stale-untracked-spec'].push({
          target: worktreePath,
          reason: `untracked ${file} — WP-${wpMatch[1]} already shipped on main`,
        });
      } else if (ecMatch && ecNumbers.has(ecMatch[1])) {
        findings['stale-untracked-spec'].push({
          target: worktreePath,
          reason: `untracked ${file} — EC-${ecMatch[1]} already shipped on main`,
        });
      }
    }
  }

  return { findings, ghUnavailable };
}

/**
 * Prints --audit findings grouped by heuristic, with a per-heuristic
 * summary count at the end. Always returns 0 (audit is informational).
 */
function reportAudit({ findings, ghUnavailable }) {
  const groups = ['abandoned-no-PR', 'worktree-idle', 'stale-untracked-spec', 'dangling-far-behind'];
  let total = 0;

  if (ghUnavailable) {
    console.log('Warning: gh CLI unavailable. abandoned-no-PR results may be incomplete.\n');
  }

  for (const group of groups) {
    for (const { target, reason } of findings[group]) {
      console.log(`[${group}] ${target}: ${reason}`);
      total++;
    }
  }

  if (total === 0) {
    console.log('No soft-case findings.');
  }

  console.log('');
  console.log('Summary:');
  for (const group of groups) {
    console.log(`  ${group}: ${findings[group].length}`);
  }
  console.log(`  total: ${total}`);

  return 0;
}

/**
 * Verifies the current branch is safe to delete. Output is single-line
 * PASS/FAIL with operator-actionable diagnosis on failure.
 */
function verifyCurrent() {
  const branch = git('rev-parse --abbrev-ref HEAD');

  if (!branch.startsWith('claude/')) {
    console.log(`VERIFY FAIL: Current branch "${branch}" is not a claude/* branch. --verify-current is only meant for ephemeral session branches.`);
    return 1;
  }

  if (!isWorktreeDirtOnly(process.cwd())) {
    console.log(`VERIFY FAIL: Working tree has uncommitted changes other than .claude/settings.local.json. Commit, stash, or discard before verification.`);
    return 1;
  }

  const ahead = commitsAheadOfMain(undefined, branch);

  if (ahead === 0) {
    console.log(`VERIFY PASS: Branch "${branch}" is fully merged (0 commits ahead of origin/main). Safe to delete.`);
    return 0;
  }

  if (ahead < 0) {
    console.log(`VERIFY FAIL: Could not compute commits ahead of origin/main. Ensure 'origin/main' ref is present (try: git fetch origin main).`);
    return 1;
  }

  // Has commits ahead — could be a squash-merge survivor. Check gh.
  const mergedPR = hasMergedPR(branch);

  if (mergedPR === true) {
    console.log(`VERIFY PASS: Branch "${branch}" has ${ahead} commit(s) ahead of origin/main but a merged PR is recorded on origin. Safe to delete (squash-merge pattern).`);
    return 0;
  }

  if (mergedPR === null) {
    console.log(`VERIFY FAIL: Branch "${branch}" has ${ahead} commit(s) ahead of origin/main, and gh CLI is unavailable to check for a squash-merged PR. Either (a) merge the PR first, (b) install/authenticate the gh CLI, or (c) confirm manually that the work is on main and use git branch -D directly.`);
    return 1;
  }

  console.log(`VERIFY FAIL: Branch "${branch}" has ${ahead} commit(s) ahead of origin/main and no merged PR exists. The branch carries unmerged work — either merge it or discard before deletion.`);
  return 1;
}

if (mode === 'verify') {
  process.exit(verifyCurrent());
} else if (mode === 'audit') {
  process.exit(reportAudit(auditSoftCases()));
} else {
  const result = audit();
  if (mode === 'execute') {
    process.exit(execute(result));
  } else if (mode === 'cleanup-orphans') {
    process.exit(cleanupOrphans(result));
  } else {
    process.exit(report(result));
  }
}
