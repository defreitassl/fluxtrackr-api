import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readDashboardFixtureEnvironment } from './dashboard-dev-fixture-environment';

const validEnvironment = {
  ALLOW_DEV_FIXTURES: 'true',
  DEV_FIXTURE_POPULATED_EMAIL: 'dashboard@fixture.test',
  DEV_FIXTURE_EMPTY_EMAIL: 'empty@fixture.test',
  DEV_FIXTURE_PASSWORD: 'local-only-password',
  DEV_FIXTURE_USER_NAME_PREFIX: 'FluxTrackr Dev',
};

describe('readDashboardFixtureEnvironment', () => {
  it('blocks production and execution without explicit opt-in', () => {
    assert.throws(
      () => readDashboardFixtureEnvironment({ ...validEnvironment, NODE_ENV: 'production' }),
      /cannot run in production/,
    );
    assert.throws(
      () => readDashboardFixtureEnvironment({ ...validEnvironment, ALLOW_DEV_FIXTURES: 'false' }),
      /ALLOW_DEV_FIXTURES=true/,
    );
  });

  it('rejects fixture identities that could overlap with each other or bootstrap', () => {
    assert.throws(
      () => readDashboardFixtureEnvironment({ ...validEnvironment, DEV_FIXTURE_EMPTY_EMAIL: validEnvironment.DEV_FIXTURE_POPULATED_EMAIL }),
      /must be different/,
    );
    assert.throws(
      () => readDashboardFixtureEnvironment({ ...validEnvironment, BOOTSTRAP_USER_EMAIL: validEnvironment.DEV_FIXTURE_EMPTY_EMAIL }),
      /must not match BOOTSTRAP_USER_EMAIL/,
    );
  });

  it('returns only the explicitly configured fixture identities', () => {
    assert.deepEqual(readDashboardFixtureEnvironment(validEnvironment), {
      populatedEmail: 'dashboard@fixture.test',
      emptyEmail: 'empty@fixture.test',
      password: 'local-only-password',
      userNamePrefix: 'FluxTrackr Dev',
    });
  });
});
