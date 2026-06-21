import {
  WORKSTREAM_LABELS,
  type RoadmapSummary,
  type TaskWithState,
  type WorkstreamId,
} from '../types/roadmap.js';

/**
 * The output of the schedule-watch report: a slippage flag plus the title and
 * markdown body the nightly workflow uses to open / update / close the single
 * tracking GitHub issue. Pure and deterministic for a given summary + instant.
 */
export interface ScheduleReport {
  hasSlippage: boolean;
  title: string;
  body: string;
}

interface LocatedTask {
  workstream: WorkstreamId;
  task: TaskWithState;
}

/**
 * Flattens every task across all workstreams that is in the given schedule
 * state, keeping its owning workstream for display.
 */
function collectByState(summary: RoadmapSummary, state: TaskWithState['state']): LocatedTask[] {
  const located: LocatedTask[] = [];
  for (const workstream of summary.workstreams) {
    for (const task of workstream.tasks) {
      if (task.state === state) {
        located.push({ workstream: workstream.id, task });
      }
    }
  }
  return located;
}

/**
 * Renders one markdown bullet per task — title, workstream, the due phrasing,
 * the target date (or "ongoing"), and the definition of done so the issue is
 * actionable without opening the dashboard.
 */
function renderTaskLines(items: readonly LocatedTask[], dueVerb: string): string {
  const lines: string[] = [];
  for (const item of items) {
    const workstreamLabel = WORKSTREAM_LABELS[item.workstream];
    const targetDisplay = item.task.targetDate ?? 'ongoing';
    lines.push(
      `- **${item.task.title}** — ${workstreamLabel} · ${dueVerb} ${targetDisplay}\n` +
        `  _Done = ${item.task.doneDefinition}_`,
    );
  }
  return lines.join('\n');
}

/**
 * Builds the schedule-watch report from a roadmap summary. `hasSlippage` is true
 * when any task is overdue or due-soon; the body leads with the overdue tasks
 * (finish-first), then the due-soon tasks, then a counts footer pointing back to
 * the source data. The workflow opens/updates the tracking issue when there is
 * slippage and closes it when there is none.
 */
export function buildScheduleReport(
  summary: RoadmapSummary,
  generatedAtIso: string,
): ScheduleReport {
  const overdue = collectByState(summary, 'overdue');
  const dueSoon = collectByState(summary, 'due-soon');
  const hasSlippage = overdue.length > 0 || dueSoon.length > 0;

  const title = `Build schedule watch — ${overdue.length} overdue, ${dueSoon.length} due soon`;

  const sections: string[] = [];
  sections.push(`_Generated ${generatedAtIso}_`);
  sections.push(
    `**${summary.counts.overdue} overdue · ${summary.counts.dueSoon} due soon · ` +
      `${summary.counts.onTrack} on track · ${summary.counts.done} done · ` +
      `${summary.counts.blocked} blocked**`,
  );

  if (overdue.length > 0) {
    sections.push(`## ⛔ Overdue — finish these first\n${renderTaskLines(overdue, 'was due')}`);
  }
  if (dueSoon.length > 0) {
    sections.push(`## ⏳ Due soon (within 3 days)\n${renderTaskLines(dueSoon, 'due')}`);
  }
  if (!hasSlippage) {
    sections.push('Nothing is slipping. Every tracked task is on schedule, done, or blocked. ✅');
  }

  sections.push(
    '---\n' +
      'Source: `apps/dashboard/docs/build-vision-and-roadmap.md` · live view: the dashboard ' +
      '**Vision** page. Edit target dates in `apps/dashboard/src/data/buildRoadmap.ts`.',
  );

  return { hasSlippage, title, body: sections.join('\n\n') };
}
