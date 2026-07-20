import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readDashboardFixtureEnvironment } from './dashboard-dev-fixture-environment';

const validEnvironment = {
  ALLOW_DEV_FIXTURES: 'true',
  DEV_FIXTURE_POPULATED_EMAIL: 'complete@fluxtrackr.test',
  DEV_FIXTURE_EMPTY_EMAIL: 'empty@fluxtrackr.test',
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

  it('accepts only normalized fixture emails in the reserved test domain', () => {
    assert.equal(readDashboardFixtureEnvironment({
      ...validEnvironment,
      DEV_FIXTURE_POPULATED_EMAIL: 'COMPLETE@FLUXTRACKR.TEST',
    }).populatedEmail, 'complete@fluxtrackr.test');

    for (const email of [
      'usuario@gmail.com',
      'usuario@empresa.com',
      'usuario@fluxtrackr.test.example.com',
      '@fluxtrackr.test',
      ' complete@fluxtrackr.test',
      'complete@fluxtrackr.test ',
    ]) {
      assert.throws(
        () => readDashboardFixtureEnvironment({ ...validEnvironment, DEV_FIXTURE_POPULATED_EMAIL: email }),
        /@fluxtrackr\.test/,
      );
    }
  });

  it('returns only the explicitly configured fixture identities', () => {
    assert.deepEqual(readDashboardFixtureEnvironment(validEnvironment), {
      populatedEmail: 'complete@fluxtrackr.test',
      emptyEmail: 'empty@fluxtrackr.test',
      password: 'local-only-password',
      userNamePrefix: 'FluxTrackr Dev',
    });
  });
});
