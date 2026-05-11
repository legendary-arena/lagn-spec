#!/usr/bin/env node
// scripts/prune-empty-claude-branch.mjs
//
// Hygiene check for accumulated `claude/*` worktree+branch leftovers
// produced by Claude Code's per-session auto-spawn behavior.
//
// Three modes:
//
//   --report  (default; safe to run from any hook)
//     Read-only audit across all claude/* branches. Counts prunable
//     branches; prints a one-line recommendation only when count
//     exceeds REPORT_THRESHOLD.
//
//   --execute (operator-driven; never fired by a hook)
//     Deletes each prunable branch and its worktree. Skips anything
//     that fails the safety contract.
//
//   --verify-current (operator-driven; pre-delete safety gate)
//     Verifies that the CURRENT branch (where the script is invoked
//     from) is safe to delete. Exits 0 on PASS, 1 on FAIL. Use after
//     a PR merges, before `git branch -D`.
//
// Safety contract for --report / --execute (ALL must hold to prune):
//
//   1. Branch name matches /^claude\//
//   2. Branch is 0 commits ahead of origin/main
//   3. Branch has no remote tracking ref on origin
//   4. Worktree (if attached) has no uncommitted changes other than a
//      modification to .claude/settings.local.json (harness state)
//
// Safety contract for --verify-current (ALL must hold to PASS):
//
//   1. Current branch name matches /^claude\//
//   2. Working tree has no uncommitted changes (except harness state)
//   3. Branch is in a "merged" state, defined as EITHER:
//      a. 0 commits ahead of origin/main (true merge / fast-forward), OR
//      b. A merged PR exists on origin with this branch as head
//         (the squash-merge case; queried via `gh pr list`)
//
// Intentionally narrow. The bulk-prune modes do NOT prune:
//   - branches with real commits (even merged-via-squash — left for
//     the operator to handle with --verify-current + manual delete)
//   - branches with a remote tracking branch (might be in PR review)
//   - worktrees with untracked files or any tracked-file modification
//     besides settings.local.json

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const REPORT_THRESHOLD = 5;
const mode = process.argv.includes('--verify-current') ? 'verify'
  : process.argv.includes('--execute') ? 'execute'
  : 'report';

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
  if (prunable.length < REPORT_THRESHOLD) return 0;
  console.log('');
  console.log(`⚠  ${prunable.length} prunable claude/* branches detected.`);
  console.log(`   To clean up: node scripts/prune-empty-claude-branch.mjs --execute`);
  console.log(`   Reference:   docs/ai/REFERENCE/01.8-claude-code-hooks.md`);
  if (blocked.length > 0) {
    console.log(`   (${blocked.length} additional claude/* branches have real work — review separately.)`);
  }
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
} else {
  const result = audit();
  process.exit(mode === 'execute' ? execute(result) : report(result));
}
