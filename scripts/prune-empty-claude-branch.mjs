#!/usr/bin/env node
// scripts/prune-empty-claude-branch.mjs
//
// Hygiene check for accumulated `claude/*` worktree+branch leftovers
// produced by Claude Code's per-session auto-spawn behavior.
//
// Two modes:
//
//   --report  (default; safe to run from any hook)
//     Read-only audit. Counts prunable branches; prints a one-line
//     recommendation only when count exceeds REPORT_THRESHOLD.
//
//   --execute (operator-driven; never fired by a hook)
//     Deletes each prunable branch and its worktree. Skips anything
//     that fails the safety contract.
//
// Safety contract (ALL must hold to prune):
//
//   1. Branch name matches /^claude\//
//   2. Branch is 0 commits ahead of origin/main
//   3. Branch has no remote tracking ref on origin
//   4. Worktree (if attached) has no uncommitted changes other than a
//      modification to .claude/settings.local.json (harness state)
//
// Intentionally narrow. This script will NOT prune:
//   - branches with real commits (even merged-via-squash; that's a
//     separate audit using file-content equivalence)
//   - branches with a remote tracking branch (might be in PR review)
//   - worktrees with untracked files or any tracked-file modification
//     besides settings.local.json

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const REPORT_THRESHOLD = 5;
const mode = process.argv.includes('--execute') ? 'execute' : 'report';

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

const result = audit();
process.exit(mode === 'execute' ? execute(result) : report(result));
