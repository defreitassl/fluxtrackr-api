type StructuredLogger = {
  log(message: string): unknown;
  error(message: string): unknown;
};

export type ProcessResourceMetrics = {
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  arrayBuffersMb: number;
  cpuUserMicros: number;
  cpuSystemMicros: number;
  uptimeSeconds: number;
};

export type JobMetadata = Record<
  string,
  string | number | boolean | null | undefined
>;

export type JobExecutionResult = JobMetadata & {
  result?: 'success' | 'skipped';
};

const BYTES_PER_MB = 1024 * 1024;

export function bytesToMb(bytes: number) {
  return Math.round((bytes / BYTES_PER_MB) * 100) / 100;
}

export function collectProcessResourceMetrics(
  memoryUsage: NodeJS.MemoryUsage = process.memoryUsage(),
  uptimeSeconds = process.uptime(),
  cpuUsage: NodeJS.CpuUsage = process.cpuUsage(),
): ProcessResourceMetrics {
  return {
    rssMb: bytesToMb(memoryUsage.rss),
    heapUsedMb: bytesToMb(memoryUsage.heapUsed),
    heapTotalMb: bytesToMb(memoryUsage.heapTotal),
    externalMb: bytesToMb(memoryUsage.external),
    arrayBuffersMb: bytesToMb(memoryUsage.arrayBuffers),
    cpuUserMicros: cpuUsage.user,
    cpuSystemMicros: cpuUsage.system,
    uptimeSeconds: Math.round(uptimeSeconds),
  };
}

export function logProcessResourceMetrics(
  logger: StructuredLogger,
  metadata: JobMetadata = {},
) {
  logger.log(
    JSON.stringify({
      event: 'process_resource_metrics',
      ...metadata,
      ...collectProcessResourceMetrics(),
    }),
  );
}

export async function measureJob<T extends JobExecutionResult>(
  logger: StructuredLogger,
  name: string,
  metadata: JobMetadata,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = new Date();
  const memoryBefore = collectProcessResourceMetrics();

  try {
    const result = await operation();
    logJob(logger, {
      event: 'job_execution',
      job: name,
      ...metadata,
      ...result,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      result: result.result ?? 'success',
      memoryBefore,
      memoryAfter: collectProcessResourceMetrics(),
    });
    return result;
  } catch (error) {
    logJob(logger, {
      event: 'job_execution',
      job: name,
      ...metadata,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      result: 'failure',
      errorName: error instanceof Error ? error.name : 'UnknownError',
      memoryBefore,
      memoryAfter: collectProcessResourceMetrics(),
    }, true);
    throw error;
  }
}

export function startResourceMetricsInterval(
  logger: StructuredLogger,
  intervalMinutes: number,
  createInterval: (
    callback: () => void,
    delay: number,
  ) => { unref?: () => unknown } = setInterval,
) {
  if (intervalMinutes === 0) {
    return undefined;
  }

  const interval = createInterval(
    () => logProcessResourceMetrics(logger, { origin: 'interval' }),
    intervalMinutes * 60_000,
  );
  interval.unref?.();
  return interval;
}

function logJob(
  logger: StructuredLogger,
  event: Record<string, unknown>,
  isError = false,
) {
  const message = JSON.stringify(event);

  if (isError) {
    logger.error(message);
    return;
  }

  logger.log(message);
}
