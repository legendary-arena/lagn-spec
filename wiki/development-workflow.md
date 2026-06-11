---
title: Development Workflow
type: Guide
tags:
  - operations
  - tooling
  - governance
  - cloudflare
  - render
  - tailscale
  - ci
related:
  - operational-health-checks.md
  - hugo-web-system.md
  - wiki-viewer.md
status: draft
source:
  - ../docs/ai/REFERENCE/development-workflow.md
  - ../docs/ai/REFERENCE/01-render-infrastructure.md
  - ../docs/ai/REFERENCE/01.0a-wp-drafting-phase.md
  - ../docs/ai/REFERENCE/01.0b-wp-execution-phase.md
last-reviewed: 2026-06-11
---

## Summary

The develop-from-anywhere loop describes how a change travels from idea
to production for `legendary-arena.com`. Three operator surfaces (laptop,
home workstation, phone) drive Claude Code sessions that build to WP/EC
contracts, commit to GitHub, and deploy automatically via Render and
Cloudflare on merge to `main`. A nightly CI triage agent closes the loop
by generating new work packets from sweep results.

## Mechanics

### Actors

| Actor | Role |
|---|---|
| **Laptop** | Primary workstation — Claude Code, local `pnpm` gates (`test` / `typecheck` / `build`), dev servers. |
| **Home Workstation** *(personal)* | Always-on execution environment — Claude Code sessions, dev servers, background jobs, future local AI models (7B–70B). Accessed via Tailscale + Remote Desktop / SSH. |
| **Tailscale Network** *(personal)* | Private encrypted mesh connecting laptop, phone, and workstation. No port forwarding; stable private IPs / names. |
| **Phone** | Mobile control surface — PR review + merge, deploy monitoring, remote session steering via Tailscale. Does not author. |
| **Claude** | Two roles: **Claude Code** (laptop or workstation) builds to WP/EC contract; **Claude-in-CI** runs the nightly Inspector triage agent. |
| **GitHub** | Branch → PR → squash-merge `main`; holds the governance ledger; runs CI; merge triggers deploy. |
| **Render** | Game server + managed PostgreSQL; deploys on commit to `main`. |
| **Cloudflare** | Pages hosts front-ends; R2 hosts card images (`images.legendary-arena.com`). |

### Round trip (idea to live)

1. **Start it** — on the laptop, home workstation (local or via Tailscale), or phone.
2. **Claude Code builds it** — builds to the WP/EC contract, runs local gates, commits with two-commit topology (`EC-NNN:` implementation + `SPEC:` governance close).
3. **GitHub takes it** — branch → PR → CI (build/deploy, commit hygiene, registry validation, nightly sweep + inspection workflows).
4. **Approve from the phone** — merge PR via GitHub UI (phone-friendly).
5. **It ships automatically** — `main` → Render rebuild + migrations; Cloudflare rebuilds front-ends + R2 serves assets. Live across `*.legendary-arena.com`.
6. **It feeds itself** — nightly Claude CI Inspector triage; WP auto-verification loop (WP-231/233); new findings generate new WPs → re-enter at step 1.

### Remote execution model

The home workstation acts as the always-on execution node. All remote
access flows through the Tailscale private mesh — no public ports exposed.

- **Remote Desktop** for full UI control
- **SSH** for terminal-first workflows
- Sessions and dev servers survive laptop shutdown

### AI layer (personal infrastructure)

Not part of the committed stack. The workstation may host Claude Code as
primary orchestrator and local AI models (future: 7B–14B for
experimentation, 70B+ for heavy reasoning). This reduces external API
dependency and enables long-running autonomous workflows.

## Interactions

- **Committed stack:** GitHub, Render, Cloudflare, CI, governance — all
  reproducible from repo config.
- **Personal layer:** Workstation, Tailscale, local AI models — operator-managed,
  not in any committed config (`render.yaml`, `.env.example`).
- **Governance docs:** the workflow is subordinate to the authority chain
  (`.claude/CLAUDE.md` → `docs/ai/ARCHITECTURE.md` → `.claude/rules/*.md`)
  and defines no rules of its own.
- **Deploy infrastructure:** for Render and Cloudflare specifics, see
  [01-render-infrastructure.md](../docs/ai/REFERENCE/01-render-infrastructure.md).
- **WP/EC execution:** for the drafting and execution mechanics, see
  [01.0a-wp-drafting-phase.md](../docs/ai/REFERENCE/01.0a-wp-drafting-phase.md)
  and [01.0b-wp-execution-phase.md](../docs/ai/REFERENCE/01.0b-wp-execution-phase.md).

## Edge Cases

- **If the workstation becomes committed infrastructure** (e.g., scheduled
  agents, model-backed APIs), it must be defined in repo config and
  documented in both the REFERENCE doc and `01-render-infrastructure.md`.
- **Claude is two things, not one** — the local pair programmer and the
  autonomous CI agent are distinct execution contexts with different
  permissions and scopes.

## References

- [docs/ai/REFERENCE/development-workflow.md](../docs/ai/REFERENCE/development-workflow.md) — authoritative REFERENCE doc
- [docs/ai/REFERENCE/01-render-infrastructure.md](../docs/ai/REFERENCE/01-render-infrastructure.md) — deploy/runtime infrastructure
- [docs/ai/REFERENCE/01.0a-wp-drafting-phase.md](../docs/ai/REFERENCE/01.0a-wp-drafting-phase.md) — WP drafting phase
- [docs/ai/REFERENCE/01.0b-wp-execution-phase.md](../docs/ai/REFERENCE/01.0b-wp-execution-phase.md) — WP execution phase
- [.github/workflows/inspection-nightly.yml](../.github/workflows/inspection-nightly.yml) — nightly Inspector triage agent
