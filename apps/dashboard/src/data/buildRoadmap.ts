import type { RoadmapTask } from '../types/roadmap.js';

/**
 * The canonical, runtime source of truth for the Build Vision & Roadmap page
 * and (later) the schedule-watch agent. This is the structured mirror of the
 * task tables in `apps/dashboard/docs/build-vision-and-roadmap.md` §3 — keep
 * the two in sync until the page can edit this data directly.
 *
 * Target dates are PROPOSED and meant to be edited as reality shifts; a
 * wrong-but-present date beats a blank one (it keeps the on-schedule clock
 * running), per `dashboard-operating-system.md`. `targetDate: null` marks an
 * ongoing task with no fixed deadline (never overdue).
 *
 * The ordering here is the displayed order; the UI never re-sorts it.
 */
export const BUILD_ROADMAP: readonly RoadmapTask[] = [
  // WS1 — Operator Command Center (the system that watches the others)
  {
    id: 'cc-trust-repair',
    workstream: 'command-center',
    title: 'Trust repair: retire 404-ing KPI/DAU/Revenue widgets + refresh governance snapshot',
    agent: 'Builder',
    targetDate: '2026-06-23',
    status: 'next',
    doneDefinition: 'Live Overview shows zero 404s; governance KPIs reflect real WORK_INDEX state',
  },
  {
    id: 'cc-vision-page',
    workstream: 'command-center',
    title: 'Vision & Roadmap page (this surface)',
    agent: 'Builder',
    targetDate: '2026-06-20',
    status: 'in-progress',
    doneDefinition:
      'This roadmap renders in the dashboard with live per-task status + an on-schedule banner',
  },
  {
    id: 'cc-briefing',
    workstream: 'command-center',
    title: 'AI briefing endpoint + panel (Jarvis lead element)',
    agent: 'Architect→Builder',
    targetDate: '2026-06-30',
    status: 'not-started',
    doneDefinition:
      'GET /api/briefing/latest summarizes overnight state; a panel renders it atop the landing',
  },
  {
    id: 'cc-schedule-agent',
    workstream: 'command-center',
    title: 'Schedule-watch agent (nightly cron notifying on slippage)',
    agent: 'Builder',
    targetDate: '2026-07-07',
    status: 'not-started',
    doneDefinition: 'A nightly cron flags overdue/due-soon tasks and notifies Jeff',
  },
  {
    id: 'cc-priority-action',
    workstream: 'command-center',
    title: 'Priority Action widget (dashboard-operating-system.md §Phase 0)',
    agent: 'Builder',
    targetDate: '2026-07-14',
    status: 'not-started',
    doneDefinition: 'One card surfaces the single highest-leverage issue, deep-linked',
  },
  {
    id: 'cc-os-widgets',
    workstream: 'command-center',
    title: 'The 10 operating-system widgets (Sales Funnel, Conversion Health, …)',
    agent: 'Builder',
    targetDate: null,
    status: 'not-started',
    doneDefinition: 'Each ships per its spec in dashboard-operating-system.md §Build Sequence',
  },

  // WS2 — Product & Content (the game is the product)
  {
    id: 'pc-hero-effects-60',
    workstream: 'product-content',
    title: 'Hero-effect authoring: raise executable coverage 44% → 60%',
    agent: 'Builder',
    targetDate: '2026-07-31',
    status: 'in-progress',
    doneDefinition: 'pnpm sim:coverage baseline shows ≥ 60% executable, no regressions',
  },
  {
    id: 'pc-villain-effects',
    workstream: 'product-content',
    title: 'Villain-effect authoring against the new primitives (Levers done)',
    agent: 'Builder',
    targetDate: '2026-08-15',
    status: 'next',
    doneDefinition: 'Villain ability coverage rises against the WP-252 primitives',
  },
  {
    id: 'pc-live-bugs',
    workstream: 'product-content',
    title: 'Close known live gameplay bugs (e.g., villain KO-a-hero choice, WP-242/243)',
    agent: 'Architect→Builder',
    targetDate: '2026-07-15',
    status: 'next',
    doneDefinition: 'Drafted WPs executed + live-verified on play.legendary-arena.com',
  },
  {
    id: 'pc-theme-expansion',
    workstream: 'product-content',
    title: 'Gameplay theme content expansion',
    agent: 'Creator',
    targetDate: null,
    status: 'in-progress',
    doneDefinition: 'New comic-accurate themes added as data (no engine change)',
  },

  // WS3 — Revenue Engine (highest-leverage gap: "no sales = no business")
  {
    id: 're-payment-decision',
    workstream: 'revenue-engine',
    title: 'Payment model + processor decision (subscription-first per §Financial Sustainability)',
    agent: 'Strategist→Architect',
    targetDate: '2026-07-15',
    status: 'not-started',
    doneDefinition:
      'A DECISIONS.md entry fixes the model, processor, and royalty-accounting approach',
  },
  {
    id: 're-account-capture',
    workstream: 'revenue-engine',
    title: 'Email/account capture path (precondition for any sale)',
    agent: 'Builder',
    targetDate: '2026-07-22',
    status: 'not-started',
    doneDefinition: 'A visitor can create an account and be billable',
  },
  {
    id: 're-first-subscription',
    workstream: 'revenue-engine',
    title:
      'First Legendary Supporter subscription tier live (cosmetic/convenience only, NG-1 safe)',
    agent: 'Builder',
    targetDate: '2026-09-30',
    status: 'blocked',
    doneDefinition: 'A real customer can subscribe and pay; royalty share is tracked',
  },
  {
    id: 're-royalty-accounting',
    workstream: 'revenue-engine',
    title: 'Royalty accounting (Upper Deck / Marvel share off every dollar)',
    agent: 'Auditor',
    targetDate: '2026-09-30',
    status: 'not-started',
    doneDefinition: 'Every revenue dollar computes + records its royalty portion',
  },

  // WS4 — Audience (fill the stadium)
  {
    id: 'au-analytics-platform',
    workstream: 'audience',
    title:
      'Wire a real analytics platform (Plausible / CF Web Analytics) — the threshold-widget gate',
    agent: 'Analyst',
    targetDate: '2026-06-30',
    status: 'not-started',
    doneDefinition: 'Dashboard threshold widgets exit no-data mode; real traffic visible',
  },
  {
    id: 'au-email-capture',
    workstream: 'audience',
    title: 'Email capture + welcome sequence (Brevo)',
    agent: 'Creator',
    targetDate: '2026-07-15',
    status: 'not-started',
    doneDefinition: 'New visitors enter an email list and receive a 5-email welcome series',
  },
  {
    id: 'au-daily-cadence',
    workstream: 'audience',
    title: 'Sustain the Daily Execution cadence (YouTube/social/Discord) for 2 weeks',
    agent: 'Creator',
    targetDate: '2026-07-01',
    status: 'not-started',
    doneDefinition: 'Daily Execution panel holds ≥ 7/9 for 14 consecutive days',
  },
  {
    id: 'au-seo-engine',
    workstream: 'audience',
    title: 'SEO / content engine',
    agent: 'Creator',
    targetDate: null,
    status: 'in-progress',
    doneDefinition: 'www Pagefind shipped; blog/YouTube cadence producing indexed content',
  },
];
