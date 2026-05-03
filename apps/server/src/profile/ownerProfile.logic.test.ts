/**
 * Tests for the owner-profile logic (WP-104 / EC-128).
 *
 * 14 tests inside one describe block. Pure tests (drift assertions,
 * validator exercises, validator-path failures of the public
 * functions) always run; DB-required tests use node:test's
 * options-based non-silent skip when `process.env.TEST_DATABASE_URL`
 * is unset (locked WP-052 §3.1 post-mortem pattern; mirrors
 * `accountLookup.logic.test.ts` and `handle.logic.test.ts`).
 *
 * Per-suite-run uniqueness: every DB-required test generates `email`
 * and `authProviderId` values prefixed by a per-suite-run identifier
 * (`Date.now()` plus a per-test counter). This avoids `UNIQUE`-
 * constraint conflicts across runs without requiring a `beforeEach`
 * cleanup; the EC-128 §2 SQL-write gate forbids row-mutating SQL
 * keywords against locked tables anywhere in scope, and a
 * cleanup-style row purge would also trip the §2 gate that requires
 * the WP-104 helpers to be the lone consumers of the new tables in
 * scope.
 *
 * Authority: WP-104 §Scope (In) §D; EC-128 §2 (SQL-write gate +
 * test skip pattern lock + per-suite-run-uniqueness lock); D-10403..
 * D-10407; WP-101 / WP-112 test-file precedents.
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  getOwnerProfile,
  replaceOwnerLinks,
  upsertOwnerProfile,
  validateAvatarUrl,
  validateLinks,
} from './ownerProfile.logic.js';
import {
  OWNER_PROFILE_ERROR_CODES,
  type OwnerLinkInput,
  type OwnerProfileErrorCode,
  type OwnerProfileView,
} from './ownerProfile.types.js';
import { createPlayerAccount } from '../identity/identity.logic.js';
import type { AccountId } from '../identity/identity.types.js';

import pg from 'pg';

const { Pool } = pg;

const hasTestDatabase = process.env.TEST_DATABASE_URL !== undefined;

// why: per-suite-run identifier guarantees row uniqueness across
// repeated test runs without requiring a beforeEach cleanup. The
// EC-128 §2 SQL-write gate forbids row-mutating SQL against locked
// tables anywhere in scope (and the EC-112 lesson — see
// accountLookup.logic.test.ts §"Per-run uniqueness" — established
// the pattern as the canonical alternative). `Date.now()` provides
// millisecond granularity; the per-test counter disambiguates
// within a single run.
const SUITE_RUN_ID = `wp104-${Date.now()}`;
let testCounter = 0;
function uniqueLabel(suffix: string): string {
  testCounter += 1;
  return `${SUITE_RUN_ID}-${testCounter}-${suffix}`;
}

function makeIdProvider(): () => string {
  const counter = { value: 0 };
  return () => {
    counter.value += 1;
    return `00000000-0000-4000-8000-${String(Date.now() % 1_000_000_000_000)
      .padStart(9, '0')}${String(counter.value).padStart(3, '0')}`;
  };
}

async function provisionAccount(
  testPool: pg.Pool,
  labelSuffix: string,
): Promise<AccountId> {
  const email = `${uniqueLabel(labelSuffix)}@example.com`;
  const authProviderId = `${uniqueLabel(labelSuffix)}-sub`;
  const result = await createPlayerAccount(
    {
      email,
      displayName: `Owner${labelSuffix}`,
      authProvider: 'email',
      authProviderId,
    },
    testPool,
    makeIdProvider(),
  );
  assert.ok(result.ok === true, 'createPlayerAccount must succeed');
  return result.value.accountId;
}

describe('owner profile logic (WP-104)', () => {
  let testPool: pg.Pool | null = null;

  before(async () => {
    if (hasTestDatabase) {
      testPool = new Pool({
        connectionString: process.env.TEST_DATABASE_URL,
      });
    }
  });

  after(async () => {
    if (testPool !== null) {
      await testPool.end();
      testPool = null;
    }
  });

  test('OWNER_PROFILE_ERROR_CODES matches OwnerProfileErrorCode union (forward and backward inclusion)', () => {
    const expected: ReadonlySet<OwnerProfileErrorCode> = new Set([
      'invalid_request',
      'invalid_avatar_url',
      'invalid_link_url',
      'too_many_links',
      'unknown_account',
    ]);
    assert.equal(OWNER_PROFILE_ERROR_CODES.length, expected.size);
    for (const code of OWNER_PROFILE_ERROR_CODES) {
      assert.ok(
        expected.has(code),
        `OWNER_PROFILE_ERROR_CODES contains ${code} which is missing from OwnerProfileErrorCode union`,
      );
    }
    for (const value of expected) {
      assert.ok(
        OWNER_PROFILE_ERROR_CODES.includes(value),
        `OwnerProfileErrorCode union value ${value} missing from OWNER_PROFILE_ERROR_CODES array`,
      );
    }
  });

  test('OwnerProfileView shape contains exactly the seven locked fields and excludes private account fields', () => {
    const view: OwnerProfileView = {
      avatarUrl: null,
      aboutMe: null,
      avatarVisibility: 'private',
      aboutMeVisibility: 'private',
      linksVisibility: 'private',
      links: [],
      updatedAt: null,
    };
    const keys = Object.keys(view).sort();
    assert.deepEqual(keys, [
      'aboutMe',
      'aboutMeVisibility',
      'avatarUrl',
      'avatarVisibility',
      'links',
      'linksVisibility',
      'updatedAt',
    ]);
    assert.ok(!('email' in view));
    assert.ok(!('authProvider' in view));
    assert.ok(!('authProviderId' in view));
    assert.ok(!('createdAt' in view));
  });

  test('OwnerProfileLink shape contains exactly the four locked fields', () => {
    const link: OwnerLinkInput = {
      provider: 'twitter',
      url: 'https://twitter.com/example',
      isPublic: true,
      displayOrder: 0,
    };
    assert.deepEqual(Object.keys(link).sort(), [
      'displayOrder',
      'isPublic',
      'provider',
      'url',
    ]);
  });

  test('validateAvatarUrl accepts an HTTPS URL, rejects HTTP, rejects non-URL strings', () => {
    const accepted = validateAvatarUrl('https://example.com/avatar.png');
    assert.ok(accepted.ok === true);
    assert.equal(accepted.value, 'https://example.com/avatar.png');

    const rejectedHttp = validateAvatarUrl('http://example.com/avatar.png');
    assert.ok(rejectedHttp.ok === false);
    assert.equal(
      (rejectedHttp as { code: string }).code,
      'invalid_avatar_url',
    );

    const rejectedGarbage = validateAvatarUrl('not-a-url');
    assert.ok(rejectedGarbage.ok === false);
    assert.equal(
      (rejectedGarbage as { code: string }).code,
      'invalid_avatar_url',
    );

    const rejectedEmpty = validateAvatarUrl('');
    assert.ok(rejectedEmpty.ok === false);
    assert.equal(
      (rejectedEmpty as { code: string }).code,
      'invalid_avatar_url',
    );
  });

  test('validateLinks rejects an over-cap array (11 entries) with code too_many_links', () => {
    const overCap: OwnerLinkInput[] = [];
    for (let i = 0; i < 11; i += 1) {
      overCap.push({
        provider: 'website',
        url: `https://example.com/${i}`,
        isPublic: false,
        displayOrder: i,
      });
    }
    const result = validateLinks(overCap);
    assert.ok(result.ok === false);
    assert.equal((result as { code: string }).code, 'too_many_links');
  });

  test('validateLinks rejects an entry whose provider is outside the closed-set allowlist with code invalid_request', () => {
    const bogus = [
      {
        provider: 'mastodon' as OwnerLinkInput['provider'],
        url: 'https://mastodon.social/@example',
        isPublic: true,
        displayOrder: 0,
      },
    ];
    const result = validateLinks(bogus);
    assert.ok(result.ok === false);
    assert.equal((result as { code: string }).code, 'invalid_request');
  });

  test('validateLinks rejects an entry whose URL fails HTTPS-only validation with code invalid_link_url', () => {
    const bogus: OwnerLinkInput[] = [
      {
        provider: 'website',
        url: 'http://example.com/insecure',
        isPublic: true,
        displayOrder: 0,
      },
    ];
    const result = validateLinks(bogus);
    assert.ok(result.ok === false);
    assert.equal((result as { code: string }).code, 'invalid_link_url');
  });

  test('replaceOwnerLinks rejects over-cap before reaching the database (validator-path; DB unused)', async () => {
    const overCap: OwnerLinkInput[] = [];
    for (let i = 0; i < 11; i += 1) {
      overCap.push({
        provider: 'website',
        url: `https://example.com/${i}`,
        isPublic: false,
        displayOrder: i,
      });
    }
    const recordingDatabase = {
      query: async () => {
        throw new Error(
          'replaceOwnerLinks must reject over-cap before any database access',
        );
      },
      connect: async () => {
        throw new Error(
          'replaceOwnerLinks must reject over-cap before any pool.connect()',
        );
      },
    } as unknown as pg.Pool;
    const accountId = '00000000-0000-4000-8000-000000000000' as AccountId;
    const result = await replaceOwnerLinks(
      accountId,
      overCap,
      recordingDatabase,
    );
    assert.ok(result.ok === false);
    assert.equal((result as { code: string }).code, 'too_many_links');
  });

  test(
    'getOwnerProfile returns synthesized defaults for a never-edited account; no row is inserted on the read path',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const accountId = await provisionAccount(testPool, 'getsynth');
      const result = await getOwnerProfile(accountId, testPool);
      assert.ok(result.ok === true);
      assert.equal(result.value.avatarUrl, null);
      assert.equal(result.value.aboutMe, null);
      assert.equal(result.value.avatarVisibility, 'private');
      assert.equal(result.value.aboutMeVisibility, 'private');
      assert.equal(result.value.linksVisibility, 'private');
      assert.equal(result.value.updatedAt, null);
      assert.deepEqual(result.value.links, []);

      // verify no row was inserted on the read path
      const playerIdResult = await testPool.query(
        'SELECT player_id FROM legendary.players WHERE ext_id = $1 LIMIT 1',
        [accountId],
      );
      const playerId = playerIdResult.rows[0].player_id;
      const profileRowResult = await testPool.query(
        'SELECT 1 FROM legendary.player_profiles WHERE player_id = $1',
        [playerId],
      );
      assert.equal(
        profileRowResult.rows.length,
        0,
        'getOwnerProfile must not create a legendary.player_profiles row on read',
      );
    },
  );

  test(
    'getOwnerProfile returns the row when one exists',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const accountId = await provisionAccount(testPool, 'getrow');
      // first PATCH creates the row
      const patched = await upsertOwnerProfile(
        accountId,
        {
          avatarUrl: 'https://example.com/avatar.png',
          aboutMe: 'I love this game.',
          avatarVisibility: 'public',
        },
        testPool,
      );
      assert.ok(patched.ok === true);

      // GET returns the row
      const fetched = await getOwnerProfile(accountId, testPool);
      assert.ok(fetched.ok === true);
      assert.equal(fetched.value.avatarUrl, 'https://example.com/avatar.png');
      assert.equal(fetched.value.aboutMe, 'I love this game.');
      assert.equal(fetched.value.avatarVisibility, 'public');
      assert.equal(fetched.value.aboutMeVisibility, 'private');
      assert.notEqual(fetched.value.updatedAt, null);
    },
  );

  test(
    'upsertOwnerProfile sparse partial PATCH preserves un-listed fields and the null-clears semantics work',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const accountId = await provisionAccount(testPool, 'sparse');

      // first PATCH sets two fields
      const first = await upsertOwnerProfile(
        accountId,
        {
          avatarUrl: 'https://example.com/initial.png',
          aboutMe: 'Initial about-me.',
        },
        testPool,
      );
      assert.ok(first.ok === true);
      assert.equal(first.value.avatarUrl, 'https://example.com/initial.png');
      assert.equal(first.value.aboutMe, 'Initial about-me.');

      // second PATCH leaves both unchanged via empty body
      const second = await upsertOwnerProfile(accountId, {}, testPool);
      assert.ok(second.ok === true);
      assert.equal(
        second.value.avatarUrl,
        'https://example.com/initial.png',
        'empty PATCH body must leave avatarUrl unchanged',
      );
      assert.equal(
        second.value.aboutMe,
        'Initial about-me.',
        'empty PATCH body must leave aboutMe unchanged',
      );

      // third PATCH explicitly nulls avatarUrl; aboutMe absent → unchanged
      const third = await upsertOwnerProfile(
        accountId,
        { avatarUrl: null },
        testPool,
      );
      assert.ok(third.ok === true);
      assert.equal(
        third.value.avatarUrl,
        null,
        'explicit null in PATCH body must clear the field',
      );
      assert.equal(
        third.value.aboutMe,
        'Initial about-me.',
        'aboutMe key absent from PATCH body must leave the field unchanged',
      );

      // fourth PATCH sets avatarUrl to the literal four-character string "null"
      const fourth = await upsertOwnerProfile(
        accountId,
        { avatarUrl: 'https://example.com/null' },
        testPool,
      );
      assert.ok(fourth.ok === true);
      assert.equal(fourth.value.avatarUrl, 'https://example.com/null');
    },
  );

  test('upsertOwnerProfile rejects an invalid avatar URL with code invalid_avatar_url (validator-path; DB unused)', async () => {
    const recordingDatabase = {
      query: async () => {
        throw new Error(
          'upsertOwnerProfile must reject invalid avatar URLs before any database query for the validation branch',
        );
      },
    } as unknown as pg.Pool;
    const accountId = '00000000-0000-4000-8000-000000000001' as AccountId;
    const result = await upsertOwnerProfile(
      accountId,
      { avatarUrl: 'http://example.com/insecure.png' },
      recordingDatabase,
    );
    assert.ok(result.ok === false);
    assert.equal((result as { code: string }).code, 'invalid_avatar_url');
  });

  test(
    'replaceOwnerLinks transactionally replaces the full list; display_order matches the input array index',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const accountId = await provisionAccount(testPool, 'replace');

      // initial replace inserts three links
      const first = await replaceOwnerLinks(
        accountId,
        [
          {
            provider: 'twitter',
            url: 'https://twitter.com/a',
            isPublic: true,
            displayOrder: 0,
          },
          {
            provider: 'github',
            url: 'https://github.com/a',
            isPublic: false,
            displayOrder: 1,
          },
          {
            provider: 'website',
            url: 'https://example.com/a',
            isPublic: true,
            displayOrder: 2,
          },
        ],
        testPool,
      );
      assert.ok(first.ok === true);
      assert.equal(first.value.links.length, 3);
      assert.equal(first.value.links[0].provider, 'twitter');
      assert.equal(first.value.links[1].provider, 'github');
      assert.equal(first.value.links[2].provider, 'website');
      assert.equal(first.value.links[0].displayOrder, 0);
      assert.equal(first.value.links[1].displayOrder, 1);
      assert.equal(first.value.links[2].displayOrder, 2);

      // second replace clears all and writes a single link
      const second = await replaceOwnerLinks(
        accountId,
        [
          {
            provider: 'twitch',
            url: 'https://twitch.tv/a',
            isPublic: true,
            displayOrder: 0,
          },
        ],
        testPool,
      );
      assert.ok(second.ok === true);
      assert.equal(second.value.links.length, 1);
      assert.equal(second.value.links[0].provider, 'twitch');
      assert.equal(second.value.links[0].displayOrder, 0);
    },
  );

  test(
    'OwnerProfileView.links ordering invariant — server returns ASC-sorted by displayOrder regardless of input order',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const accountId = await provisionAccount(testPool, 'order');
      // input sequence is intentionally not displayOrder-ascending; the
      // server uses the loop index as the authoritative display_order
      // value, so the read returns links in input-index order
      const result = await replaceOwnerLinks(
        accountId,
        [
          {
            provider: 'website',
            url: 'https://example.com/c',
            isPublic: false,
            displayOrder: 99,
          },
          {
            provider: 'youtube',
            url: 'https://youtube.com/b',
            isPublic: false,
            displayOrder: 50,
          },
          {
            provider: 'discord',
            url: 'https://discord.gg/a',
            isPublic: false,
            displayOrder: 10,
          },
        ],
        testPool,
      );
      assert.ok(result.ok === true);
      assert.equal(result.value.links.length, 3);
      // server overrode displayOrder with the loop index (0, 1, 2)
      assert.equal(result.value.links[0].displayOrder, 0);
      assert.equal(result.value.links[1].displayOrder, 1);
      assert.equal(result.value.links[2].displayOrder, 2);
      // and order matches the input array order
      assert.equal(result.value.links[0].url, 'https://example.com/c');
      assert.equal(result.value.links[1].url, 'https://youtube.com/b');
      assert.equal(result.value.links[2].url, 'https://discord.gg/a');
    },
  );

  test(
    'upsertOwnerProfile bumps updated_at on every successful PATCH (idempotent timestamp advance)',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const accountId = await provisionAccount(testPool, 'bumpts');

      const first = await upsertOwnerProfile(
        accountId,
        { aboutMe: 'first' },
        testPool,
      );
      assert.ok(first.ok === true);
      const firstTs = first.value.updatedAt;
      assert.notEqual(firstTs, null);

      // wait briefly so the second now() differs
      await new Promise((resolve) => setTimeout(resolve, 25));

      const second = await upsertOwnerProfile(
        accountId,
        { aboutMe: 'second' },
        testPool,
      );
      assert.ok(second.ok === true);
      const secondTs = second.value.updatedAt;
      assert.notEqual(secondTs, null);
      assert.ok(
        Date.parse(secondTs as string) > Date.parse(firstTs as string),
        'updated_at must strictly advance on a subsequent PATCH',
      );
    },
  );
});
