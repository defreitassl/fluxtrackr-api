import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bytesToMb,
  collectProcessResourceMetrics,
  measureJob,
  startResourceMetricsInterval,
} from './resource-metrics';

const MB = 1024 * 1024;

describe('resource metrics', () => {
  it('converts memory values to rounded megabytes', () => {
    assert.equal(bytesToMb(MB), 1);
    assert.equal(bytesToMb(MB * 1.235), 1.24);

    assert.deepEqual(
      collectProcessResourceMetrics(
        {
          rss: MB * 10,
          heapUsed: MB * 5,
          heapTotal: MB * 8,
          external: MB * 2,
          arrayBuffers: MB,
        },
        12.6,
        { user: 12_345, system: 678 },
      ),
      {
        rssMb: 10,
        heapUsedMb: 5,
        heapTotalMb: 8,
        externalMb: 2,
        arrayBuffersMb: 1,
        cpuUserMicros: 12_345,
        cpuSystemMicros: 678,
        uptimeSeconds: 13,
      },
    );
  });

  it('logs job success and failure without the error message', async () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const logger = { log: (message: string) => logs.push(message), error: (message: string) => errors.push(message) };

    await measureJob(logger, 'test_job', { origin: 'manual' }, async () => ({ processed: 2 }));
    const success = JSON.parse(logs[0]);
    assert.equal(success.result, 'success');
    assert.equal(success.processed, 2);

    await assert.rejects(
      () => measureJob(logger, 'test_job', { origin: 'manual' }, async () => { throw new Error('sensitive details'); }),
    );
    const failure = JSON.parse(errors[0]);
    assert.equal(failure.result, 'failure');
    assert.equal(failure.errorName, 'Error');
    assert.equal(errors[0].includes('sensitive details'), false);
  });

  it('does not schedule disabled metrics and unrefs enabled intervals', () => {
    const logger = { log: () => undefined, error: () => undefined };
    let scheduled = false;
    assert.equal(startResourceMetricsInterval(logger, 0, () => { scheduled = true; return {}; }), undefined);
    assert.equal(scheduled, false);

    let delay = 0;
    let unrefed = false;
    startResourceMetricsInterval(logger, 15, (_callback, value) => {
      delay = value;
      return { unref: () => { unrefed = true; } };
    });
    assert.equal(delay, 15 * 60_000);
    assert.equal(unrefed, true);
  });
});
