/**
 * Hanko Session Verifier — Tests (WP-126)
 *
 * Tests use `node:test` + `node:assert`. Signed fixture tokens are
 * generated at module-load time using a fixture RSA keypair from
 * `node:crypto`. Every fetcher is a fake `(url) => Promise<Response>`
 * injected via `config.fetcher`; the global fetch is never stubbed
 * and the mock-agent surface from the low-level HTTP client library
 * is not consulted.
 *
 * Authority: WP-126 §Test plan; PS-1 (single-parameter Result<T>);
 * PS-2 (fetcher-injection seam); D-12601..D-12604 (executor-time
 * decision locks); D-5201 (factory-time-only throw posture).
 */

import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createSign, generateKeyPairSync } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { createHankoSessionVerifier } from './hankoVerifier.logic.js';
import type {
  HankoVerifierConfig,
  JwksFetcher,
  SessionVerificationErrorCode,
} from './hankoVerifier.types.js';

const FAKE_TENANT_BASE_URL = 'https://test.example/fake-tenant';
const FAKE_JWKS_URL = `${FAKE_TENANT_BASE_URL}/.well-known/jwks.json`;
const EXPECTED_AUDIENCE = 'legendary-arena';
const FAST_REFRESH_MS = 60_000;

interface SigningKey {
  readonly kid: string;
  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
  readonly publicJwk: JsonWebKey;
}

function generateSigningKey(kid: string): SigningKey {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const publicJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
  const publicJwkWithKid: JsonWebKey = {
    ...publicJwk,
    kid,
    use: 'sig',
    alg: 'RS256',
  };
  return {
    kid,
    privateKey,
    publicKey,
    publicJwk: publicJwkWithKid,
  };
}

const PRIMARY_KEY = generateSigningKey('primary-kid');
const ROTATED_KEY = generateSigningKey('rotated-kid');
const UNRELATED_KEY = generateSigningKey('unrelated-kid');

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

interface SignedTokenInput {
  readonly key: SigningKey;
  readonly sub: string;
  readonly amr: readonly string[];
  readonly aud?: string | readonly string[];
  readonly expSeconds?: number;
  readonly algOverride?: string;
}

function signToken(input: SignedTokenInput): string {
  const header = {
    alg: input.algOverride ?? 'RS256',
    typ: 'JWT',
    kid: input.key.kid,
  };
  const payload: Record<string, unknown> = {
    sub: input.sub,
    aud: input.aud ?? [EXPECTED_AUDIENCE],
    exp: input.expSeconds ?? Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    amr: input.amr,
    session_id: 'session-fixture-id',
  };
  const headerSegment = base64UrlEncode(JSON.stringify(header));
  const payloadSegment = base64UrlEncode(JSON.stringify(payload));
  const signedInput = `${headerSegment}.${payloadSegment}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signedInput);
  signer.end();
  const signature = signer.sign(input.key.privateKey);
  const signatureSegment = base64UrlEncode(signature);
  return `${headerSegment}.${payloadSegment}.${signatureSegment}`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeJwksFetcher(keys: readonly SigningKey[]): JwksFetcher {
  return async () =>
    jsonResponse({ keys: keys.map((k) => k.publicJwk) });
}

interface SwitchableJwksFetcher {
  readonly fetcher: JwksFetcher;
  setKeys(keys: readonly SigningKey[]): void;
  setFailing(value: boolean): void;
  callCount(): number;
}

function makeSwitchableJwksFetcher(
  initial: readonly SigningKey[],
): SwitchableJwksFetcher {
  let current: readonly SigningKey[] = initial;
  let failing = false;
  let count = 0;
  const fetcher: JwksFetcher = async () => {
    count += 1;
    if (failing === true) {
      throw new Error('simulated network failure');
    }
    return jsonResponse({ keys: current.map((k) => k.publicJwk) });
  };
  return {
    fetcher,
    setKeys(keys) {
      current = keys;
    },
    setFailing(value) {
      failing = value;
    },
    callCount: () => count,
  };
}

function makeBaseConfig(
  fetcher: JwksFetcher,
  overrides: Partial<HankoVerifierConfig> = {},
): HankoVerifierConfig {
  return {
    tenantBaseUrl: FAKE_TENANT_BASE_URL,
    expectedAudience: EXPECTED_AUDIENCE,
    jwksRefreshIntervalMs: FAST_REFRESH_MS,
    fetcher,
    ...overrides,
  };
}

describe('createHankoSessionVerifier (WP-126)', () => {
  test('happy path: signed token with email amr resolves to authProvider="email"', async () => {
    const verifier = createHankoSessionVerifier(
      makeBaseConfig(makeJwksFetcher([PRIMARY_KEY])),
    );
    const token = signToken({
      key: PRIMARY_KEY,
      sub: 'hanko-user-1',
      amr: ['passkey'],
    });
    const result = await verifier.verify(token);
    assert.equal(result.ok, true);
    if (result.ok === true) {
      assert.equal(result.value.authProvider, 'email');
      assert.equal(result.value.authProviderSub, 'hanko-user-1');
      assert.match(
        result.value.expiresAt,
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    }
  });

  test('email mapping branch: pwd / otp / totp / security_key all resolve to "email"', async () => {
    const verifier = createHankoSessionVerifier(
      makeBaseConfig(makeJwksFetcher([PRIMARY_KEY])),
    );
    for (const amrValue of ['pwd', 'otp', 'totp', 'security_key']) {
      const token = signToken({
        key: PRIMARY_KEY,
        sub: `user-${amrValue}`,
        amr: [amrValue],
      });
      const result = await verifier.verify(token);
      assert.equal(result.ok, true, `amr "${amrValue}" failed`);
      if (result.ok === true) {
        assert.equal(result.value.authProvider, 'email');
      }
    }
  });

  test('google mapping branch: ext:google in amr resolves to authProvider="google"', async () => {
    const verifier = createHankoSessionVerifier(
      makeBaseConfig(makeJwksFetcher([PRIMARY_KEY])),
    );
    const token = signToken({
      key: PRIMARY_KEY,
      sub: 'hanko-google-user',
      amr: ['ext:google'],
    });
    const result = await verifier.verify(token);
    assert.equal(result.ok, true);
    if (result.ok === true) {
      assert.equal(result.value.authProvider, 'google');
      assert.equal(result.value.authProviderSub, 'hanko-google-user');
    }
  });

  test('discord mapping branch: ext:discord in amr resolves to authProvider="discord"', async () => {
    const verifier = createHankoSessionVerifier(
      makeBaseConfig(makeJwksFetcher([PRIMARY_KEY])),
    );
    const token = signToken({
      key: PRIMARY_KEY,
      sub: 'hanko-discord-user',
      amr: ['ext:discord'],
    });
    const result = await verifier.verify(token);
    assert.equal(result.ok, true);
    if (result.ok === true) {
      assert.equal(result.value.authProvider, 'discord');
    }
  });

  test('federated takes precedence over native: ext:google + pwd resolves to "google"', async () => {
    const verifier = createHankoSessionVerifier(
      makeBaseConfig(makeJwksFetcher([PRIMARY_KEY])),
    );
    const token = signToken({
      key: PRIMARY_KEY,
      sub: 'hanko-mixed-user',
      amr: ['pwd', 'ext:google'],
    });
    const result = await verifier.verify(token);
    assert.equal(result.ok, true);
    if (result.ok === true) {
      assert.equal(result.value.authProvider, 'google');
    }
  });

  test('amr absent (empty array) resolves to unknown_provider', async () => {
    const verifier = createHankoSessionVerifier(
      makeBaseConfig(makeJwksFetcher([PRIMARY_KEY])),
    );
    const token = signToken({
      key: PRIMARY_KEY,
      sub: 'no-amr-user',
      amr: [],
    });
    const result = await verifier.verify(token);
    assert.equal(result.ok, false);
    if (result.ok === false) {
      const code = result.code as SessionVerificationErrorCode;
      assert.equal(code, 'unknown_provider');
    }
  });

  test('amr value not in HANKO_IDP_TO_AUTH_PROVIDER resolves to unknown_provider', async () => {
    const verifier = createHankoSessionVerifier(
      makeBaseConfig(makeJwksFetcher([PRIMARY_KEY])),
    );
    const token = signToken({
      key: PRIMARY_KEY,
      sub: 'unknown-amr-user',
      amr: ['ext:apple'],
    });
    const result = await verifier.verify(token);
    assert.equal(result.ok, false);
    if (result.ok === false) {
      const code = result.code as SessionVerificationErrorCode;
      assert.equal(code, 'unknown_provider');
    }
  });

  test('JWT signed with the wrong key resolves to invalid_token', async () => {
    // The JWKS publishes PRIMARY_KEY; the token is signed by
    // UNRELATED_KEY but advertises PRIMARY_KEY's kid.
    const verifier = createHankoSessionVerifier(
      makeBaseConfig(makeJwksFetcher([PRIMARY_KEY])),
    );
    const forgedKey: SigningKey = {
      kid: PRIMARY_KEY.kid,
      privateKey: UNRELATED_KEY.privateKey,
      publicKey: UNRELATED_KEY.publicKey,
      publicJwk: UNRELATED_KEY.publicJwk,
    };
    const token = signToken({
      key: forgedKey,
      sub: 'forger',
      amr: ['passkey'],
    });
    const result = await verifier.verify(token);
    assert.equal(result.ok, false);
    if (result.ok === false) {
      const code = result.code as SessionVerificationErrorCode;
      assert.equal(code, 'invalid_token');
    }
  });

  test('kid not in initial cache, refresh succeeds: key rotation path resolves cleanly', async () => {
    const switchable = makeSwitchableJwksFetcher([PRIMARY_KEY]);
    const verifier = createHankoSessionVerifier(
      makeBaseConfig(switchable.fetcher),
    );
    // Seed the cache via a token using the initial key.
    const initialToken = signToken({
      key: PRIMARY_KEY,
      sub: 'initial-user',
      amr: ['passkey'],
    });
    const initial = await verifier.verify(initialToken);
    assert.equal(initial.ok, true);
    // Rotate the JWKS so the next refresh sees the new key.
    switchable.setKeys([PRIMARY_KEY, ROTATED_KEY]);
    const rotatedToken = signToken({
      key: ROTATED_KEY,
      sub: 'rotated-user',
      amr: ['passkey'],
    });
    const rotated = await verifier.verify(rotatedToken);
    assert.equal(rotated.ok, true);
    if (rotated.ok === true) {
      assert.equal(rotated.value.authProviderSub, 'rotated-user');
    }
  });

  test('kid not in cache + refresh fails: resolves to verification_failed', async () => {
    const switchable = makeSwitchableJwksFetcher([PRIMARY_KEY]);
    const verifier = createHankoSessionVerifier(
      makeBaseConfig(switchable.fetcher),
    );
    // Seed the cache.
    const seedToken = signToken({
      key: PRIMARY_KEY,
      sub: 'seed-user',
      amr: ['passkey'],
    });
    const seed = await verifier.verify(seedToken);
    assert.equal(seed.ok, true);
    // Mark the JWKS endpoint failing; a token with an unknown kid
    // cannot be verified.
    switchable.setFailing(true);
    const unknownKidToken = signToken({
      key: ROTATED_KEY,
      sub: 'unknown-kid-user',
      amr: ['passkey'],
    });
    const result = await verifier.verify(unknownKidToken);
    assert.equal(result.ok, false);
    if (result.ok === false) {
      const code = result.code as SessionVerificationErrorCode;
      assert.equal(code, 'verification_failed');
    }
  });

  test('aud mismatches expectedAudience: resolves to invalid_token', async () => {
    const verifier = createHankoSessionVerifier(
      makeBaseConfig(makeJwksFetcher([PRIMARY_KEY])),
    );
    const token = signToken({
      key: PRIMARY_KEY,
      sub: 'wrong-aud-user',
      amr: ['passkey'],
      aud: ['some-other-audience'],
    });
    const result = await verifier.verify(token);
    assert.equal(result.ok, false);
    if (result.ok === false) {
      const code = result.code as SessionVerificationErrorCode;
      assert.equal(code, 'invalid_token');
    }
  });

  test('exp in the past: resolves to expired_token', async () => {
    const verifier = createHankoSessionVerifier(
      makeBaseConfig(makeJwksFetcher([PRIMARY_KEY])),
    );
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
    const token = signToken({
      key: PRIMARY_KEY,
      sub: 'expired-user',
      amr: ['passkey'],
      expSeconds: tenMinutesAgo,
    });
    const result = await verifier.verify(token);
    assert.equal(result.ok, false);
    if (result.ok === false) {
      const code = result.code as SessionVerificationErrorCode;
      assert.equal(code, 'expired_token');
    }
  });

  test('malformed JWT (cannot decode header): resolves to invalid_token', async () => {
    const verifier = createHankoSessionVerifier(
      makeBaseConfig(makeJwksFetcher([PRIMARY_KEY])),
    );
    const malformed = 'not-a-jwt';
    const result = await verifier.verify(malformed);
    assert.equal(result.ok, false);
    if (result.ok === false) {
      const code = result.code as SessionVerificationErrorCode;
      assert.equal(code, 'invalid_token');
    }
  });

  test('non-RS256 alg header: resolves to invalid_token', async () => {
    const verifier = createHankoSessionVerifier(
      makeBaseConfig(makeJwksFetcher([PRIMARY_KEY])),
    );
    const token = signToken({
      key: PRIMARY_KEY,
      sub: 'wrong-alg-user',
      amr: ['passkey'],
      algOverride: 'HS256',
    });
    const result = await verifier.verify(token);
    assert.equal(result.ok, false);
    if (result.ok === false) {
      const code = result.code as SessionVerificationErrorCode;
      assert.equal(code, 'invalid_token');
    }
  });

  test('config.tenantBaseUrl empty: factory throws at construction time', () => {
    assert.throws(
      () =>
        createHankoSessionVerifier({
          tenantBaseUrl: '',
          expectedAudience: EXPECTED_AUDIENCE,
          fetcher: makeJwksFetcher([PRIMARY_KEY]),
        }),
      /tenantBaseUrl/,
    );
  });

  test('config.expectedAudience empty: factory throws at construction time', () => {
    assert.throws(
      () =>
        createHankoSessionVerifier({
          tenantBaseUrl: FAKE_TENANT_BASE_URL,
          expectedAudience: '',
          fetcher: makeJwksFetcher([PRIMARY_KEY]),
        }),
      /expectedAudience/,
    );
  });

  test('email claim as string is extracted into VerifiedSessionClaim.email', async () => {
    const verifier = createHankoSessionVerifier(
      makeBaseConfig(makeJwksFetcher([PRIMARY_KEY])),
    );
    const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: PRIMARY_KEY.kid }));
    const payload = base64UrlEncode(JSON.stringify({
      sub: 'user-email-string',
      aud: [EXPECTED_AUDIENCE],
      exp: Math.floor(Date.now() / 1000) + 3600,
      amr: ['passkey'],
      email: 'test@example.com',
    }));
    const signedInput = `${header}.${payload}`;
    const signer = createSign('RSA-SHA256');
    signer.update(signedInput);
    signer.end();
    const signature = base64UrlEncode(signer.sign(PRIMARY_KEY.privateKey));
    const token = `${header}.${payload}.${signature}`;

    const result = await verifier.verify(token);
    assert.equal(result.ok, true);
    if (result.ok === true) {
      assert.equal(result.value.email, 'test@example.com');
    }
  });

  test('email claim as object with .address is extracted', async () => {
    const verifier = createHankoSessionVerifier(
      makeBaseConfig(makeJwksFetcher([PRIMARY_KEY])),
    );
    const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: PRIMARY_KEY.kid }));
    const payload = base64UrlEncode(JSON.stringify({
      sub: 'user-email-object',
      aud: [EXPECTED_AUDIENCE],
      exp: Math.floor(Date.now() / 1000) + 3600,
      amr: ['passkey'],
      email: { address: 'obj@example.com', is_primary: true, is_verified: true },
    }));
    const signedInput = `${header}.${payload}`;
    const signer = createSign('RSA-SHA256');
    signer.update(signedInput);
    signer.end();
    const signature = base64UrlEncode(signer.sign(PRIMARY_KEY.privateKey));
    const token = `${header}.${payload}.${signature}`;

    const result = await verifier.verify(token);
    assert.equal(result.ok, true);
    if (result.ok === true) {
      assert.equal(result.value.email, 'obj@example.com');
    }
  });

  test('missing email claim yields undefined email on VerifiedSessionClaim', async () => {
    const verifier = createHankoSessionVerifier(
      makeBaseConfig(makeJwksFetcher([PRIMARY_KEY])),
    );
    const token = signToken({
      key: PRIMARY_KEY,
      sub: 'user-no-email',
      amr: ['passkey'],
    });
    const result = await verifier.verify(token);
    assert.equal(result.ok, true);
    if (result.ok === true) {
      assert.equal(result.value.email, undefined);
    }
  });

  test('name claim is extracted into VerifiedSessionClaim.displayName', async () => {
    const verifier = createHankoSessionVerifier(
      makeBaseConfig(makeJwksFetcher([PRIMARY_KEY])),
    );
    const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: PRIMARY_KEY.kid }));
    const payload = base64UrlEncode(JSON.stringify({
      sub: 'user-with-name',
      aud: [EXPECTED_AUDIENCE],
      exp: Math.floor(Date.now() / 1000) + 3600,
      amr: ['passkey'],
      name: 'Alice Smith',
    }));
    const signedInput = `${header}.${payload}`;
    const signer = createSign('RSA-SHA256');
    signer.update(signedInput);
    signer.end();
    const signature = base64UrlEncode(signer.sign(PRIMARY_KEY.privateKey));
    const token = `${header}.${payload}.${signature}`;

    const result = await verifier.verify(token);
    assert.equal(result.ok, true);
    if (result.ok === true) {
      assert.equal(result.value.displayName, 'Alice Smith');
    }
  });

  test('missing name claim yields undefined displayName on VerifiedSessionClaim', async () => {
    const verifier = createHankoSessionVerifier(
      makeBaseConfig(makeJwksFetcher([PRIMARY_KEY])),
    );
    const token = signToken({
      key: PRIMARY_KEY,
      sub: 'user-no-name',
      amr: ['passkey'],
    });
    const result = await verifier.verify(token);
    assert.equal(result.ok, true);
    if (result.ok === true) {
      assert.equal(result.value.displayName, undefined);
    }
  });

  test('two factory calls produce two independent verifiers with independent JWKS caches', async () => {
    const fetcherA = makeJwksFetcher([PRIMARY_KEY]);
    const fetcherB = makeJwksFetcher([ROTATED_KEY]);
    const verifierA = createHankoSessionVerifier(makeBaseConfig(fetcherA));
    const verifierB = createHankoSessionVerifier(makeBaseConfig(fetcherB));
    const tokenForA = signToken({
      key: PRIMARY_KEY,
      sub: 'user-a',
      amr: ['passkey'],
    });
    const tokenForB = signToken({
      key: ROTATED_KEY,
      sub: 'user-b',
      amr: ['passkey'],
    });
    const resultA = await verifierA.verify(tokenForA);
    const resultB = await verifierB.verify(tokenForB);
    assert.equal(resultA.ok, true);
    assert.equal(resultB.ok, true);
    // Cross-verifier verification must fail (kid not in the other
    // cache + the swapped JWKS still does not carry it).
    const aFailsOnB = await verifierA.verify(tokenForB);
    const bFailsOnA = await verifierB.verify(tokenForA);
    assert.equal(aFailsOnB.ok, false);
    assert.equal(bFailsOnA.ok, false);
  });
});
