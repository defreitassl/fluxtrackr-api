import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ExclusiveJobRunner } from './exclusive-job-runner';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((currentResolve) => {
    resolve = currentResolve;
  });
  return { promise, resolve };
}

describe('ExclusiveJobRunner', () => {
  it('runs a job and returns its result', async () => {
    const runner = new ExclusiveJobRunner();

    const result = await runner.run('job', async () => ({ itemsProcessed: 2 }));

    assert.deepEqual(result, { itemsProcessed: 2 });
  });

  it('skips a concurrent execution of the same job', async () => {
    const runner = new ExclusiveJobRunner();
    const gate = deferred();
    let executions = 0;
    const first = runner.run('job', async () => {
      executions += 1;
      await gate.promise;
      return { itemsProcessed: 1 };
    });

    const second = await runner.run('job', async () => {
      executions += 1;
      return { itemsProcessed: 1 };
    });
    gate.resolve();

    assert.deepEqual(second, { result: 'skipped' });
    assert.deepEqual(await first, { itemsProcessed: 1 });
    assert.equal(executions, 1);
  });

  it('releases the job after a failure', async () => {
    const runner = new ExclusiveJobRunner();

    await assert.rejects(
      runner.run('job', async () => {
        throw new Error('failure');
      }),
    );

    const result = await runner.run('job', async () => ({ itemsProcessed: 1 }));
    assert.deepEqual(result, { itemsProcessed: 1 });
  });
});
