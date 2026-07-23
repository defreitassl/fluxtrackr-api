import { config } from 'dotenv';

config();

function requiredEnvironmentVariable(name: string, values: NodeJS.ProcessEnv) {
  const value = values[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseWebOrigins(value: string | undefined) {
  if (!value?.trim()) {
    return [];
  }

  return value.split(',').map((origin) => {
    const normalizedOrigin = origin.trim();

    try {
      return new URL(normalizedOrigin).origin;
    } catch {
      throw new Error(
        'WEB_ORIGIN must contain one or more comma-separated absolute origins',
      );
    }
  });
}

export function parseNonNegativeInteger(
  value: string | undefined,
  name: string,
  defaultValue: number,
) {
  return parseIntegerInRange(
    value,
    name,
    defaultValue,
    0,
    Number.MAX_SAFE_INTEGER,
  );
}

export function parseIntegerInRange(
  value: string | undefined,
  name: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
) {
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }

  return parsed;
}

export function loadEnvironment(values: NodeJS.ProcessEnv = process.env) {
  return {
    databaseUrl: requiredEnvironmentVariable('DATABASE_URL', values),
    jwtSecret: requiredEnvironmentVariable('JWT_SECRET', values),
    webOrigins: parseWebOrigins(values.WEB_ORIGIN),
    resourceMetricsIntervalMinutes: parseNonNegativeInteger(
      values.RESOURCE_METRICS_INTERVAL_MINUTES,
      'RESOURCE_METRICS_INTERVAL_MINUTES',
      0,
    ),
    databasePoolMax: parseIntegerInRange(
      values.DATABASE_POOL_MAX,
      'DATABASE_POOL_MAX',
      5,
      1,
      20,
    ),
    databasePoolIdleTimeoutMs: parseIntegerInRange(
      values.DATABASE_POOL_IDLE_TIMEOUT_MS,
      'DATABASE_POOL_IDLE_TIMEOUT_MS',
      10_000,
      1_000,
      300_000,
    ),
    databaseConnectionTimeoutMs: parseIntegerInRange(
      values.DATABASE_CONNECTION_TIMEOUT_MS,
      'DATABASE_CONNECTION_TIMEOUT_MS',
      5_000,
      1_000,
      60_000,
    ),
  };
}

export const environment = loadEnvironment();
