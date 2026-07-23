import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  loadEnvironment,
  parseIntegerInRange,
  parseNonNegativeInteger,
} from './env';

const required = {
  DATABASE_URL: 'postgresql://localhost/fluxtrackr',
  JWT_SECRET: 'long-random-secret',
};

describe('environment resource metrics configuration', () => {
  it('defaults the periodic metrics interval to zero', () => {
    assert.equal(loadEnvironment(required).resourceMetricsIntervalMinutes, 0);
  });

  it('accepts a positive periodic metrics interval', () => {
    assert.equal(
      loadEnvironment({ ...required, RESOURCE_METRICS_INTERVAL_MINUTES: '15' })
        .resourceMetricsIntervalMinutes,
      15,
    );
  });

  it('rejects negative and non-numeric intervals', () => {
    assert.throws(
      () => parseNonNegativeInteger('-1', 'RESOURCE_METRICS_INTERVAL_MINUTES', 0),
      /integer between 0 and/,
    );
    assert.throws(
      () => parseNonNegativeInteger('five', 'RESOURCE_METRICS_INTERVAL_MINUTES', 0),
      /integer between 0 and/,
    );
  });
});

describe('environment PostgreSQL pool configuration', () => {
  it('uses the safe pool defaults', () => {
    const environment = loadEnvironment(required);

    assert.equal(environment.databasePoolMax, 5);
    assert.equal(environment.databasePoolIdleTimeoutMs, 10_000);
    assert.equal(environment.databaseConnectionTimeoutMs, 5_000);
  });

  it('accepts valid pool values', () => {
    const environment = loadEnvironment({
      ...required,
      DATABASE_POOL_MAX: '10',
      DATABASE_POOL_IDLE_TIMEOUT_MS: '30000',
      DATABASE_CONNECTION_TIMEOUT_MS: '10000',
    });

    assert.equal(environment.databasePoolMax, 10);
    assert.equal(environment.databasePoolIdleTimeoutMs, 30_000);
    assert.equal(environment.databaseConnectionTimeoutMs, 10_000);
  });

  it('rejects invalid pool values', () => {
    assert.throws(
      () => parseIntegerInRange('0', 'DATABASE_POOL_MAX', 5, 1, 20),
      /integer between 1 and 20/,
    );
    assert.throws(
      () => parseIntegerInRange('-1', 'DATABASE_POOL_MAX', 5, 1, 20),
      /integer between 1 and 20/,
    );
    assert.throws(
      () => parseIntegerInRange('five', 'DATABASE_POOL_MAX', 5, 1, 20),
      /integer between 1 and 20/,
    );
    assert.throws(
      () => parseIntegerInRange('21', 'DATABASE_POOL_MAX', 5, 1, 20),
      /integer between 1 and 20/,
    );
    assert.throws(
      () => parseIntegerInRange('999999', 'DATABASE_POOL_IDLE_TIMEOUT_MS', 10_000, 1_000, 300_000),
      /integer between 1000 and 300000/,
    );
    assert.throws(
      () => parseIntegerInRange('0', 'DATABASE_CONNECTION_TIMEOUT_MS', 5_000, 1_000, 60_000),
      /integer between 1000 and 60000/,
    );
  });
});
