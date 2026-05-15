<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue';

import {
  fetchOwnerProfile,
  replaceOwnerLinks,
  updateOwnerProfile,
  type OwnerProfileLink,
  type OwnerProfileView,
} from '../lib/api/ownerProfileApi';
import BillingSection from '../components/BillingSection.vue';

// why: defineComponent({ setup() { return {...} } }) is required (NOT
// <script setup>) because the template references non-prop bindings
// — the `state`, `view`, `errorBanner`, etc. values — that under the
// @legendary-arena/vue-sfc-loader separate-compile pipeline only reach
// `_ctx` when explicitly returned from setup() (D-6512 / P6-30;
// precedent matches App.vue, ArenaHud, ReplayFileLoader, and
// PlayerProfilePage).

type LoadState = 'loading' | 'ready' | 'error';

// why: WP-109 / D-10904 (PS-3 = YES) — local TeamAffiliation
// declaration mirroring the server's wire shape. ownerProfileApi.ts
// is locked under WP-104 contract (byte-identical post-WP-109 per
// Hard Stop list); the server JSON body carries the additional
// `teamAffiliations` field on OwnerProfileView regardless. The
// local interface mirrors the server's shape per the engine/server
// isolation rule (WP-104 §Scope (In) §G); a future WP can lift the
// declaration into ownerProfileApi.ts.
interface TeamAffiliationDisplay {
  readonly teamId: string;
  readonly teamSize: 3 | 4 | 5;
  readonly role: 'member' | 'substitute';
  readonly joinedAt: string;
  readonly leftAt: string | null;
}

interface OwnerProfileViewWithTeams extends OwnerProfileView {
  readonly teamAffiliations: readonly TeamAffiliationDisplay[];
}

const ALLOWED_PROVIDERS: readonly OwnerProfileLink['provider'][] = [
  'twitter',
  'github',
  'twitch',
  'discord',
  'youtube',
  'website',
] as const;

interface DraftLink {
  provider: OwnerProfileLink['provider'];
  url: string;
  isPublic: boolean;
}

// why: per WP-109 §6, Legendary supports three meaningful cooperative
// formats; the human-facing label uses the "N-handed cohort" framing
// rather than "N-player team" to avoid the competitive overtone of
// "team" in casual reading. User-facing copy stays neutral per
// EC-115 Guardrail 8; the forbidden-vocabulary list is enumerated
// in the EC + project memory, not repeated here.
function formatTeamSizeLabel(size: 3 | 4 | 5): string {
  return `${size}-handed cohort`;
}

function formatRoleLabel(role: 'member' | 'substitute'): string {
  return role === 'member' ? 'member' : 'substitute';
}

function formatJoinedDate(raw: string): string {
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

function bannerCopyForCode(code: string | null): string {
  // why: locked verbatim banner copy per WP-104 §Scope (In) §H.
  if (code === 'session_verifier_not_configured') {
    return 'Authentication is not yet configured on this server. Owner profile editing is temporarily unavailable.';
  }
  if (code === 'lookup_failed') {
    return 'Server error — owner profile editing is temporarily unavailable. Try again in a moment.';
  }
  if (code === 'missing_token' || code === 'invalid_token' || code === 'expired_token') {
    return 'You are not signed in. Sign in to edit your profile.';
  }
  if (code === 'unknown_account') {
    return 'Your account could not be located. Sign out and back in to refresh your session.';
  }
  return 'Could not load profile. Please try again later.';
}

export default defineComponent({
  name: 'MyProfilePage',
  components: { BillingSection },
  setup() {
    const state = ref<LoadState>('loading');
    // why: cast to the locally-extended view type so the template can
    // reach `view.teamAffiliations` without modifying the locked
    // ownerProfileApi.ts contract. The server's wire shape carries
    // the additional field per WP-109 / D-10904; the client's
    // structural-typing upgrade is local to this page.
    const view = ref<OwnerProfileViewWithTeams | null>(null);
    const errorBanner = ref<string>('');

    const formAvatarUrl = ref<string>('');
    const formAboutMe = ref<string>('');
    const formAvatarVisibility = ref<'private' | 'public'>('private');
    const formAboutMeVisibility = ref<'private' | 'public'>('private');
    const formLinksVisibility = ref<'private' | 'public'>('private');
    const draftLinks = ref<DraftLink[]>([]);

    function readAuthToken(): string | null {
      // why: the auth-store integration is paired with WP-126's broker
      // integration; until then the page reads any token a developer
      // pasted into localStorage manually. The server-side fail-closed
      // posture (D-11204) means a missing or stale token surfaces as
      // a 500 with `code: 'session_verifier_not_configured'`, which
      // the banner copy above translates into user-friendly text.
      if (typeof window === 'undefined') {
        return null;
      }
      return window.localStorage.getItem('authToken');
    }

    function applyView(loaded: OwnerProfileView): void {
      view.value = loaded as OwnerProfileViewWithTeams;
      formAvatarUrl.value = loaded.avatarUrl ?? '';
      formAboutMe.value = loaded.aboutMe ?? '';
      formAvatarVisibility.value = loaded.avatarVisibility;
      formAboutMeVisibility.value = loaded.aboutMeVisibility;
      formLinksVisibility.value = loaded.linksVisibility;
      draftLinks.value = loaded.links.map((link) => ({
        provider: link.provider,
        url: link.url,
        isPublic: link.isPublic,
      }));
      errorBanner.value = '';
      state.value = 'ready';
    }

    async function load(): Promise<void> {
      state.value = 'loading';
      errorBanner.value = '';
      const result = await fetchOwnerProfile(readAuthToken());
      if (result.ok === true) {
        applyView(result.value);
        return;
      }
      errorBanner.value = bannerCopyForCode(result.code);
      state.value = 'error';
    }

    async function saveProfile(): Promise<void> {
      const result = await updateOwnerProfile(readAuthToken(), {
        avatarUrl: formAvatarUrl.value === '' ? null : formAvatarUrl.value,
        aboutMe: formAboutMe.value === '' ? null : formAboutMe.value,
        avatarVisibility: formAvatarVisibility.value,
        aboutMeVisibility: formAboutMeVisibility.value,
        linksVisibility: formLinksVisibility.value,
      });
      if (result.ok === true) {
        applyView(result.value);
        return;
      }
      errorBanner.value = bannerCopyForCode(result.code);
    }

    async function saveLinks(): Promise<void> {
      const links: OwnerProfileLink[] = draftLinks.value.map(
        (draft, index) => ({
          provider: draft.provider,
          url: draft.url,
          isPublic: draft.isPublic,
          displayOrder: index,
        }),
      );
      const result = await replaceOwnerLinks(readAuthToken(), links);
      if (result.ok === true) {
        applyView(result.value);
        return;
      }
      errorBanner.value = bannerCopyForCode(result.code);
    }

    function addDraftLink(): void {
      draftLinks.value.push({
        provider: 'website',
        url: '',
        isPublic: false,
      });
    }

    function removeDraftLink(index: number): void {
      draftLinks.value.splice(index, 1);
    }

    onMounted(() => {
      void load();
    });

    return {
      state,
      view,
      errorBanner,
      formAvatarUrl,
      formAboutMe,
      formAvatarVisibility,
      formAboutMeVisibility,
      formLinksVisibility,
      draftLinks,
      providerOptions: ALLOWED_PROVIDERS,
      saveProfile,
      saveLinks,
      addDraftLink,
      removeDraftLink,
      formatTeamSizeLabel,
      formatRoleLabel,
      formatJoinedDate,
      readAuthToken,
    };
  },
});
</script>

<template>
  <article class="my-profile" data-testid="my-profile-root">
    <template v-if="state === 'loading'">
      <p class="profile-status" data-testid="my-profile-loading">Loading your profile…</p>
    </template>

    <template v-else>
      <p
        v-if="errorBanner !== ''"
        class="profile-banner"
        data-testid="my-profile-banner"
      >
        {{ errorBanner }}
      </p>

      <header class="profile-header" data-testid="my-profile-header">
        <h1>Your profile</h1>
        <p class="profile-help">
          Edit your owner-only profile details below. Privacy toggles default to
          <em>private</em>; flip to <em>public</em> only when you want a section
          visible on your public profile page.
        </p>
      </header>

      <section class="profile-form" data-testid="my-profile-form">
        <h2>Profile</h2>

        <label class="profile-field">
          <span class="profile-field-label">Avatar URL (HTTPS)</span>
          <input
            v-model="formAvatarUrl"
            type="url"
            placeholder="https://example.com/avatar.png"
            data-testid="my-profile-avatar-url"
          />
        </label>

        <label class="profile-field">
          <span class="profile-field-label">Avatar visibility</span>
          <select v-model="formAvatarVisibility" data-testid="my-profile-avatar-visibility">
            <option value="private">private</option>
            <option value="public">public</option>
          </select>
        </label>

        <label class="profile-field">
          <span class="profile-field-label">About me</span>
          <textarea
            v-model="formAboutMe"
            rows="4"
            maxlength="500"
            placeholder="A short bio (max 500 characters)"
            data-testid="my-profile-about-me"
          ></textarea>
        </label>

        <label class="profile-field">
          <span class="profile-field-label">About-me visibility</span>
          <select v-model="formAboutMeVisibility" data-testid="my-profile-about-me-visibility">
            <option value="private">private</option>
            <option value="public">public</option>
          </select>
        </label>

        <label class="profile-field">
          <span class="profile-field-label">Links visibility</span>
          <select v-model="formLinksVisibility" data-testid="my-profile-links-visibility">
            <option value="private">private</option>
            <option value="public">public</option>
          </select>
        </label>

        <button
          type="button"
          class="profile-save"
          data-testid="my-profile-save-profile"
          @click="saveProfile"
        >
          Save profile
        </button>
      </section>

      <section class="profile-links" data-testid="my-profile-links">
        <h2>Links</h2>
        <p class="profile-help">
          Up to 10 links. Drag to reorder is not yet supported — use the order
          shown to control display order.
        </p>

        <ul class="profile-links-list">
          <li
            v-for="(link, index) in draftLinks"
            :key="index"
            class="profile-link-row"
            :data-testid="`my-profile-link-row-${index}`"
          >
            <select
              v-model="link.provider"
              :data-testid="`my-profile-link-provider-${index}`"
            >
              <option v-for="provider in providerOptions" :key="provider" :value="provider">
                {{ provider }}
              </option>
            </select>
            <input
              v-model="link.url"
              type="url"
              placeholder="https://…"
              :data-testid="`my-profile-link-url-${index}`"
            />
            <label class="profile-link-public">
              <input
                v-model="link.isPublic"
                type="checkbox"
                :data-testid="`my-profile-link-public-${index}`"
              />
              Public
            </label>
            <button
              type="button"
              :data-testid="`my-profile-link-remove-${index}`"
              @click="removeDraftLink(index)"
            >
              Remove
            </button>
          </li>
        </ul>

        <button
          type="button"
          class="profile-add-link"
          data-testid="my-profile-add-link"
          @click="addDraftLink"
        >
          Add link
        </button>
        <button
          type="button"
          class="profile-save"
          data-testid="my-profile-save-links"
          @click="saveLinks"
        >
          Save links
        </button>
      </section>

      <!-- why: WP-109 / D-10904 (PS-3 = YES) — read-only "your teams"
           block. Owner viewer scope means 'private'-visibility teams
           are visible to the owner themselves (the composer is called
           server-side with viewerPlayerId === subjectPlayerId). No
           edit affordance, no captain-promote button, no team-creation
           CTA — those mutation flows go through /api/teams/* and never
           through MyProfilePage.vue or /api/me endpoints. A future WP
           may add captain-side affordances on a sibling page; this
           block is observational only. No competitive copy per EC-115
           Guardrail 8. -->
      <section
        v-if="view !== null"
        class="profile-teams"
        data-testid="my-profile-teams"
      >
        <h2>Your teams</h2>
        <template v-if="view.teamAffiliations.length === 0">
          <p class="profile-help">
            You're not currently affiliated with any teams. Teams are formed by
            invitation; ask a captain to invite you.
          </p>
        </template>
        <ul v-else class="profile-teams-list">
          <li
            v-for="affiliation in view.teamAffiliations"
            :key="affiliation.teamId"
            class="profile-team-row"
            :data-testid="`my-profile-team-row-${affiliation.teamId}`"
          >
            <span class="profile-team-size">{{ formatTeamSizeLabel(affiliation.teamSize) }}</span>
            <span class="profile-team-role">{{ formatRoleLabel(affiliation.role) }}</span>
            <span class="profile-team-joined">since {{ formatJoinedDate(affiliation.joinedAt) }}</span>
            <span
              v-if="affiliation.leftAt !== null"
              class="profile-team-left"
            >until {{ formatJoinedDate(affiliation.leftAt) }}</span>
          </li>
        </ul>
      </section>

      <section class="profile-billing">
        <BillingSection :auth-token="readAuthToken()" />
      </section>
    </template>
  </article>
</template>

<style scoped>
.my-profile {
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

.profile-banner {
  padding: 0.75rem 1rem;
  background: #fff4e6;
  border: 1px solid #f4a261;
  border-radius: 0.25rem;
  font-size: 0.9rem;
}

.profile-header h1 {
  font-size: 1.5rem;
  margin: 0 0 0.25rem 0;
}

.profile-help {
  font-size: 0.875rem;
  opacity: 0.75;
  margin: 0.25rem 0 0 0;
}

.profile-form,
.profile-links {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.profile-form h2,
.profile-links h2 {
  font-size: 1.125rem;
  margin: 0 0 0.5rem 0;
}

.profile-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.profile-field-label {
  font-size: 0.875rem;
  font-weight: 500;
}

.profile-save,
.profile-add-link {
  align-self: flex-start;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  cursor: pointer;
}

.profile-links-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.profile-link-row {
  display: grid;
  grid-template-columns: 7rem 1fr 5rem 5rem;
  gap: 0.5rem;
  align-items: center;
}

.profile-link-public {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.875rem;
}

.profile-teams-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.profile-team-row {
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
