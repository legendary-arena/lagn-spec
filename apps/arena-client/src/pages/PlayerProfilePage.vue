<script lang="ts">
import { defineComponent, onMounted, ref, watch } from 'vue';

import {
  fetchPublicProfile,
  type PublicProfileView,
} from '../lib/api/profileApi';

// why: defineComponent({ setup() { return {...} } }) is required (NOT
// <script setup>) because the template references non-prop bindings
// — the `state`, `view`, `errorStatus`, and `formattedDate` values
// — that under the @legendary-arena/vue-sfc-loader separate-compile
// pipeline only reach `_ctx` when explicitly returned from setup()
// (D-6512 / P6-30; precedent matches App.vue, ArenaHud, and
// ReplayFileLoader).

// why: WP-109 — TeamAffiliation shape declared locally rather than
// imported from profileApi.ts. profileApi.ts is locked under WP-102
// contract (byte-identical post-WP-109 per Hard Stop list); the
// server JSON body carries the additional `teamAffiliations` field
// regardless. The local interface mirrors the server's shape per the
// engine/server isolation rule (WP-102 §Scope (In) §G); a future WP
// that lifts the WP-102 contract lock can move this declaration into
// profileApi.ts.
interface TeamAffiliationDisplay {
  readonly teamId: string;
  readonly teamSize: 3 | 4 | 5;
  readonly role: 'member' | 'substitute';
  readonly joinedAt: string;
  readonly leftAt: string | null;
}

// why: WP-105 — PlayerBadgeSummary shape declared locally per the same
// engine/server isolation rule that governs TeamAffiliationDisplay above.
// Mirrors apps/server/src/profile/profile.types.ts#PlayerBadgeSummary.
interface PlayerBadgeSummaryDisplay {
  readonly badgeKey: string;
  readonly label: string;
  readonly description: string;
  readonly awardedAt: string;
}

interface PublicProfileViewWithExtras extends PublicProfileView {
  readonly teamAffiliations: readonly TeamAffiliationDisplay[];
  readonly badges: readonly PlayerBadgeSummaryDisplay[];
}

type LoadState = 'loading' | 'ready' | 'not_found' | 'error';

// why: format `createdAt` once at render time rather than persisting
// a formatted copy in the page state. Intl.DateTimeFormat is the
// standard way to get a locale-respecting display without pulling
// a date-formatting library (no new npm dependency per WP-102 §Goal
// "No new npm dependencies"). The fallback returns the raw ISO
// string when the input is somehow not parseable, so a malformed
// server response never blanks the row.
function formatCreatedAt(raw: string): string {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}

// why: per WP-109 §6, Legendary supports three meaningful cooperative
// formats; the human-facing label uses the "N-handed cohort" framing
// rather than "N-player team" to avoid the competitive overtone of
// "team" in casual reading. Hero-vs-villain "vs" framing remains
// permitted per the project memory feedback_pvp_terminology_scope.
function formatTeamSizeLabel(size: 3 | 4 | 5): string {
  return `${size}-handed cohort`;
}

function formatRoleLabel(role: 'member' | 'substitute'): string {
  return role === 'member' ? 'member' : 'substitute';
}

export default defineComponent({
  name: 'PlayerProfilePage',
  props: {
    handle: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const state = ref<LoadState>('loading');
    // why: cast to the locally-extended view type so the template can
    // reach `view.teamAffiliations` without modifying the locked
    // profileApi.ts contract. The server's wire shape carries the
    // additional field per WP-109; the client's structural-typing
    // upgrade is local to this page.
    const view = ref<PublicProfileViewWithExtras | null>(null);
    const errorStatus = ref<number>(0);

    async function load(handle: string): Promise<void> {
      state.value = 'loading';
      view.value = null;
      errorStatus.value = 0;
      const result = await fetchPublicProfile(handle);
      if (result.ok === true) {
        view.value = result.value as PublicProfileViewWithExtras;
        state.value = 'ready';
        return;
      }
      if (result.status === 404) {
        state.value = 'not_found';
        return;
      }
      errorStatus.value = result.status;
      state.value = 'error';
    }

    onMounted(() => {
      void load(props.handle);
    });

    watch(
      () => props.handle,
      (next) => {
        void load(next);
      },
    );

    return {
      state,
      view,
      errorStatus,
      formatCreatedAt,
      formatTeamSizeLabel,
      formatRoleLabel,
    };
  },
});
</script>

<template>
  <article class="player-profile" data-testid="player-profile-root">
    <template v-if="state === 'loading'">
      <p class="profile-status" data-testid="player-profile-loading">Loading…</p>
    </template>
    <template v-else-if="state === 'not_found'">
      <p class="profile-status" data-testid="player-profile-not-found">
        No player has claimed this handle.
      </p>
    </template>
    <template v-else-if="state === 'error'">
      <p class="profile-status" data-testid="player-profile-error">
        Could not load profile. Please try again later.
      </p>
    </template>
    <template v-else-if="state === 'ready' && view !== null">
      <header class="profile-header" data-testid="player-profile-header">
        <h1 class="profile-display-name">{{ view.displayName }}</h1>
        <p class="profile-display-handle">{{ view.displayHandle }}</p>
        <p class="profile-canonical-handle">@{{ view.handleCanonical }}</p>
      </header>

      <section class="profile-replays" data-testid="player-profile-replays">
        <h2>Public replays</h2>
        <template v-if="view.publicReplays.length === 0">
          <p>No public replays yet.</p>
        </template>
        <ul v-else>
          <li
            v-for="replay in view.publicReplays"
            :key="replay.replayHash"
            class="profile-replay"
          >
            <span class="profile-replay-hash">{{ replay.replayHash.slice(0, 8) }}</span>
            <span class="profile-replay-scenario">{{ replay.scenarioKey }}</span>
            <span class="profile-replay-date">{{ formatCreatedAt(replay.createdAt) }}</span>
            <span class="profile-replay-visibility">{{ replay.visibility }}</span>
          </li>
        </ul>
      </section>

      <!-- why: WP-109 §7 / §11 / EC-115 — read-only listing of the
           player's visible team affiliations. Server is authoritative
           on visibility (private / friends-fallback teams hidden by
           composeTeamAffiliationsForProfile) AND ordering (ascending
           by joinedAt with teamId tiebreaker per pre-flight PS-13);
           this template MUST NOT defensively re-sort or re-filter.
           User-facing copy uses neutral cohort framing per EC-115
           Guardrail 8; the forbidden-vocabulary list is enumerated
           in the EC + project memory, not repeated here. -->
      <section
        class="profile-teams"
        data-testid="player-profile-teams"
      >
        <h2>Teams</h2>
        <template v-if="view.teamAffiliations.length === 0">
          <p>No team affiliations to display.</p>
        </template>
        <ul v-else>
          <li
            v-for="affiliation in view.teamAffiliations"
            :key="affiliation.teamId"
            class="profile-team"
          >
            <span class="profile-team-size">{{ formatTeamSizeLabel(affiliation.teamSize) }}</span>
            <span class="profile-team-role">{{ formatRoleLabel(affiliation.role) }}</span>
            <span class="profile-team-joined">since {{ formatCreatedAt(affiliation.joinedAt) }}</span>
            <span
              v-if="affiliation.leftAt !== null"
              class="profile-team-left"
            >until {{ formatCreatedAt(affiliation.leftAt) }}</span>
          </li>
        </ul>
      </section>

      <!-- why: the six empty-state tabs below render static labels only.
           Per WP-102 §Empty-state stubs make zero network requests +
           RISK #15 from copilot-check 2026-04-28, each tab MUST carry a
           rationale comment naming why it makes no fetch. The cumulative
           effect preserves Vision §11 (Stateless Client Philosophy) and
           the WP-102 lifecycle prohibition: no Pinia store touch, no
           fetch/XHR/WebSocket, no Vue lifecycle hook beyond what setup()
           already runs for the profile fetch above. -->
      <section
        class="profile-tab profile-tab-rank"
        data-testid="player-profile-tab-rank"
      >
        <!-- why: rank surfacing depends on WP-054 (competitive scoring
             ingestion) and WP-055 (leaderboard projection). Until those
             land and a follow-up profile-feature WP wires their reads
             into this surface, the tab is inert text. Per
             DESIGN-RANKING.md lines 485-487, ranking inputs key on
             AccountId, never the handle — so this tab MUST NOT fetch by
             handle even after WP-054/055 land; the future enabling WP
             will receive AccountId via a separate authenticated route. -->
        <h3>Rank — coming soon (WP-054 / WP-055)</h3>
      </section>

      <section
        class="profile-tab profile-tab-badges"
        data-testid="player-profile-tab-badges"
      >
        <h3>Badges</h3>
        <ul
          v-if="view && view.badges && view.badges.length > 0"
          class="badge-list"
          data-testid="player-profile-badge-list"
        >
          <li
            v-for="badge in view.badges"
            :key="badge.badgeKey"
            class="badge-item"
            data-testid="player-profile-badge-item"
          >
            <span class="badge-label">{{ badge.label }}</span>
            <span class="badge-description">{{ badge.description }}</span>
            <span class="badge-awarded-at">{{ formatCreatedAt(badge.awardedAt) }}</span>
          </li>
        </ul>
        <p
          v-else
          class="badge-empty"
          data-testid="player-profile-badge-empty"
        >No badges earned yet.</p>
      </section>

      <section
        class="profile-tab profile-tab-tournaments"
        data-testid="player-profile-tab-tournaments"
      >
        <!-- why: tournament participation surfacing depends on a
             tournament-engine WP that does not exist yet. The tab is
             inert text and makes no fetch — there is no upstream
             system to query. -->
        <h3>Tournaments — coming soon</h3>
      </section>

      <section
        class="profile-tab profile-tab-comments"
        data-testid="player-profile-tab-comments"
      >
        <!-- why: comment authoring, moderation, and history are
             separate WPs that have not been drafted. The tab is inert
             text and makes no fetch — there is no comment store to
             read from. -->
        <h3>Comments — coming soon</h3>
      </section>

      <section
        class="profile-tab profile-tab-integrity"
        data-testid="player-profile-tab-integrity"
      >
        <!-- why: integrity / anti-cheat review status surfacing requires
             an admin-auth WP plus WP-107+ integrity surfacing. Until
             those land the tab is inert text; surfacing review status
             without the gating WP would leak admin-only content to a
             public surface. -->
        <h3>Integrity — coming soon (WP-107+)</h3>
      </section>

      <section
        class="profile-tab profile-tab-support"
        data-testid="player-profile-tab-support"
      >
        <!-- why: support / donation / subscription surfacing depends on
             WP-097 (D-9701) + WP-098 §20 Funding Surface Gate Trigger
             + a payment-integration WP (WP-108+). Per WP-102 §Vision
             Alignment Funding Surface Gate declaration, this tab MUST
             render no donation, subscription, or tournament-funding
             affordance until those WPs land — current text is the only
             permitted content. NG-1 (no pay-to-win) and NG-6 (no dark
             patterns) are honored by construction. -->
        <h3>Support — coming soon (WP-108+)</h3>
      </section>
    </template>
  </article>
</template>

<style scoped>
.player-profile {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.5rem;
  max-width: 48rem;
  margin: 0 auto;
}

.profile-status {
  font-size: 1rem;
  text-align: center;
  opacity: 0.75;
}

.profile-header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.profile-display-name {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
}

.profile-display-handle {
  font-size: 1rem;
  margin: 0;
}

.profile-canonical-handle {
  font-size: 0.875rem;
  color: rgba(0, 0, 0, 0.55);
  margin: 0;
}

.profile-replays h2 {
  font-size: 1.125rem;
  margin: 0 0 0.5rem 0;
}

.profile-replays ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.profile-replay {
  display: grid;
  grid-template-columns: 5rem 1fr 7rem 5rem;
  gap: 0.75rem;
  font-size: 0.875rem;
  align-items: baseline;
}

.profile-tab h3 {
  font-size: 1rem;
  font-weight: 500;
  margin: 0;
  color: rgba(0, 0, 0, 0.6);
}

.profile-teams h2 {
  font-size: 1.125rem;
  margin: 0 0 0.5rem 0;
}

.profile-teams ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.profile-team {
  display: grid;
  grid-template-columns: 8rem 6rem 1fr 1fr;
  gap: 0.75rem;
  font-size: 0.875rem;
  align-items: baseline;
}

.profile-team-size {
  font-weight: 500;
}

.profile-team-role,
.profile-team-joined,
.profile-team-left {
  color: rgba(0, 0, 0, 0.65);
}
</style>
