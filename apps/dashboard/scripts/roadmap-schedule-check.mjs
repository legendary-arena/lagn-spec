// Build Vision & Roadmap — schedule-watch agent compute step (increment C).
//
// Reads the canonical roadmap (`src/data/buildRoadmap.ts`), computes each task's
// schedule state at "now" via the §4 rule, builds the tracking-issue title/body,
// and emits CI outputs so `.github/workflows/roadmap-schedule-nightly.yml` can
// open / update / close a single `schedule-watch` GitHub issue.
//
// Run with `pnpm --filter @legendary-arena/dashboard roadmap:schedule` — the
// `node --import tsx` wrapper in the package script lets the TS imports below
// resolve. Always exits 0: the notification IS the issue, so a red job would be
// a confusing second signal.
import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { summarizeRoadmap } from '../src/composables/useBuildRoadmap.js';
import { BUILD_ROADMAP } from '../src/data/buildRoadmap.js';
import { buildScheduleReport } from '../src/utils/roadmapScheduleReport.js';

const nowMs = Date.now();
const generatedAtIso = new Date(nowMs).toISOString();
const summary = summarizeRoadmap(BUILD_ROADMAP, nowMs);
const report = buildScheduleReport(summary, generatedAtIso);

// Always print the body so a local run (and the CI step log) is readable.
console.log(report.body);
console.log(`\nhasSlippage=${report.hasSlippage}`);

// why: in CI, hand the workflow a multiline body via a file (GITHUB_OUTPUT does
// not carry newlines cleanly) and the scalar flag + title as plain outputs.
// Locally GITHUB_OUTPUT is unset, so the stdout above is the whole result.
const githubOutput = process.env.GITHUB_OUTPUT;
if (githubOutput) {
  const bodyFilePath = resolve(process.cwd(), 'roadmap-schedule-body.md');
  writeFileSync(bodyFilePath, report.body, 'utf8');
  appendFileSync(githubOutput, `has_slippage=${report.hasSlippage}\n`, 'utf8');
  appendFileSync(githubOutput, `issue_title=${report.title}\n`, 'utf8');
  appendFileSync(githubOutput, `body_file=${bodyFilePath}\n`, 'utf8');
}
