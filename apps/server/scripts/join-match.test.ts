import { describe, it, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';

// @ts-ignore — importing .mjs from .ts; tsx handles this at runtime
import { parseJoinMatchArguments, joinMatch } from './join-match.mjs';

describe('join-match', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('missing --match flag exits 1 with a clear error message', () => {
    assert.throws(
      () => parseJoinMatchArguments(['--name', 'Alice']),
      (error: Error) => {
        assert.ok(
          error.message.includes('--match'),
          'Error message should mention the missing --match flag.'
        );
        assert.ok(
          error.message.length > 20,
          'Error message should be a full sentence, not a terse fragment.'
        );
        return true;
      }
    );
  });

  it('missing --name flag exits 1 with a clear error message', () => {
    // why: parseJoinMatchArguments checks --match -> --player -> --name in
    // order and throws on the first missing arg. To reach the --name check
    // this test must supply both --match AND --player; otherwise the
    // function errors on the missing --player and the --name assertion
    // below never sees a --name-mentioning message.
    assert.throws(
      () => parseJoinMatchArguments(['--match', 'abc123', '--player', '0']),
      (error: Error) => {
        assert.ok(
          error.message.includes('--name'),
          'Error message should mention the missing --name flag.'
        );
        assert.ok(
          error.message.length > 20,
          'Error message should be a full sentence, not a terse fragment.'
        );
        return true;
      }
    );
  });

  it('HTTP 409 response produces a full-sentence stderr message and exits 1', async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response('match is full', { status: 409, statusText: 'Conflict' })
      )) as typeof fetch;

    await assert.rejects(
      () => joinMatch('http://localhost:8000', 'abc123', 'Charlie'),
      (error: Error) => {
        assert.ok(
          error.message.includes('409'),
          'Error message should include the HTTP status code 409.'
        );
        assert.ok(
          error.message.includes('abc123'),
          'Error message should include the match identifier.'
        );
        assert.ok(
          error.message.length > 20,
          'Error message should be a full sentence, not a terse fragment.'
        );
        return true;
      }
    );
  });
});
