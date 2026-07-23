import { JobExecutionResult } from './resource-metrics';

export type SkippedJobResult = { result: 'skipped' };

export class ExclusiveJobRunner {
  private readonly runningJobs = new Set<string>();

  async run<T extends JobExecutionResult>(
    name: string,
    operation: () => Promise<T>,
  ): Promise<T | SkippedJobResult> {
    if (this.runningJobs.has(name)) {
      return { result: 'skipped' };
    }

    this.runningJobs.add(name);
    try {
      return await operation();
    } finally {
      this.runningJobs.delete(name);
    }
  }
}
